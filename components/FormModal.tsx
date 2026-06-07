"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, X } from "lucide-react";
import type { FieldSchema, RefOption, SheetRow } from "@/lib/types";

type FormPayload = {
  tableName: string;
  schema: FieldSchema[];
  initialValues: SheetRow;
  refOptions: Record<string, RefOption[]>;
};

type FormModalProps = {
  form: FormPayload;
  title?: string;
  buttonLabel?: string;
  relaxed?: boolean;
  submitPath?: string;
  openEventName?: string;
};

export function FormModal({ form, title = "เพิ่มข้อมูล", buttonLabel = "เพิ่มรายการ", relaxed = false, submitPath, openEventName }: FormModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => getInitialStringValues(form));
  const [enumListSearch, setEnumListSearch] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const visibleFields = form.schema.filter(field => field.type !== "Hidden" && isFieldVisible(field, values));

  useEffect(() => {
    if (!openEventName) return;
    const openFromExternalButton = () => setOpen(true);
    window.addEventListener(openEventName, openFromExternalButton);
    return () => window.removeEventListener(openEventName, openFromExternalButton);
  }, [openEventName]);

  function updateValue(field: FieldSchema, value: string) {
    setValues(current => {
      const next = { ...current, [field.name]: value };
      applyRefFill(next, field, form, value);
      normalizeDependentValues(next, field.name, form);
      return next;
    });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitPath) return;

    const formElement = event.currentTarget;
    const body = new FormData();
    body.set("tableName", form.tableName);
    Object.entries(values).forEach(([key, value]) => body.append(key, value));

    formElement.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(input => {
      const file = input.files?.[0];
      if (file && file.size > 0) body.set(input.name, file);
    });

    setSaving(true);
    setError("");
    try {
      const response = await fetch(submitPath, {
        method: "POST",
        body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      setOpen(false);
      setValues(getInitialStringValues(form));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={open ? "module-bar module-bar-hidden" : "module-bar"}>
        <button type="button" className="primary module-open-button" onClick={() => setOpen(true)}>
          <Plus size={16} />
          <span>{buttonLabel}</span>
        </button>
      </div>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <form className={relaxed ? "modal-card modal-card-relaxed" : "modal-card"} role="dialog" aria-modal="true" aria-labelledby="form-modal-title" onSubmit={submitForm}>
            <header className="modal-header">
              <div>
                <h3 id="form-modal-title">{title}</h3>
                <span>{form.tableName}</span>
              </div>
              <button type="button" className="icon-button" aria-label="ปิด" disabled={saving} onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="modal-body">
              <div className="form-grid">
                {visibleFields.map(field => (
                  <div className={getFieldClassName(field)} key={field.name}>
                    <label>{field.name}{field.required ? " *" : ""}</label>
                    {renderField(
                      field,
                      form,
                      values[field.name] || "",
                      values,
                      value => updateValue(field, value),
                      enumListSearch[field.name] || "",
                      value => setEnumListSearch(current => ({ ...current, [field.name]: value }))
                    )}
                    {field.description ? <small>{field.description}</small> : null}
                  </div>
                ))}
              </div>
              {error ? <div className="form-error">{error}</div> : null}
            </div>
            <footer className="modal-footer">
              <button type="button" disabled={saving} onClick={() => setOpen(false)}>ยกเลิก</button>
              <button type={submitPath ? "submit" : "button"} className="primary" disabled={saving || !submitPath}>
                <Save size={16} />
                <span>{saving ? "กำลังบันทึก" : "บันทึก"}</span>
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}

function renderField(
  field: FieldSchema,
  form: FormPayload,
  value: string,
  currentValues: Record<string, string>,
  onChange: (value: string) => void,
  enumSearchValue = "",
  onEnumSearchChange: (value: string) => void = () => {}
) {
  if (field.type === "Image" || field.type === "File") {
    return (
      <div className="file-control">
        <input
          type="file"
          name={field.name}
          accept={field.type === "Image" ? "image/*" : undefined}
          disabled={field.readonly}
        />
        {field.type === "Image" ? <small>บนมือถือเลือกถ่ายรูปหรือแนบจากเครื่องได้</small> : null}
      </div>
    );
  }

  if (field.type === "Ref" || field.type === "Enum" || field.type === "EnumList") {
    const options = getFieldOptions(field, form, currentValues);
    if (field.type === "EnumList") {
      const selectedValues = splitEnumListValue(value);
      const optionValues = new Set(options.map(option => String(option.value)));
      const selectedOptionValues = selectedValues.filter(item => optionValues.has(item));
      const customValue = selectedValues.filter(item => !optionValues.has(item)).join(", ");
      const normalizedSearch = enumSearchValue.trim().toLowerCase();
      const filteredOptions = normalizedSearch
        ? options.filter(option => `${String(option.value)} ${String(option.label)}`.toLowerCase().includes(normalizedSearch))
        : options;

      function setSelectedValues(nextValues: string[], nextCustomValue = customValue) {
        const customItems = splitEnumListValue(nextCustomValue);
        onChange([...new Set([...nextValues, ...customItems].filter(Boolean))].join(", "));
      }

      function removeSelectedValue(selectedValue: string) {
        setSelectedValues(
          selectedOptionValues.filter(item => item !== selectedValue),
          splitEnumListValue(customValue).filter(item => item !== selectedValue).join(", ")
        );
      }

      return (
        <div className="enum-list-control">
          <input type="hidden" name={field.name} value={value} />
          <div className="enum-list-summary">
            <div className="enum-list-selected" aria-live="polite">
              {selectedValues.length ? (
                selectedValues.map((selectedValue, index) => (
                  <span className="enum-token" key={`${selectedValue}-${index}`}>
                    <span>{selectedValue}</span>
                    {!field.readonly ? (
                      <button type="button" aria-label={`ลบ ${selectedValue}`} onClick={() => removeSelectedValue(selectedValue)}>
                        <X size={12} />
                      </button>
                    ) : null}
                  </span>
                ))
              ) : (
                <span className="enum-list-placeholder">ยังไม่ได้เลือก</span>
              )}
            </div>
            <span className="enum-list-count">{selectedValues.length} / {options.length}</span>
          </div>
          <input
            type="search"
            className="enum-list-search"
            value={enumSearchValue}
            readOnly={field.readonly}
            placeholder="ค้นหารายละเอียดงาน"
            onChange={event => onEnumSearchChange(event.target.value)}
          />
          <div className="enum-list-options" role="group" aria-label={field.name}>
            {filteredOptions.map(option => {
              const optionValue = String(option.value);
              const checked = selectedValues.includes(optionValue);
              return (
                <label className={checked ? "enum-list-option is-active" : "enum-list-option"} key={optionValue}>
                  <input
                    type="checkbox"
                    value={optionValue}
                    checked={checked}
                    disabled={field.readonly}
                    onChange={event => {
                      const nextValues = event.target.checked
                        ? [...selectedOptionValues, optionValue]
                        : selectedOptionValues.filter(item => item !== optionValue);
                      setSelectedValues(nextValues);
                    }}
                  />
                  <span>{String(option.label)}</span>
                </label>
              );
            })}
            {!filteredOptions.length ? <div className="enum-list-empty">ไม่พบรายการ</div> : null}
          </div>
          <input
            type="text"
            className="enum-list-custom"
            value={customValue}
            readOnly={field.readonly}
            placeholder="เพิ่มงานอื่น คั่นด้วย comma"
            onChange={event => setSelectedValues(selectedOptionValues, event.target.value)}
          />
        </div>
      );
    }

    if (field.inputMode === "buttons") {
      return (
        <div className="choice-grid" role="radiogroup" aria-label={field.name}>
          {options.map(option => {
            const optionValue = String(option.value);
            const checked = value === optionValue;
            return (
              <label className={checked ? "choice-option is-active" : "choice-option"} key={optionValue}>
                <input
                  type="radio"
                  name={field.name}
                  value={optionValue}
                  checked={checked}
                  disabled={field.readonly}
                  onChange={event => onChange(event.target.value)}
                />
                <span>{String(option.label)}</span>
              </label>
            );
          })}
        </div>
      );
    }

    return (
      <select name={field.name} value={value} disabled={field.readonly} onChange={event => onChange(event.target.value)}>
        <option value=""></option>
        {options.map(option => (
          <option key={String(option.value)} value={String(option.value)}>
            {String(option.label)}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "LongText") {
    return (
      <textarea
        name={field.name}
        value={value}
        readOnly={field.readonly}
        rows={3}
        onChange={event => onChange(event.target.value)}
      />
    );
  }

  const type = field.type === "Date" ? "date" : field.type === "Decimal" || field.type === "Number" ? "number" : "text";
  return (
    <input
      type={type}
      name={field.name}
      value={value}
      readOnly={field.readonly || field.readonlyOnEdit}
      onChange={event => onChange(event.target.value)}
    />
  );
}

function getInitialStringValues(form: FormPayload) {
  return Object.fromEntries(form.schema.map(field => [field.name, String(form.initialValues[field.name] ?? "")]));
}

function splitEnumListValue(value: string) {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function getFieldOptions(field: FieldSchema, form: FormPayload, values: Record<string, string>) {
  if (field.type === "Ref") {
    return filterRefOptions(field, form.refOptions[field.name] || [], values);
  }

  return getEnumValues(field, values).map(value => ({ value, label: value }));
}

function filterRefOptions(field: FieldSchema, options: RefOption[], values: Record<string, string>) {
  if (!field.filterBy) return options;
  const expectedValue = values[field.filterBy.field] || "";
  return options.filter(option => {
    if (expectedValue && String(option.row?.[field.filterBy!.column] ?? "") !== expectedValue) return false;
    if (!field.filterBy!.openContract) return true;
    return toNumber(option.row?.["ยอดเงินจ้าง"]) > toNumber(option.row?.["ยอดเงินจ่าย"]);
  });
}

function getEnumValues(field: FieldSchema, values: Record<string, string>) {
  if (field.dynamicValues !== "billTypeOptions" || !field.dynamicOptionSets) return field.values || [];
  if (values["ร้านค้า/ผู้รับเหมา"] === "ผู้รับเหมา") return field.dynamicOptionSets.contractor || field.values || [];
  if (values["สินค้า"]) return field.dynamicOptionSets.storeWithItem || field.values || [];
  return field.dynamicOptionSets.storeDefault || field.values || [];
}

function normalizeDependentValues(values: Record<string, string>, changedField: string, form: FormPayload) {
  if (changedField === "ร้านค้า/ผู้รับเหมา") {
    if (values[changedField] === "ร้านค้า") {
      values["ผู้รับเหมา"] = "";
      values["รายละเอียดงาน"] = "";
      values["ค่าแรงคงเหลือ"] = "";
    } else {
      values["ร้านค้า"] = "";
      values["สินค้า"] = "";
    }
    values["ประเภท"] = "";
  }

  if (changedField === "สินค้า") values["ประเภท"] = "";

  const typeField = form.schema.find(field => field.name === "ประเภท");
  if (typeField && values["ประเภท"] && !getEnumValues(typeField, values).includes(values["ประเภท"])) {
    values["ประเภท"] = "";
  }
}

function applyRefFill(values: Record<string, string>, field: FieldSchema, form: FormPayload, value: string) {
  if (field.type !== "Ref" || !field.refFill) return;
  const selectedOption = (form.refOptions[field.name] || []).find(option => String(option.value) === value);
  Object.entries(field.refFill).forEach(([targetField, sourceColumn]) => {
    values[targetField] = selectedOption ? String(selectedOption.row?.[sourceColumn] ?? "") : "";
  });
}

function isFieldVisible(field: FieldSchema, values: Record<string, string>) {
  if (!field.showIf) return true;
  const actual = values[field.showIf.column] || "";
  if (field.showIf.equals !== undefined) return actual === field.showIf.equals;
  if (field.showIf.in) return field.showIf.in.includes(actual);
  return true;
}

function getFieldClassName(field: FieldSchema) {
  const classes = ["field"];
  if (field.type === "LongText" || field.type === "Image" || field.type === "File") classes.push("field-wide");
  if (field.type === "EnumList") classes.push("field-wide field-enum-list");
  if (field.name === "ร้านค้า/ผู้รับเหมา") classes.push("field-wide field-vendor-mode");
  if (field.readonly || field.readonlyOnEdit) classes.push("field-readonly");
  if (field.required) classes.push("field-required");
  if (field.inputMode === "buttons") classes.push("field-choice");
  return classes.join(" ");
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}
