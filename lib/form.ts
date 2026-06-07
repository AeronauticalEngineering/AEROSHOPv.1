import { TABLES } from "@/lib/config";
import { getRows, listRefOptions } from "@/lib/sheets";
import { getFormSchema, getRefRowColumns } from "@/lib/schemas";
import type { FieldSchema } from "@/lib/types";
import type { SheetRow } from "@/lib/types";

export async function getFormPayload(tableName: string) {
  const schema = await getFormSchemaWithSheetOptions(tableName);
  const refEntries = await Promise.all(
    schema
      .filter(column => column.type === "Ref" && column.refTable)
      .map(async column => [
        column.name,
        await listRefOptions(column.refTable!, {
          keyColumn: column.refKey,
          labelColumn: column.refLabel,
          validIf: column.validIf,
          rowColumns: getRefRowColumns(column)
        })
      ] as const)
  );

  return {
    tableName,
    schema,
    initialValues: await getInitialValues(tableName),
    refOptions: Object.fromEntries(refEntries)
  };
}

async function getFormSchemaWithSheetOptions(tableName: string): Promise<FieldSchema[]> {
  const schema = getFormSchema(tableName);
  const enumListFields = schema.filter(field => field.type === "EnumList");
  const hasBillTypeOptions = schema.some(field => field.dynamicValues === "billTypeOptions");
  if (!enumListFields.length && !hasBillTypeOptions) return schema;

  const [rows, categoryRows] = await Promise.all([
    enumListFields.length ? getRows(tableName, 120_000).catch(() => []) : Promise.resolve([]),
    hasBillTypeOptions ? getRows(TABLES.CATEGORY, 120_000).catch(() => []) : Promise.resolve([])
  ]);
  const billTypeOptionSets = hasBillTypeOptions ? getBillTypeOptionSets(categoryRows) : undefined;
  return schema.map(field => {
    if (field.dynamicValues === "billTypeOptions" && billTypeOptionSets) {
      return {
        ...field,
        values: unique([
          ...(field.values || []),
          ...billTypeOptionSets.contractor,
          ...billTypeOptionSets.storeDefault,
          ...billTypeOptionSets.storeWithItem
        ]),
        dynamicOptionSets: billTypeOptionSets
      };
    }
    if (field.type !== "EnumList") return field;
    return {
      ...field,
      values: unique([...(field.values || []), ...extractEnumListValues(rows, field.name)])
    };
  });
}

function extractEnumListValues(rows: SheetRow[], columnName: string) {
  return rows.flatMap(row => splitEnumListValue(String(row[columnName] || "")));
}

function splitEnumListValue(value: string) {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function getBillTypeOptionSets(rows: SheetRow[]) {
  return {
    contractor: unique(rows.map(row => String(row["ประเภท Name1"] || ""))),
    storeDefault: unique(rows.map(row => String(row["ประเภท Name2"] || ""))),
    storeWithItem: unique(rows.map(row => String(row["ประเภท Name3"] || "")))
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export async function getInitialValues(tableName: string): Promise<SheetRow> {
  const values: SheetRow = {};
  for (const column of getFormSchema(tableName)) {
    if (!column.initialValue) continue;
    if (column.initialValue === "today") values[column.name] = new Date().toISOString().slice(0, 10);
    if (column.initialValue === "nextDataSequence") values[column.name] = String(await nextDataSequence());
    if (column.initialValue === "nextContractWorkId") values[column.name] = await nextContractWorkId();
    if (!values[column.name]) values[column.name] = column.initialValue;
  }
  return values;
}

async function nextDataSequence() {
  const rows = await getRows(TABLES.DATA, 15_000);
  return rows.reduce((max, row) => {
    const first = Number(row["ลำดับtest"] || 0);
    const second = Number(row["ลำดับ"] || 0);
    return Math.max(max, first, second);
  }, 0) + 1;
}

async function nextContractWorkId() {
  const rows = await getRows(TABLES.CONTRACT_WORK, 15_000);
  const next = rows.reduce((max, row) => {
    const value = String(row.id_Conwork || "");
    const match = value.match(/(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0) + 1;
  return `CW${next}`;
}
