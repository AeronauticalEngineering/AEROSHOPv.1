"use client";

import { useMemo, useState } from "react";
import { money, toNumber } from "@/lib/numbers";
import type { SheetRow } from "@/lib/types";

type MainDashboardClientProps = {
  initialDataRows: SheetRow[];
  initialProjectRows: SheetRow[];
};

type Preset = "today" | "yesterday" | "month" | "previousMonth" | "all" | "custom";

const COST_COLUMNS = ["ค่าของ", "ค่าแรง", "พนักงาน", "น้ำมัน", "ซ่อมรถ", "เครื่องจักร", "เครื่องมือ", "อื่นๆ"];

export function MainDashboardClient({ initialDataRows, initialProjectRows }: MainDashboardClientProps) {
  const [dataRows, setDataRows] = useState(initialDataRows);
  const [projectRows, setProjectRows] = useState(initialProjectRows);
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => getRange(preset, from, to), [preset, from, to]);
  const filteredDataRows = useMemo(() => filterRowsByDate(dataRows, range, ["ว/ด/ป", "วันที่"]), [dataRows, range]);
  const filteredProjectRows = useMemo(() => filterRowsByDate(projectRows, range, ["วันที่"]), [projectRows, range]);
  const summary = useMemo(() => buildMainSummary(filteredDataRows, filteredProjectRows), [filteredDataRows, filteredProjectRows]);

  async function refreshData() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard?refresh=1", { cache: "no-store" });
      if (!response.ok) throw new Error("Refresh failed");
      const payload = await response.json();
      setDataRows(payload.dataRows || []);
      setProjectRows(payload.projectRows || []);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="content dashboard dashboard-wide dashboard-main-program">
      <div className="dash-card dash-panel dash-filter">
        <header>
          <h3>กรอง main</h3>
          <small>{summary.filterLabel}</small>
        </header>
        <form className="filter-form">
          <label>
            วันที่เริ่ม
            <input type="date" value={from} onChange={event => { setFrom(event.target.value); setPreset("custom"); }} />
          </label>
          <label>
            วันที่สิ้นสุด
            <input type="date" value={to} onChange={event => { setTo(event.target.value); setPreset("custom"); }} />
          </label>
          <div className="filter-presets filter-presets-wide">
            <button className={preset === "today" ? "filter-active" : ""} type="button" onClick={() => setPreset("today")}>วันนี้</button>
            <button className={preset === "yesterday" ? "filter-active" : ""} type="button" onClick={() => setPreset("yesterday")}>เมื่อวาน</button>
            <button className={preset === "month" ? "filter-active" : ""} type="button" onClick={() => setPreset("month")}>เดือนนี้</button>
            <button className={preset === "previousMonth" ? "filter-active" : ""} type="button" onClick={() => setPreset("previousMonth")}>เดือนก่อน</button>
            <button className={preset === "all" ? "filter-active" : ""} type="button" onClick={() => setPreset("all")}>ทั้งหมด</button>
          </div>
          <button type="button" className="primary" onClick={() => setPreset("custom")}>กรองช่วงวันที่</button>
          <button type="button" onClick={refreshData} disabled={refreshing}>{refreshing ? "กำลังรีเฟรช" : "รีเฟรชข้อมูล"}</button>
          <small className="filter-note">
            ค่าใช้จ่ายกรองจาก ว/ด/ป หรือ วันที่, Project กรองจาก วันที่
          </small>
        </form>
      </div>

      <div className="dash-card dash-panel dash-summary main-visual">
        <header>
          <h3>main</h3>
          <small>{summary.dataCount} รายการ</small>
        </header>
        <div className="main-sheet-card">
          <div className="main-total-row">
            <span>รวม</span>
            <strong>{money(summary.total)}</strong>
          </div>
          <div className="main-count-row">
            <div><span>VAT</span><strong>{summary.vatCount}</strong></div>
            <div><span>หัก 1,5,3%</span><strong>{summary.naturalDeductCount}</strong></div>
            <div><span>หัก 3 บริษัท</span><strong>{summary.companyDeductCount}</strong></div>
            <div><span>เครดิต</span><strong>{summary.creditCount}</strong></div>
          </div>
          <div className="main-project-row">
            <div><span>Project(ดำเนินการ)</span><strong>{summary.activeProjects}</strong></div>
            <div><span>Project(สำเร็จ)</span><strong>{summary.completeProjects}</strong></div>
          </div>
          <div className="main-money-row">
            <div><span>ลงทุน</span><strong>{money(summary.investment)}</strong></div>
            <div><span>กำไร</span><strong>{money(summary.profit)}</strong></div>
          </div>
        </div>
      </div>

      <div className="dash-card dash-panel dash-menu main2-visual">
        <header>
          <h3>main2</h3>
          <small>{summary.projectCount} Project</small>
        </header>
        <div className="project-overview-card">
          <div className="overview-head">
            <strong>ภาพรวมโครงการ</strong>
            <span>รวมภาษี</span>
          </div>
          <div className="overview-total">{money(summary.revenue)}</div>
          <div className="overview-metrics">
            <div><span>ลงทุน</span><strong>{money(summary.investment)}</strong></div>
            <div><span>ดำเนินการ</span><strong>{money(summary.operating)}</strong></div>
            <div><span>กำไร</span><strong>{money(summary.profit)}</strong></div>
          </div>
          <div className="overview-bar"><span style={{ width: `${Math.max(0, Math.min(100, summary.profitPercent))}%` }} /></div>
          <div className="overview-percent">{summary.profitPercent.toFixed(2)}%</div>
        </div>
        <div className="menu-row compact-menu">
          <strong>Main</strong>
          <span>PRoject_all</span>
        </div>
      </div>

      <SummaryTable
        title="main 3"
        subtitle="main3"
        header={["รายการก่อน vat (บาท)", "คำนวณ vat (บาท)", "ยอดดำเนินการ"]}
        rows={[
          ["ค่าแรง", summary.main3.laborBeforeVat, summary.main3.laborVat, 0],
          ["ค่าของ", summary.main3.materialBeforeVat, summary.main3.materialVat, summary.main4.operatingMaterial],
          ["น้ำมัน", summary.main3.fuelBeforeVat, summary.main3.fuelVat, 0],
          ["ซ่อมรถ", summary.main3.repairBeforeVat, summary.main3.repairVat, 0],
          ["รวม", "", summary.main3Total, ""]
        ]}
      />
      <SummaryTable
        title="main 4"
        subtitle="main4"
        header={["รายการ", "ก่อน VAT", "ยอดดำเนินการ (บาท)"]}
        rows={[
          ["ค่าแรง", summary.main4.naturalLabor, summary.main4.operatingLabor],
          ["พนักงาน", summary.main4.staff, summary.main4.operatingStaff],
          ["ค่าของ", summary.main4.material, summary.main4.operatingMaterial],
          ["น้ำมัน", summary.main4.fuel, summary.main4.operatingFuel],
          ["ซ่อมรถ", summary.main4.repair, summary.main4.operatingRepair],
          ["รวม", summary.main4Total, ""]
        ]}
      />
      <SummaryTable
        title="main 5"
        subtitle="main5"
        header={["รายการ", "เครื่องจักร", "เครื่องมือ", "อื่นๆ"]}
        rows={[
          ["ก่อน vat", summary.main5.machineBeforeVat, summary.main5.toolBeforeVat, summary.main5.otherBeforeVat],
          ["ก่อน vat 7%", summary.main5.machineVat, summary.main5.toolVat, summary.main5.otherVat],
          ["ไม่มี vat", summary.main5.machineNoVat, summary.main5.toolNoVat, summary.main5.otherNoVat],
          ["รวมก่อน vat", summary.main5BeforeVatTotal, "", ""],
          ["รวมไม่มี vat", summary.main5NoVatTotal, "", ""]
        ]}
      />
    </section>
  );
}

function buildMainSummary(dataRows: SheetRow[], projectRows: SheetRow[]) {
  const total = sumColumns(dataRows, COST_COLUMNS);
  const vatCount = dataRows.filter(row => hasValue(row.vat) && !hasValue(row["วันได้บิล"])).length;
  const naturalDeductCount = dataRows.filter(row => hasValue(row["หัก"]) && !hasValue(row["วันออก 3%"]) && row["statusค่าแรง"] === "บุคคลธรรมดา").length;
  const companyDeductCount = dataRows.filter(row => hasValue(row["หัก"]) && !hasValue(row["วันออก 3%"]) && row["statusค่าแรง"] === "บริษัท").length;
  const creditCount = dataRows.filter(row => hasValue(row["เครดิต"]) && !hasValue(row["วันจ่าย"])).length;
  const activeProjects = projectRows.filter(row => lower(row.color) === "red" || lower(row.color) === "green").length;
  const completeProjects = projectRows.filter(row => lower(row.color) === "black").length;

  const companyRows = dataRows.filter(row => row["statusค่าแรง"] === "บริษัท");
  const naturalRows = dataRows.filter(row => row["statusค่าแรง"] === "บุคคลธรรมดา");
  const vatRows = dataRows.filter(row => String(row.vat) === "7" || Number(row.vat) === 7);
  const noVatRows = dataRows.filter(row => !hasValue(row.vat));
  const operatingRows = dataRows.filter(row => row["ชื่อ Project"] === "ดำเนินการ");

  const main3 = {
    laborBeforeVat: sumColumns(companyRows, ["ค่าแรง"]),
    materialBeforeVat: sumColumns(vatRows, ["ค่าของ"]),
    fuelBeforeVat: sumColumns(vatRows, ["น้ำมัน"]),
    repairBeforeVat: sumColumns(vatRows, ["ซ่อมรถ"]),
    laborVat: sumColumns(companyRows, ["ค่าแรง"]) * 100 / 103,
    materialVat: sumColumns(vatRows, ["ค่าของ"]) * 100 / 107,
    fuelVat: sumColumns(vatRows, ["น้ำมัน"]) * 100 / 107,
    repairVat: sumColumns(vatRows, ["ซ่อมรถ"]) * 100 / 107
  };
  const main3Total = main3.laborVat + main3.materialVat + main3.fuelVat + main3.repairVat;

  const main4 = {
    naturalLabor: sumColumns(naturalRows, ["ค่าแรง"]),
    staff: sumColumns(dataRows, ["พนักงาน"]),
    material: sumColumns(noVatRows, ["ค่าของ"]),
    fuel: sumColumns(noVatRows, ["น้ำมัน"]),
    repair: sumColumns(noVatRows, ["ซ่อมรถ"]),
    operatingLabor: sumColumns(operatingRows.filter(row => row["statusค่าแรง"] === "บุคคลธรรมดา"), ["ค่าแรง"]),
    operatingStaff: sumColumns(operatingRows, ["พนักงาน"]),
    operatingMaterial: sumColumns(operatingRows.filter(row => !hasValue(row.vat)), ["ค่าของ"]),
    operatingFuel: sumColumns(operatingRows.filter(row => !hasValue(row.vat)), ["น้ำมัน"]),
    operatingRepair: sumColumns(operatingRows.filter(row => !hasValue(row.vat)), ["ซ่อมรถ"])
  };
  const main4Total = main4.naturalLabor + main4.staff + main4.material + main4.fuel + main4.repair;

  const main5 = {
    machineBeforeVat: sumColumns(vatRows, ["เครื่องจักร"]),
    toolBeforeVat: sumColumns(vatRows, ["เครื่องมือ"]),
    otherBeforeVat: sumColumns(vatRows, ["อื่นๆ"]),
    machineVat: sumColumns(vatRows, ["เครื่องจักร"]) * 100 / 107,
    toolVat: sumColumns(vatRows, ["เครื่องมือ"]) * 100 / 107,
    otherVat: sumColumns(vatRows, ["อื่นๆ"]) * 100 / 107,
    machineNoVat: sumColumns(noVatRows, ["เครื่องจักร"]),
    toolNoVat: sumColumns(noVatRows, ["เครื่องมือ"]),
    otherNoVat: sumColumns(noVatRows, ["อื่นๆ"])
  };
  const main5BeforeVatTotal = main5.machineVat + main5.toolVat + main5.otherVat;
  const main5NoVatTotal = main5.machineNoVat + main5.toolNoVat + main5.otherNoVat;

  const revenue = sumColumns(projectRows, ["ยอดงาน"]);
  const operating = sumColumns(operatingRows, COST_COLUMNS);
  const investment = main3Total + main4Total + main5BeforeVatTotal + main5NoVatTotal - operating;
  const profit = revenue - investment - operating;
  const profitPercent = revenue ? profit / revenue * 100 : 0;

  return {
    activeProjects,
    companyDeductCount,
    completeProjects,
    creditCount,
    dataCount: dataRows.length,
    filterLabel: `${dataRows.length} Data / ${projectRows.length} Project`,
    investment,
    main3,
    main3Total,
    main4,
    main4Total,
    main5,
    main5BeforeVatTotal,
    main5NoVatTotal,
    naturalDeductCount,
    operating,
    profit,
    profitPercent,
    projectCount: projectRows.length,
    revenue,
    total,
    vatCount
  };
}

function filterRowsByDate(rows: SheetRow[], range: { from?: Date; to?: Date }, columns: string[]) {
  if (!range.from || !range.to) return rows;
  return rows.filter(row => {
    const date = firstDate(row, columns);
    if (!date) return false;
    return date >= range.from! && date <= range.to!;
  });
}

function getRange(preset: Preset, from: string, to: string) {
  if (preset === "all") return {};
  if (preset === "custom") {
    const start = parseInputDate(from);
    const end = parseInputDate(to);
    return start && end ? { from: startOfDay(start), to: endOfDay(end) } : {};
  }

  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
  }
  if (preset === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };

  return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)) };
}

function firstDate(row: SheetRow, columns: string[]) {
  for (const column of columns) {
    const parsed = parseSheetDate(row[column]);
    if (parsed) return parsed;
  }
  return null;
}

function parseInputDate(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseSheetDate(value: unknown) {
  if (!hasValue(value)) return null;
  if (value instanceof Date) return startOfDay(value);
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    let year = Number(match[3]);
    if (year > 2400) year -= 543;
    if (year < 100) year += 2000;
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function SummaryTable({
  title,
  subtitle,
  header,
  rows
}: {
  title: string;
  subtitle: string;
  header: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="dash-card dash-panel dash-summary compact-summary">
      <header>
        <h3>{title}</h3>
        <small>{subtitle}</small>
      </header>
      <table className="summary-table">
        <thead>
          <tr>{header.map(column => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  data-empty={cell === "" ? "true" : undefined}
                  data-label={cellIndex > 0 ? header[cellIndex] : undefined}
                >
                  {typeof cell === "number" ? money(cell) : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function sumColumns(rows: SheetRow[], columns: string[]) {
  return rows.reduce((sum, row) => sum + columns.reduce((inner, column) => inner + toNumber(row[column]), 0), 0);
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function lower(value: unknown) {
  return String(value || "").toLowerCase();
}
