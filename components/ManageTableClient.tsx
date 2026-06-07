"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { RowValue, SheetRow } from "@/lib/types";

type BusyState = "add" | "edit" | "delete" | null;

type ManageTableClientProps = {
  tableName: string;
  viewName: string;
  columns: string[];
  formColumns: string[];
  rows: SheetRow[];
  keyColumn: string;
  search?: string;
  rowLabel?: string;
};

export function ManageTableClient({
  tableName,
  viewName,
  columns,
  formColumns,
  rows: initialRows,
  keyColumn,
  search = "",
  rowLabel = "รายการ"
}: ManageTableClientProps) {
  const visibleColumns = useMemo(() => columns.filter(column => column !== "_sheetRow"), [columns]);
  const addColumns = useMemo(() => formColumns.filter(column => column !== "_sheetRow"), [formColumns]);
  const [rows, setRows] = useState<SheetRow[]>(initialRows);
  const [addOpen, setAddOpen] = useState(false);
  const [addValues, setAddValues] = useState<Record<string, string>>(() => emptyValues(addColumns));
  const [editing, setEditing] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [draftRows, setDraftRows] = useState<Record<string, Record<string, string>>>({});
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setAddValues(emptyValues(addColumns));
  }, [addColumns]);

  async function reloadRows() {
    const params = new URLSearchParams({
      tableName,
      viewName,
      limit: "1000"
    });
    if (search) params.set("search", search);
    const response = await fetch(`/api/rows?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ");
    setRows(payload.rows || []);
  }

  function openAddForm() {
    setError("");
    setAddValues(emptyValues(addColumns));
    setAddOpen(true);
  }

  async function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("add");
    setError("");
    try {
      await requestJson("/api/rows", {
        method: "POST",
        body: JSON.stringify({ tableName, row: addValues })
      });
      setAddOpen(false);
      await reloadRows();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เพิ่มข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  function beginEdit() {
    setError("");
    setDeleteMode(false);
    setSelectedRows([]);
    setDraftRows(Object.fromEntries(rows.map((row, index) => [rowId(row, index, keyColumn), draftFromRow(row, visibleColumns)])));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraftRows({});
    setError("");
  }

  function updateDraft(id: string, column: string, value: string) {
    setDraftRows(current => ({
      ...current,
      [id]: {
        ...(current[id] || {}),
        [column]: value
      }
    }));
  }

  async function saveEdit() {
      const changedRows = rows.flatMap((row, index) => {
      const id = rowId(row, index, keyColumn);
      const draft = draftRows[id];
      const sheetRow = Number(row._sheetRow);
      if (!draft || !Number.isInteger(sheetRow)) return [];
      const values = changedValues(row, draft, visibleColumns);
      return Object.keys(values).length ? [{ sheetRow, values }] : [];
    });

    if (!changedRows.length) {
      setEditing(false);
      setDraftRows({});
      return;
    }

    setBusy("edit");
    setError("");
    try {
      for (const changedRow of changedRows) {
        await requestJson("/api/rows", {
          method: "PATCH",
          body: JSON.stringify({ tableName, sheetRow: changedRow.sheetRow, values: changedRow.values })
        });
      }
      setEditing(false);
      setDraftRows({});
      await reloadRows();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  function beginDelete() {
    setError("");
    setEditing(false);
    setDraftRows({});
    setSelectedRows([]);
    setDeleteMode(true);
  }

  function toggleSelected(sheetRow: number) {
    setSelectedRows(current => current.includes(sheetRow) ? current.filter(row => row !== sheetRow) : [...current, sheetRow]);
  }

  async function confirmDelete() {
    if (!selectedRows.length) {
      setError("เลือกแถวที่ต้องการลบก่อน");
      return;
    }
    if (!window.confirm(`ลบ ${selectedRows.length} ${rowLabel}?`)) return;

    setBusy("delete");
    setError("");
    try {
      await requestJson("/api/rows", {
        method: "DELETE",
        body: JSON.stringify({ tableName, sheetRows: selectedRows })
      });
      setDeleteMode(false);
      setSelectedRows([]);
      await reloadRows();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ลบข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="panel table-shell manage-table-shell">
        <div className="table-toolbar manage-toolbar">
          <div>
            <h3>{viewName}</h3>
            <span>{search ? `Search: ${search}` : tableName}</span>
          </div>
          <div className="manage-actions">
            <strong>{rows.length} {rowLabel}</strong>
            <button type="button" className="primary" disabled={Boolean(busy)} onClick={openAddForm}>
              <Plus size={15} />
              <span>เพิ่ม</span>
            </button>
            {editing ? (
              <>
                <button type="button" className="primary" disabled={busy === "edit"} onClick={saveEdit}>
                  <Save size={15} />
                  <span>บันทึก</span>
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={cancelEdit}>
                  <X size={15} />
                  <span>ยกเลิก</span>
                </button>
              </>
            ) : (
              <button type="button" disabled={Boolean(busy) || !rows.length} onClick={beginEdit}>
                <Pencil size={15} />
                <span>แก้ไข</span>
              </button>
            )}
            {deleteMode ? (
              <>
                <button type="button" className="danger-button" disabled={busy === "delete" || !selectedRows.length} onClick={confirmDelete}>
                  <Trash2 size={15} />
                  <span>ลบที่เลือก</span>
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => { setDeleteMode(false); setSelectedRows([]); }}>
                  <X size={15} />
                  <span>ยกเลิก</span>
                </button>
              </>
            ) : (
              <button type="button" className="danger-button" disabled={Boolean(busy) || !rows.length} onClick={beginDelete}>
                <Trash2 size={15} />
                <span>ลบ</span>
              </button>
            )}
          </div>
        </div>
        {error ? <div className="manage-error">{error}</div> : null}
        {rows.length ? (
          <div className="manage-table-wrap">
            <table className={editing ? "manage-table is-editing" : "manage-table"}>
              <thead>
                <tr>
                  {deleteMode ? <th className="manage-select-col"></th> : null}
                  {visibleColumns.map(column => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const id = rowId(row, index, keyColumn);
                  const sheetRow = Number(row._sheetRow);
                  return (
                    <tr key={id}>
                      {deleteMode ? (
                        <td className="manage-select-col" data-label="เลือก">
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(sheetRow)}
                            disabled={!Number.isInteger(sheetRow) || Boolean(busy)}
                            onChange={() => toggleSelected(sheetRow)}
                          />
                        </td>
                      ) : null}
                      {visibleColumns.map(column => {
                        const draftValue = draftRows[id]?.[column] ?? stringify(row[column]);
                        return (
                          <td key={column} className={isAmountColumn(column) ? "numeric-cell" : undefined} data-label={column}>
                            {editing ? (
                              <input
                                className="manage-cell-input"
                                value={draftValue}
                                disabled={Boolean(busy)}
                                onChange={event => updateDraft(id, column, event.target.value)}
                              />
                            ) : (
                              formatValue(row[column])
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">ไม่พบข้อมูล</div>
        )}
      </div>

      {addOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card manage-modal" role="dialog" aria-modal="true" aria-labelledby="manage-add-title" onSubmit={submitAdd}>
            <header className="modal-header">
              <div>
                <h3 id="manage-add-title">เพิ่มข้อมูล</h3>
                <span>{viewName}</span>
              </div>
              <button type="button" className="icon-button" aria-label="ปิด" disabled={Boolean(busy)} onClick={() => setAddOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="modal-body">
              <div className="manage-form-grid">
                {addColumns.map(column => (
                  <label className="manage-form-field" key={column}>
                    <span>{column}</span>
                    <input
                      name={column}
                      value={addValues[column] || ""}
                      disabled={Boolean(busy)}
                      onChange={event => setAddValues(current => ({ ...current, [column]: event.target.value }))}
                    />
                  </label>
                ))}
              </div>
              {error ? <div className="manage-error manage-error-modal">{error}</div> : null}
            </div>
            <footer className="modal-footer">
              <button type="button" disabled={Boolean(busy)} onClick={() => setAddOpen(false)}>ยกเลิก</button>
              <button type="submit" className="primary" disabled={busy === "add"}>
                <Save size={16} />
                <span>บันทึก</span>
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}

function emptyValues(columns: string[]) {
  return Object.fromEntries(columns.map(column => [column, ""]));
}

function rowId(row: SheetRow, index: number, keyColumn: string) {
  return String(row._sheetRow ?? row[keyColumn] ?? index);
}

function draftFromRow(row: SheetRow, columns: string[]) {
  return Object.fromEntries(columns.map(column => [column, stringify(row[column])]));
}

function changedValues(row: SheetRow, draft: Record<string, string>, columns: string[]) {
  return Object.fromEntries(
    columns
      .filter(column => stringify(row[column]) !== (draft[column] ?? ""))
      .map(column => [column, draft[column] ?? ""])
  );
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "ดำเนินการไม่สำเร็จ");
  return payload;
}

function stringify(value: RowValue | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatValue(value: RowValue | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  return String(value);
}

function isAmountColumn(column: string) {
  return /ยอด|เงิน|ราคา|vat|หัก|เครดิต|ค่าแรง|รวม|คงเหลือ|โอน|งบ/.test(column);
}
