import { TABLES, VIEW_COLUMNS } from "@/lib/config";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { getFormPayload } from "@/lib/form";
import { getRows } from "@/lib/sheets";
import type { SheetRow } from "@/lib/types";

export const dynamic = "force-dynamic";

type BillsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BillsPage({ searchParams }: BillsPageProps) {
  const query = await searchParams;
  const search = firstSearchParam(query?.search).trim();
  const page = parsePositiveInt(firstSearchParam(query?.page), 1);
  const pageSize = parsePositiveInt(firstSearchParam(query?.pageSize), 80);
  const viewName = "กรอกบิล";
  const columns = VIEW_COLUMNS[viewName];
  const [allRows, form] = await Promise.all([
    safeRows(TABLES.DATA),
    getFormPayload(TABLES.DATA).catch(() => null)
  ]);
  const rows = filterRows(sortLatestFirst(nonEmptyRows(allRows, columns)), search);

  return (
    <>
      <header className="toolbar bill-entry-toolbar">
        <div>
          <h2>{viewName}</h2>
          {search ? <p>ค้นหา: {search}</p> : null}
        </div>
      </header>
      <section className="content table-view bills-view">
        <div className="bills-compact-bar">
          <form className="bills-search-form" action="/bills">
            <label>
              <span>ค้นหาบิล</span>
              <input name="search" type="search" defaultValue={search} placeholder="Project, ร้าน, รายการ, ผู้เบิก" />
            </label>
            <button type="submit" className="primary">ค้นหา</button>
            {search ? <a className="bills-clear-link" href="/bills">ล้าง</a> : null}
          </form>
          {form ? <FormModal form={form} title="เพิ่มบิล" buttonLabel="เพิ่มบิล" submitPath="/api/bills" openEventName="open-bill-form" /> : null}
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          title="รายการบิล"
          subtitle={search ? `Search: ${search}` : undefined}
          rowLabel="รายการ"
          pagination={{
            page,
            pageSize,
            basePath: "/bills",
            query: { search: search || undefined },
            pageSizeOptions: [50, 80, 100, 200]
          }}
        />
      </section>
    </>
  );
}

async function safeRows(tableName: string): Promise<SheetRow[]> {
  try {
    return await getRows(tableName);
  } catch {
    return [];
  }
}

function filterRows(rows: SheetRow[], search: string) {
  if (!search) return rows;
  const query = search.toLowerCase();
  return rows.filter(row => Object.values(row).some(value => String(value || "").toLowerCase().includes(query)));
}

function nonEmptyRows(rows: SheetRow[], columns: string[]) {
  const primaryColumns = columns.slice(0, 3);
  return rows.filter(row => primaryColumns.some(column => {
    const value = row[column];
    return value !== null && value !== undefined && String(value).trim() !== "";
  }));
}

function sortLatestFirst(rows: SheetRow[]) {
  return [...rows].sort((left, right) => latestRowValue(right) - latestRowValue(left));
}

function latestRowValue(row: SheetRow) {
  const sheetRow = Number(row._sheetRow || 0);
  if (Number.isFinite(sheetRow) && sheetRow > 0) return sheetRow;
  const sequence = Number(row["ลำดับ"] || row["à¸¥à¸³à¸”à¸±à¸š"] || 0);
  return Number.isFinite(sequence) ? sequence : 0;
}

function firstSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.trunc(parsed);
}
