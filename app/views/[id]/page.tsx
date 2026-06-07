import { notFound } from "next/navigation";
import { BillFollowDashboard, MainDashboard, WithdrawDashboard, WorkStatusDashboard } from "@/components/Dashboards";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { ManageTableClient } from "@/components/ManageTableClient";
import { TABLE_KEYS } from "@/lib/config";
import { getFormPayload } from "@/lib/form";
import { getHeaders, getRows } from "@/lib/sheets";
import { getViewById, getViewColumns } from "@/lib/views";

export const dynamic = "force-dynamic";

type ViewPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ViewPage({ params, searchParams }: ViewPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const search = firstSearchParam(query?.search).trim();
  const view = getViewById(id);
  if (!view) notFound();
  const displayName = getDisplayViewName(view.id, view.name);

  return (
    <>
      <header className={getToolbarClassName(view.id)}>
        <div>
          <h2>{displayName}</h2>
          {search || (view.type !== "dashboard" && view.id !== "contract-open") ? <p>{search ? `ค้นหา: ${search}` : view.table || ""}</p> : null}
        </div>
      </header>
      {await renderView(view, search, query)}
    </>
  );
}

async function renderView(
  view: NonNullable<ReturnType<typeof getViewById>>,
  search: string,
  query?: Record<string, string | string[] | undefined>
) {
  if (view.id === "dashboard-main") return <MainDashboard />;
  if (view.id === "withdraw-request") {
    return (
      <WithdrawDashboard
        filters={{
          requester: firstSearchParam(query?.requester).trim(),
          date: firstSearchParam(query?.date).trim(),
          bill: firstSearchParam(query?.bill).trim(),
          search
        }}
      />
    );
  }
  if (view.id === "bill-follow") return <BillFollowDashboard />;
  if (view.id === "work-status") return <WorkStatusDashboard />;

  if (view.type === "table" && view.table) {
    const page = parsePositiveInt(firstSearchParam(query?.page), 1);
    const pageSize = parsePositiveInt(firstSearchParam(query?.pageSize), 80);
    const [rows, headers, form] = await Promise.all([
      safeRows(view.table, search),
      getHeaders(view.table).catch(() => []),
      view.id === "contract-open" ? getFormPayload(view.table).catch(() => null) : Promise.resolve(null)
    ]);
    const fallback = rows[0] ? Object.keys(rows[0]).filter(column => !column.startsWith("_")) : [];
    const columns = getViewColumns(view.name, fallback);
    if (view.position === "menu") {
      const keyColumn = TABLE_KEYS[view.table] || "_RowNumber";
      return (
        <section className={`content table-view table-view-${view.id} manage-view`}>
          <ManageTableClient
            tableName={view.table}
            viewName={view.name}
            columns={columns}
            formColumns={getManageFormColumns(columns, headers, keyColumn)}
            rows={rows}
            keyColumn={keyColumn}
            search={search}
            rowLabel="รายการ"
          />
        </section>
      );
    }

    return (
      <section className={`content table-view table-view-${view.id}`}>
        {view.id === "contract-open" ? (
          <div className="contract-compact-bar">
            <form className="contract-search-form" action={`/views/${view.id}`}>
              <label>
                <span>ค้นหา</span>
                <input name="search" type="search" defaultValue={search} placeholder="Project, ผู้รับเหมา, รายละเอียดงาน" />
              </label>
              <button type="submit" className="primary">ค้นหา</button>
              {search ? <a className="contract-clear-link" href={`/views/${view.id}`}>ล้าง</a> : null}
            </form>
            {form ? <FormModal form={form} relaxed openEventName="open-contract-form" /> : null}
          </div>
        ) : (
          form ? <FormModal form={form} relaxed={view.id === "contract-open"} openEventName={view.id === "contract-open" ? "open-contract-form" : undefined} /> : null
        )}
        <DataTable
          columns={columns}
          rows={rows}
          title={view.name}
          subtitle={search ? `Search: ${search}` : view.id === "contract-open" ? undefined : view.table}
          pagination={view.id === "contract-open" ? {
            page,
            pageSize,
            basePath: `/views/${view.id}`,
            query: { search: search || undefined },
            pageSizeOptions: [50, 80, 100, 200]
          } : undefined}
        />
      </section>
    );
  }

  return <section className="content panel">ยังไม่ได้ตั้งค่าหน้านี้</section>;
}

async function safeRows(tableName: string, search = "") {
  try {
    const rows = await getRows(tableName);
    if (!search) return rows;
    const query = search.toLowerCase();
    return rows.filter(row => Object.values(row).some(value => String(value || "").toLowerCase().includes(query)));
  } catch {
    return [];
  }
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

function getToolbarClassName(viewId: string) {
  if (viewId === "withdraw-request") return "toolbar withdraw-request-toolbar";
  if (viewId === "contract-open") return "toolbar contract-open-toolbar";
  if (viewId === "bill-follow") return "toolbar bill-follow-toolbar";
  if (viewId === "work-status") return "toolbar work-status-toolbar";
  return "toolbar";
}

function getDisplayViewName(viewId: string, fallback: string) {
  if (viewId === "work-status") return "สถานะงาน";
  return fallback;
}

function getManageFormColumns(columns: string[], headers: string[], keyColumn: string) {
  const available = headers.length ? headers : columns;
  const candidates = [keyColumn, ...columns];
  return [...new Set(candidates)].filter(column => {
    if (!column || column === "_sheetRow" || column === "_RowNumber") return false;
    return available.includes(column);
  });
}

