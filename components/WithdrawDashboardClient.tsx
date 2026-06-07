"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { money, toNumber } from "@/lib/numbers";
import type { SheetRow } from "@/lib/types";

export type WithdrawFilters = {
  requester?: string;
  date?: string;
  bill?: string;
  search?: string;
};

type WithdrawDashboardClientProps = {
  rows: SheetRow[];
  peopleRows: SheetRow[];
  initialFilters?: WithdrawFilters;
};

const columns = ["ลำดับ", "ID Project", "ชื่อ Project", "ร้าน/บุคคล", "สินค้า/ทำงาน", "บิล", "ประเภท", "ยอดเงิน", "ยอดโอน", "ผู้เบิก", "ว/ด/ป", "สถานะ"];
const PAGE_SIZE_OPTIONS = [50, 80, 100, 200];

export function WithdrawDashboardClient({ rows, peopleRows, initialFilters = {} }: WithdrawDashboardClientProps) {
  const [filters, setFilters] = useState(() => normalizeFilters(initialFilters));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(80);

  useEffect(() => {
    setFilters(normalizeFilters(initialFilters));
  }, [initialFilters.requester, initialFilters.date, initialFilters.bill, initialFilters.search]);

  const displayRows = useMemo(() => filterWithdrawRows(rows, filters), [rows, filters]);
  const totalPages = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleRows = displayRows.slice(pageStart, pageStart + pageSize);
  const visibleStart = visibleRows.length ? pageStart + 1 : 0;
  const visibleEnd = pageStart + visibleRows.length;
  const amount = displayRows.reduce((sum, row) => sum + toNumber(row["ยอดเงิน"]), 0);
  const transfer = displayRows.reduce((sum, row) => sum + toNumber(row["ยอดโอน"]), 0);

  useEffect(() => {
    setPage(1);
  }, [filters.requester, filters.date, filters.bill, filters.search, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function updateFilter(name: keyof WithdrawFilters, value: string) {
    setFilters(current => ({ ...current, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <section className="content dashboard dashboard-withdraw-request">
      <div className="dash-card dash-panel dash-withdrawFilter">
        <form className="withdraw-filter-form" onSubmit={handleSubmit}>
          <label>
            <span>ผู้เบิก</span>
            <select value={filters.requester} onChange={event => updateFilter("requester", event.target.value)}>
              <option value="">ทั้งหมด</option>
              {peopleRows.map(row => {
                const key = String(row["รหัสพนักงาน"] || row["ชื่อเล่น"] || row._sheetRow || "");
                const label = row["ชื่อเล่น"] ? `${key} - ${row["ชื่อเล่น"]}` : key;
                return key ? <option key={key} value={key}>{label}</option> : null;
              })}
            </select>
          </label>
          <label>
            <span>วันที่</span>
            <input type="date" value={filters.date} onChange={event => updateFilter("date", event.target.value)} />
          </label>
          <label>
            <span>บิล</span>
            <select value={filters.bill} onChange={event => updateFilter("bill", event.target.value)}>
              <option value="">ทั้งหมด</option>
              <option>หลัก</option>
              <option>ย่อย</option>
            </select>
          </label>
          <label className="withdraw-search-field">
            <span>ค้นหา</span>
            <input type="search" value={filters.search} placeholder="Project, ร้าน, รายการ" onChange={event => updateFilter("search", event.target.value)} />
          </label>
          <button type="submit" className="primary">กรอง</button>
        </form>
        <div className="withdraw-compact-metrics">
          <div>
            <span>รวมยอดรออนุมัติ</span>
            <strong>{money(amount)}</strong>
          </div>
          <div>
            <span>ยอดโอนรออนุมัติ</span>
            <strong>{money(transfer)}</strong>
          </div>
        </div>
      </div>
      <div className="dash-card dash-panel dash-withdrawTable">
        <header>
          <div>
            <h3>รายการตั้งเบิก</h3>
          </div>
          <strong className="table-count-pill">{visibleStart}-{visibleEnd} / {displayRows.length} รายการ</strong>
        </header>
        <WithdrawTable columns={columns} rows={visibleRows} />
        <WithdrawPagination
          currentPage={currentPage}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSize={pageSize}
          totalPages={totalPages}
          totalRows={displayRows.length}
          visibleEnd={visibleEnd}
          visibleStart={visibleStart}
        />
      </div>
    </section>
  );
}

function normalizeFilters(filters: WithdrawFilters) {
  return {
    requester: String(filters.requester || ""),
    date: String(filters.date || ""),
    bill: String(filters.bill || ""),
    search: String(filters.search || "")
  };
}

function filterWithdrawRows(rows: SheetRow[], filters: Required<WithdrawFilters>) {
  const requester = filters.requester.trim();
  const bill = filters.bill.trim();
  const query = filters.search.trim().toLowerCase();
  const targetDate = parseInputDate(filters.date);

  return rows.filter(row => {
    if (requester && String(row["ผู้เบิก"] || "").trim() !== requester) return false;
    if (bill && String(row["บิล"] || "").trim() !== bill) return false;
    if (targetDate) {
      const rowDate = parseSheetDate(row["ว/ด/ป"]);
      if (!rowDate || rowDate.getTime() !== targetDate.getTime()) return false;
    }
    if (query && !Object.values(row).some(value => String(value || "").toLowerCase().includes(query))) return false;
    return true;
  });
}

function WithdrawTable({ columns, rows }: { columns: string[]; rows: SheetRow[] }) {
  if (!rows.length) return <div className="empty-state compact-empty">ไม่พบข้อมูล</div>;
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>{columns.map(column => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row._sheetRow || row[columns[0]] || index)}>
              {columns.map(column => (
                <td key={column} className={isAmountColumn(column) ? "numeric-cell" : undefined} data-label={column}>
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WithdrawPagination({
  currentPage,
  onPageChange,
  onPageSizeChange,
  pageSize,
  totalPages,
  totalRows,
  visibleEnd,
  visibleStart
}: {
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSize: number;
  totalPages: number;
  totalRows: number;
  visibleEnd: number;
  visibleStart: number;
}) {
  const pages = pageWindow(currentPage, totalPages);
  return (
    <div className="table-pagination withdraw-pagination" aria-label="pagination">
      <div className="pagination-summary">
        <span className="pagination-summary-full">แสดง {visibleStart}-{visibleEnd} จาก {totalRows} รายการ</span>
        <span className="pagination-summary-compact" aria-label={`แสดง ${visibleStart}-${visibleEnd} จาก ${totalRows} รายการ`}>
          {visibleStart}-{visibleEnd}/{totalRows}
        </span>
        <div className="page-size-switch" aria-label="rows per page">
          <span className="page-size-label">
            <List size={15} aria-hidden="true" />
            <span>ต่อหน้า</span>
          </span>
          {PAGE_SIZE_OPTIONS.map(option => (
            <button
              key={option}
              type="button"
              className={option === pageSize ? "active" : ""}
              aria-current={option === pageSize ? "true" : undefined}
              onClick={() => onPageSizeChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <nav className="pagination-controls" aria-label="table pages">
        <PageButton className="pagination-prev" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          <ChevronLeft className="pagination-link-icon" size={15} aria-hidden="true" />
          <span className="pagination-link-text">ก่อนหน้า</span>
        </PageButton>
        {pages.map((page, index) => (
          page === "ellipsis" ? (
            <span className="page-ellipsis" key={`ellipsis-${index}`}>...</span>
          ) : (
            <button
              key={page}
              type="button"
              className={page === currentPage ? "active" : ""}
              aria-current={page === currentPage ? "page" : undefined}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          )
        ))}
        <PageButton className="pagination-next" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
          <span className="pagination-link-text">ถัดไป</span>
          <ChevronRight className="pagination-link-icon" size={15} aria-hidden="true" />
        </PageButton>
      </nav>
    </div>
  );
}

function PageButton({ children, className, disabled, onClick }: { children: ReactNode; className?: string; disabled: boolean; onClick: () => void }) {
  const buttonClassName = className ? `page-nav-link ${className}` : "page-nav-link";
  return (
    <button type="button" className={buttonClassName} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
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
function parseInputDate(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function parseSheetDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return startOfDay(value);
  const text = String(value).trim();
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDate) {
    const day = Number(slashDate[1]);
    const month = Number(slashDate[2]) - 1;
    const rawYear = Number(slashDate[3]);
    const year = rawYear > 2400 ? rawYear - 543 : rawYear;
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return money(value);
  return String(value);
}

function isAmountColumn(column: string) {
  return /ยอด|เงิน|ราคา|vat|หัก|เครดิต|ค่าแรง|รวม|คงเหลือ|โอน/.test(column);
}


