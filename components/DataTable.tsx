import Link from "next/link";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import type { ReactNode } from "react";
import { BillImageThumbnail } from "@/components/BillImageThumbnail";
import type { SheetRow } from "@/lib/types";

type DataTableProps = {
  columns: string[];
  rows: SheetRow[];
  limit?: number;
  title?: string;
  subtitle?: string;
  rowLabel?: string;
  pagination?: {
    page: number;
    pageSize: number;
    basePath: string;
    query?: Record<string, string | undefined>;
    pageSizeOptions?: number[];
  };
};

const DEFAULT_PAGE_SIZE_OPTIONS = [50, 80, 100, 200];

export function DataTable({ columns, rows, limit = 80, title = "Data", subtitle, rowLabel = "rows", pagination }: DataTableProps) {
  const totalRows = rows.length;
  const pageSize = pagination ? clampPageSize(pagination.pageSize, pagination.pageSizeOptions) : limit;
  const totalPages = pagination ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
  const currentPage = pagination ? clampPage(pagination.page, totalPages) : 1;
  const startIndex = pagination ? (currentPage - 1) * pageSize : 0;
  const visibleRows = pagination ? rows.slice(startIndex, startIndex + pageSize) : rows.slice(0, limit);
  const displayStart = visibleRows.length ? startIndex + 1 : 0;
  const displayEnd = startIndex + visibleRows.length;

  return (
    <div className="panel table-shell">
      <div className="table-toolbar">
        <div>
          <h3>{title}</h3>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        <strong>{pagination ? `${displayStart}-${displayEnd} / ${totalRows}` : `${visibleRows.length}${rows.length > visibleRows.length ? ` / ${rows.length}` : ""}`} {rowLabel}</strong>
      </div>
      {visibleRows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{columns.map(column => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={String(row._sheetRow || row[columns[0]] || index)}>
                  {columns.map(column => (
                    <td key={column} className={isAmountColumn(column) ? "numeric-cell" : undefined} data-label={column}>
                      {renderCell(column, row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">ไม่พบข้อมูล</div>
      )}
      {pagination ? (
        <TablePagination
          basePath={pagination.basePath}
          currentPage={currentPage}
          pageSize={pageSize}
          pageSizeOptions={pagination.pageSizeOptions || DEFAULT_PAGE_SIZE_OPTIONS}
          query={pagination.query || {}}
          rowLabel={rowLabel}
          totalPages={totalPages}
          totalRows={totalRows}
          visibleEnd={displayEnd}
          visibleStart={displayStart}
        />
      ) : null}
    </div>
  );
}

function TablePagination({
  basePath,
  currentPage,
  pageSize,
  pageSizeOptions,
  query,
  rowLabel,
  totalPages,
  totalRows,
  visibleEnd,
  visibleStart
}: {
  basePath: string;
  currentPage: number;
  pageSize: number;
  pageSizeOptions: number[];
  query: Record<string, string | undefined>;
  rowLabel: string;
  totalPages: number;
  totalRows: number;
  visibleEnd: number;
  visibleStart: number;
}) {
  const pages = pageWindow(currentPage, totalPages);
  return (
    <div className="table-pagination" aria-label="pagination">
      <div className="pagination-summary">
        <span className="pagination-summary-full">แสดง {visibleStart}-{visibleEnd} จาก {totalRows} {rowLabel}</span>
        <span className="pagination-summary-compact" aria-label={`แสดง ${visibleStart}-${visibleEnd} จาก ${totalRows} ${rowLabel}`}>
          {visibleStart}-{visibleEnd}/{totalRows}
        </span>
        <div className="page-size-switch" aria-label="rows per page">
          <span className="page-size-label">
            <List size={15} aria-hidden="true" />
            <span>ต่อหน้า</span>
          </span>
          {pageSizeOptions.map(option => (
            <Link
              key={option}
              className={option === pageSize ? "active" : ""}
              href={tableHref(basePath, query, 1, option)}
              aria-current={option === pageSize ? "true" : undefined}
            >
              {option}
            </Link>
          ))}
        </div>
      </div>
      <nav className="pagination-controls" aria-label="table pages">
        <PageLink className="pagination-prev" disabled={currentPage <= 1} href={tableHref(basePath, query, currentPage - 1, pageSize)}>
          <ChevronLeft className="pagination-link-icon" size={15} aria-hidden="true" />
          <span className="pagination-link-text">ก่อนหน้า</span>
        </PageLink>
        {pages.map((page, index) => (
          page === "ellipsis" ? (
            <span className="page-ellipsis" key={`ellipsis-${index}`}>...</span>
          ) : (
            <Link
              key={page}
              className={page === currentPage ? "active" : ""}
              href={tableHref(basePath, query, page, pageSize)}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </Link>
          )
        ))}
        <PageLink className="pagination-next" disabled={currentPage >= totalPages} href={tableHref(basePath, query, currentPage + 1, pageSize)}>
          <span className="pagination-link-text">ถัดไป</span>
          <ChevronRight className="pagination-link-icon" size={15} aria-hidden="true" />
        </PageLink>
      </nav>
    </div>
  );
}

function PageLink({ children, className, disabled, href }: { children: ReactNode; className?: string; disabled: boolean; href: string }) {
  const linkClassName = className ? `page-nav-link ${className}` : "page-nav-link";
  if (disabled) return <span className={`disabled ${linkClassName}`}>{children}</span>;
  return <Link className={linkClassName} href={href}>{children}</Link>;
}

function tableHref(basePath: string, query: Record<string, string | undefined>, page: number, pageSize: number) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (page > 1) params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

function pageWindow(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) pages.push("ellipsis");
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

function clampPage(value: number, totalPages: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 1), totalPages);
}

function clampPageSize(value: number, options = DEFAULT_PAGE_SIZE_OPTIONS) {
  if (!Number.isFinite(value)) return options[0];
  return options.includes(value) ? value : options[0];
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  return String(value);
}

function renderCell(column: string, value: unknown) {
  if (isImageColumn(column)) return <BillImageThumbnail value={value} />;
  return formatValue(value);
}

function isImageColumn(column: string) {
  return column === "รูปถ่ายบิล" || column.includes("รูปถ่าย") || column.toLowerCase().includes("image");
}

function isAmountColumn(column: string) {
  return /ยอด|เงิน|ราคา|vat|หัก|เครดิต|ค่าแรง|รวม|คงเหลือ|โอน/.test(column);
}
