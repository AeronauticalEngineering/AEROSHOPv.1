import { TABLES } from "@/lib/config";
import { MainDashboardClient } from "@/components/MainDashboardClient";
import { WithdrawDashboardClient, type WithdrawFilters } from "@/components/WithdrawDashboardClient";
import { money, toNumber } from "@/lib/numbers";
import { getRows } from "@/lib/sheets";
import type { SheetRow } from "@/lib/types";

export async function MainDashboard() {
  const [dataRows, projectRows] = await Promise.all([safeRows(TABLES.DATA), safeRows(TABLES.PROJECT)]);
  return <MainDashboardClient initialDataRows={dataRows} initialProjectRows={projectRows} />;
}

function LegacyMainDashboardUnused() {
/*
  const costColumns = ["à¸„à¹ˆà¸²à¸‚à¸­à¸‡", "à¸„à¹ˆà¸²à¹à¸£à¸‡", "à¸žà¸™à¸±à¸à¸‡à¸²à¸™", "à¸™à¹‰à¸³à¸¡à¸±à¸™", "à¸‹à¹ˆà¸­à¸¡à¸£à¸–", "à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸ˆà¸±à¸à¸£", "à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸¡à¸·à¸­", "à¸­à¸·à¹ˆà¸™à¹†"];
  const total = sumColumns(dataRows, costColumns);
  const vatCount = dataRows.filter(row => hasValue(row.vat) && !hasValue(row["à¸§à¸±à¸™à¹„à¸”à¹‰à¸šà¸´à¸¥"])).length;
  const naturalDeductCount = dataRows.filter(row => hasValue(row["à¸«à¸±à¸"]) && !hasValue(row["à¸§à¸±à¸™à¸­à¸­à¸ 3%"]) && row["statusà¸„à¹ˆà¸²à¹à¸£à¸‡"] === "à¸šà¸¸à¸„à¸„à¸¥à¸˜à¸£à¸£à¸¡à¸”à¸²").length;
  const companyDeductCount = dataRows.filter(row => hasValue(row["à¸«à¸±à¸"]) && !hasValue(row["à¸§à¸±à¸™à¸­à¸­à¸ 3%"]) && row["statusà¸„à¹ˆà¸²à¹à¸£à¸‡"] === "à¸šà¸£à¸´à¸©à¸±à¸—").length;
  const creditCount = dataRows.filter(row => hasValue(row["à¹€à¸„à¸£à¸”à¸´à¸•"]) && !hasValue(row["à¸§à¸±à¸™à¸ˆà¹ˆà¸²à¸¢"])).length;
  const activeProjects = projectRows.filter(row => lower(row.color) === "red" || lower(row.color) === "green").length;
  const completeProjects = projectRows.filter(row => lower(row.color) === "black").length;

  const companyRows = dataRows.filter(row => row["statusà¸„à¹ˆà¸²à¹à¸£à¸‡"] === "à¸šà¸£à¸´à¸©à¸±à¸—");
  const naturalRows = dataRows.filter(row => row["statusà¸„à¹ˆà¸²à¹à¸£à¸‡"] === "à¸šà¸¸à¸„à¸„à¸¥à¸˜à¸£à¸£à¸¡à¸”à¸²");
  const vatRows = dataRows.filter(row => String(row.vat) === "7" || Number(row.vat) === 7);
  const noVatRows = dataRows.filter(row => !hasValue(row.vat));
  const operatingRows = dataRows.filter(row => row["à¸Šà¸·à¹ˆà¸­ Project"] === "à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£");

  const main3 = {
    laborBeforeVat: sumColumns(companyRows, ["à¸„à¹ˆà¸²à¹à¸£à¸‡"]),
    materialBeforeVat: sumColumns(vatRows, ["à¸„à¹ˆà¸²à¸‚à¸­à¸‡"]),
    fuelBeforeVat: sumColumns(vatRows, ["à¸™à¹‰à¸³à¸¡à¸±à¸™"]),
    repairBeforeVat: sumColumns(vatRows, ["à¸‹à¹ˆà¸­à¸¡à¸£à¸–"]),
    laborVat: sumColumns(companyRows, ["à¸„à¹ˆà¸²à¹à¸£à¸‡"]) * 100 / 103,
    materialVat: sumColumns(vatRows, ["à¸„à¹ˆà¸²à¸‚à¸­à¸‡"]) * 100 / 107,
    fuelVat: sumColumns(vatRows, ["à¸™à¹‰à¸³à¸¡à¸±à¸™"]) * 100 / 107,
    repairVat: sumColumns(vatRows, ["à¸‹à¹ˆà¸­à¸¡à¸£à¸–"]) * 100 / 107
  };
  const main3Total = main3.laborVat + main3.materialVat + main3.fuelVat + main3.repairVat;

  const main4 = {
    naturalLabor: sumColumns(naturalRows, ["à¸„à¹ˆà¸²à¹à¸£à¸‡"]),
    staff: sumColumns(dataRows, ["à¸žà¸™à¸±à¸à¸‡à¸²à¸™"]),
    material: sumColumns(noVatRows, ["à¸„à¹ˆà¸²à¸‚à¸­à¸‡"]),
    fuel: sumColumns(noVatRows, ["à¸™à¹‰à¸³à¸¡à¸±à¸™"]),
    repair: sumColumns(noVatRows, ["à¸‹à¹ˆà¸­à¸¡à¸£à¸–"]),
    operatingLabor: sumColumns(operatingRows.filter(row => row["statusà¸„à¹ˆà¸²à¹à¸£à¸‡"] === "à¸šà¸¸à¸„à¸„à¸¥à¸˜à¸£à¸£à¸¡à¸”à¸²"), ["à¸„à¹ˆà¸²à¹à¸£à¸‡"]),
    operatingStaff: sumColumns(operatingRows, ["à¸žà¸™à¸±à¸à¸‡à¸²à¸™"]),
    operatingMaterial: sumColumns(operatingRows.filter(row => !hasValue(row.vat)), ["à¸„à¹ˆà¸²à¸‚à¸­à¸‡"]),
    operatingFuel: sumColumns(operatingRows.filter(row => !hasValue(row.vat)), ["à¸™à¹‰à¸³à¸¡à¸±à¸™"]),
    operatingRepair: sumColumns(operatingRows.filter(row => !hasValue(row.vat)), ["à¸‹à¹ˆà¸­à¸¡à¸£à¸–"])
  };
  const main4Total = main4.naturalLabor + main4.staff + main4.material + main4.fuel + main4.repair;

  const main5 = {
    machineBeforeVat: sumColumns(vatRows, ["à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸ˆà¸±à¸à¸£"]),
    toolBeforeVat: sumColumns(vatRows, ["à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸¡à¸·à¸­"]),
    otherBeforeVat: sumColumns(vatRows, ["à¸­à¸·à¹ˆà¸™à¹†"]),
    machineVat: sumColumns(vatRows, ["à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸ˆà¸±à¸à¸£"]) * 100 / 107,
    toolVat: sumColumns(vatRows, ["à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸¡à¸·à¸­"]) * 100 / 107,
    otherVat: sumColumns(vatRows, ["à¸­à¸·à¹ˆà¸™à¹†"]) * 100 / 107,
    machineNoVat: sumColumns(noVatRows, ["à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸ˆà¸±à¸à¸£"]),
    toolNoVat: sumColumns(noVatRows, ["à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸¡à¸·à¸­"]),
    otherNoVat: sumColumns(noVatRows, ["à¸­à¸·à¹ˆà¸™à¹†"])
  };
  const main5BeforeVatTotal = main5.machineVat + main5.toolVat + main5.otherVat;
  const main5NoVatTotal = main5.machineNoVat + main5.toolNoVat + main5.otherNoVat;

  const revenue = sumColumns(projectRows, ["à¸¢à¸­à¸”à¸‡à¸²à¸™"]);
  const operating = sumColumns(operatingRows, costColumns);
  const investment = main3Total + main4Total + main5BeforeVatTotal + main5NoVatTotal - operating;
  const profit = revenue - investment - operating;
  const profitPercent = revenue ? profit / revenue * 100 : 0;

  return (
    <section className="content dashboard dashboard-wide dashboard-main-program">
      <div className="dash-card dash-panel dash-filter">
        <header>
          <h3>à¸à¸£à¸­à¸‡ main</h3>
          <small>Filter_main</small>
        </header>
        <form className="filter-form">
          <label>à¸§à¸±à¸™à¸—à¸µà¹ˆà¹€à¸£à¸´à¹ˆà¸¡<input type="date" /></label>
          <label>à¸§à¸±à¸™à¸—à¸µà¹ˆà¸ªà¸´à¹‰à¸™à¸ªà¸¸à¸”<input type="date" /></label>
          <div className="filter-presets">
            <button type="button">à¸§à¸±à¸™à¸™à¸µà¹‰</button>
            <button type="button">à¹€à¸¡à¸·à¹ˆà¸­à¸§à¸²à¸™</button>
            <button type="button" data-filter-preset="all">à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”</button>
          </div>
          <button type="button" className="primary">à¸à¸£à¸­à¸‡</button>
        </form>
      </div>

      <div className="dash-card dash-panel dash-summary main-visual">
        <header>
          <h3>main</h3>
          <small>main</small>
        </header>
        <div className="main-sheet-card">
          <div className="main-total-row">
            <span>à¸£à¸§à¸¡</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="main-count-row">
            <div><span>VAT</span><strong>{vatCount}</strong></div>
            <div><span>à¸«à¸±à¸ 1,5,3%</span><strong>{naturalDeductCount}</strong></div>
            <div><span>à¸«à¸±à¸ 3 à¸šà¸£à¸´à¸©à¸±à¸—</span><strong>{companyDeductCount}</strong></div>
            <div><span>à¹€à¸„à¸£à¸”à¸´à¸•</span><strong>{creditCount}</strong></div>
          </div>
          <div className="main-project-row">
            <div><span>Project(à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£)</span><strong>{activeProjects}</strong></div>
            <div><span>Project(à¸ªà¸³à¹€à¸£à¹‡à¸ˆ)</span><strong>{completeProjects}</strong></div>
          </div>
          <div className="main-money-row">
            <div><span>à¸¥à¸‡à¸—à¸¸à¸™</span><strong>{money(investment)}</strong></div>
            <div><span>à¸à¸³à¹„à¸£</span><strong>{money(profit)}</strong></div>
          </div>
        </div>
      </div>

      <div className="dash-card dash-panel dash-menu main2-visual">
        <header>
          <h3>main2</h3>
          <small>main2</small>
        </header>
        <div className="project-overview-card">
          <div className="overview-head">
            <strong>à¸ à¸²à¸žà¸£à¸§à¸¡à¹‚à¸„à¸£à¸‡à¸à¸²à¸£</strong>
            <span>à¸£à¸§à¸¡à¸ à¸²à¸©à¸µ</span>
          </div>
          <div className="overview-total">{money(revenue)}</div>
          <div className="overview-metrics">
            <div><span>à¸¥à¸‡à¸—à¸¸à¸™</span><strong>{money(investment)}</strong></div>
            <div><span>à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£</span><strong>{money(operating)}</strong></div>
            <div><span>à¸à¸³à¹„à¸£</span><strong>{money(profit)}</strong></div>
          </div>
          <div className="overview-bar"><span style={{ width: `${Math.max(0, Math.min(100, profitPercent))}%` }} /></div>
          <div className="overview-percent">{profitPercent.toFixed(2)}%</div>
        </div>
        <div className="menu-row compact-menu">
          <strong>Main</strong>
          <span>PRoject_all</span>
        </div>
      </div>

      <SummaryTable
        title="main 3"
        subtitle="main3"
        header={["à¸£à¸²à¸¢à¸à¸²à¸£à¸à¹ˆà¸­à¸™ vat (à¸šà¸²à¸—)", "à¸„à¸³à¸™à¸§à¸™ vat (à¸šà¸²à¸—)", "à¸¢à¸­à¸”à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£"]}
        rows={[
          ["à¸„à¹ˆà¸²à¹à¸£à¸‡", main3.laborBeforeVat, main3.laborVat, 0],
          ["à¸„à¹ˆà¸²à¸‚à¸­à¸‡", main3.materialBeforeVat, main3.materialVat, main4.operatingMaterial],
          ["à¸™à¹‰à¸³à¸¡à¸±à¸™", main3.fuelBeforeVat, main3.fuelVat, 0],
          ["à¸‹à¹ˆà¸­à¸¡à¸£à¸–", main3.repairBeforeVat, main3.repairVat, 0],
          ["à¸£à¸§à¸¡", "", main3Total, ""]
        ]}
      />
      <SummaryTable
        title="main 4"
        subtitle="main4"
        header={["à¸£à¸²à¸¢à¸à¸²à¸£", "à¸à¹ˆà¸­à¸™ VAT", "à¸¢à¸­à¸”à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£ (à¸šà¸²à¸—)"]}
        rows={[
          ["à¸„à¹ˆà¸²à¹à¸£à¸‡", main4.naturalLabor, main4.operatingLabor],
          ["à¸žà¸™à¸±à¸à¸‡à¸²à¸™", main4.staff, main4.operatingStaff],
          ["à¸„à¹ˆà¸²à¸‚à¸­à¸‡", main4.material, main4.operatingMaterial],
          ["à¸™à¹‰à¸³à¸¡à¸±à¸™", main4.fuel, main4.operatingFuel],
          ["à¸‹à¹ˆà¸­à¸¡à¸£à¸–", main4.repair, main4.operatingRepair],
          ["à¸£à¸§à¸¡", main4Total, ""]
        ]}
      />
      <SummaryTable
        title="main 5"
        subtitle="main5"
        header={["à¸£à¸²à¸¢à¸à¸²à¸£", "à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸ˆà¸±à¸à¸£", "à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸¡à¸·à¸­", "à¸­à¸·à¹ˆà¸™à¹†"]}
        rows={[
          ["à¸à¹ˆà¸­à¸™ vat", main5.machineBeforeVat, main5.toolBeforeVat, main5.otherBeforeVat],
          ["à¸à¹ˆà¸­à¸™ vat 7%", main5.machineVat, main5.toolVat, main5.otherVat],
          ["à¹„à¸¡à¹ˆà¸¡à¸µ vat", main5.machineNoVat, main5.toolNoVat, main5.otherNoVat],
          ["à¸£à¸§à¸¡à¸à¹ˆà¸­à¸™ vat", main5BeforeVatTotal, "", ""],
          ["à¸£à¸§à¸¡à¹„à¸¡à¹ˆà¸¡à¸µ vat", main5NoVatTotal, "", ""]
        ]}
      />
    </section>
  );
*/
  return null;
}

export async function WithdrawDashboard({ filters = {} }: { filters?: WithdrawFilters }) {
  const [dataRows, peopleRows] = await Promise.all([safeRows(TABLES.DATA), safeRows(TABLES.PEOPLE)]);
  const rows = hydrateDataRows(dataRows);
  return <WithdrawDashboardClient rows={rows} peopleRows={peopleRows} initialFilters={filters} />;
}

export async function BillFollowDashboard() {
  const rows = hydrateDataRows(await safeRows(TABLES.DATA));
  const vatRows = rows.filter(row => toNumber(row.vat) > 0 && !firstValue(row, ["วันได้บิล", "à¸§à¸±à¸™à¹„à¸”à¹‰à¸šà¸´à¸¥"]));
  const naturalDeductRows = rows.filter(row =>
    toNumber(firstValue(row, ["หัก", "à¸«à¸±à¸"])) > 0 &&
    !firstValue(row, ["วันออก 3%", "à¸§à¸±à¸™à¸­à¸­à¸ 3%"]) &&
    !isCompanyLaborStatus(firstValue(row, ["statusค่าแรง", "statusà¸„à¹ˆà¸²à¹à¸£à¸‡"]))
  );
  const companyDeductRows = rows.filter(row =>
    toNumber(firstValue(row, ["หัก", "à¸«à¸±à¸"])) > 0 &&
    !firstValue(row, ["วันออก 3%", "à¸§à¸±à¸™à¸­à¸­à¸ 3%"]) &&
    isCompanyLaborStatus(firstValue(row, ["statusค่าแรง", "statusà¸„à¹ˆà¸²à¹à¸£à¸‡"]))
  );
  const creditRows = rows.filter(row => firstValue(row, ["เครดิต", "à¹€à¸„à¸£à¸”à¸´à¸•"]) && !firstValue(row, ["วันจ่าย", "à¸§à¸±à¸™à¸ˆà¹ˆà¸²à¸¢"]));

  return (
    <section className="content dashboard dashboard-bill-follow">
      <FollowPanel title="ตาม vat" count={vatRows.length} rows={vatRows} />
      <FollowPanel title="หัก 3" count={naturalDeductRows.length} rows={naturalDeductRows} />
      <FollowPanel title="หัก 3 บริษัท" count={companyDeductRows.length} rows={companyDeductRows} />
      <FollowPanel title="เครดิต" count={creditRows.length} rows={creditRows} />
    </section>
  );
}

export async function WorkStatusDashboard() {
  const [projectRows, dataRows] = await Promise.all([safeRows(TABLES.PROJECT), safeRows(TABLES.DATA)]);
  const hydratedDataRows = hydrateDataRows(dataRows);
  const rows = projectRows.map(row => hydrateProjectSummary(row, hydratedDataRows));
  const active = rows.filter(row => lower(row.color) === "red" || lower(row.color) === "green");
  const complete = rows.filter(row => lower(row.color) === "black");

  return (
    <section className="content dashboard dashboard-work-status">
      <ProjectStatusPanel title="Project ทำอยู่" count={active.length} rows={active} tone="green" />
      <ProjectStatusPanel title="Project เสร็จแล้ว" count={complete.length} rows={complete} />
    </section>
  );
}

function AmountPanel({ title, value, className = "" }: { title: string; value: number; className?: string }) {
  return (
    <div className={`dash-card dash-panel amount-panel ${className}`}>
      <header>
        <h3>{title}</h3>
        <small>บาท</small>
      </header>
      <div className="amount-card">
        <span>{title}</span>
        <strong>{money(value)}</strong>
      </div>
    </div>
  );
}

function FollowPanel({ title, count, rows }: { title: string; count: number; rows: SheetRow[] }) {
  const visibleRows = rows.slice(0, 80);
  const amountTotal = rows.reduce((sum, row) => sum + toNumber(followValue(row, ["ยอดเงิน", "à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™"])), 0);
  const rowCountText = rows.length > visibleRows.length ? `${visibleRows.length} / ${rows.length}` : String(visibleRows.length);

  return (
    <div className="dash-card dash-panel dash-billFollow">
      <header>
        <h3>{title}</h3>
        <div className="bill-follow-header-stats">
          <span>{rowCountText} รายการ</span>
          <strong>{money(amountTotal)}</strong>
        </div>
      </header>
      {visibleRows.length ? (
        <div className="bill-follow-table-wrap">
          <table className="bill-follow-table">
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>ร้าน/บุคคล</th>
                <th>Project</th>
                <th>รายการ</th>
                <th>วันที่</th>
                <th>ผู้เบิก</th>
                <th className="numeric-cell">ยอดเงิน</th>
                <th>เงื่อนไข</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={String(row._sheetRow || followValue(row, ["ลำดับ", "à¸¥à¸³à¸”à¸±à¸š"]) || index)}>
                  <td data-label="ลำดับ">{formatCell(followValue(row, ["ลำดับ", "à¸¥à¸³à¸”à¸±à¸š"])) || "-"}</td>
                  <td data-label="ร้าน/บุคคล">
                    <strong className="bill-follow-main-cell">{formatCell(followValue(row, ["ร้าน/บุคคล", "à¸£à¹‰à¸²à¸™/à¸šà¸¸à¸„à¸„à¸¥"])) || "-"}</strong>
                  </td>
                  <td data-label="Project">{formatCell(followValue(row, ["ชื่อ Project", "à¸Šà¸·à¹ˆà¸­ Project"])) || "-"}</td>
                  <td data-label="รายการ">{formatCell(followValue(row, ["สินค้า/ทำงาน", "à¸ªà¸´à¸™à¸„à¹‰à¸²/à¸—à¸³à¸‡à¸²à¸™"])) || formatCell(followValue(row, ["รายการ", "à¸£à¸²à¸¢à¸à¸²à¸£"])) || "-"}</td>
                  <td data-label="วันที่">{formatCell(followValue(row, ["ว/ด/ป", "à¸§/à¸”/à¸›"])) || "-"}</td>
                  <td data-label="ผู้เบิก">{formatCell(followValue(row, ["ผู้เบิก", "à¸œà¸¹à¹‰à¹€à¸šà¸´à¸"])) || "-"}</td>
                  <td className="numeric-cell bill-follow-money" data-label="ยอดเงิน">{money(followValue(row, ["ยอดเงิน", "à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™"]))}</td>
                  <td data-label="เงื่อนไข">
                    <div className="bill-follow-flags">
                      <span>vat {formatCell(row.vat) || "-"}</span>
                      <span>หัก {formatCell(followValue(row, ["หัก", "à¸«à¸±à¸"])) || "-"}</span>
                      {formatCell(followValue(row, ["เครดิต", "à¹€à¸„à¸£à¸”à¸´à¸•"])) ? <span>เครดิต {formatCell(followValue(row, ["เครดิต", "à¹€à¸„à¸£à¸”à¸´à¸•"]))}</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state compact-empty">ไม่พบข้อมูล</div>
      )}
    </div>
  );
}

function followValue(row: SheetRow, columns: string[]) {
  return firstValue(row, columns);
}

function isCompanyLaborStatus(value: unknown) {
  const text = String(value || "").trim();
  return text === "บริษัท" || text === "à¸šà¸£à¸´à¸©à¸±à¸—";
}

function ProjectStatusPanel({
  title,
  count,
  rows,
  tone = "default"
}: {
  title: string;
  count: number;
  rows: SheetRow[];
  tone?: "default" | "green";
}) {
  return (
    <div className="dash-card dash-panel dash-projectStatus">
      <header>
        <h3>{title}</h3>
        <small>Project</small>
      </header>
      <div className={`project-count-card project-count-${tone}`}>
        <span>{title}</span>
        <strong>{count}</strong>
        <small>รายการ</small>
      </div>
      <div className="project-card-grid">
        {rows.slice(0, 60).map((row, index) => (
          <ProjectItemCard key={String(row["ID Project"] || row._sheetRow || index)} title={title} row={row} tone={tone} />
        ))}
        {!rows.length ? <div className="empty-state compact-empty">ไม่พบข้อมูล</div> : null}
      </div>
    </div>
  );
}

function ProjectItemCard({ title, row, tone }: { title: string; row: SheetRow; tone: "default" | "green" }) {
  const projectName = projectValue(row, ["ชื่อ Project", "à¸Šà¸·à¹ˆà¸­ Project"]);
  const date = projectValue(row, ["วันที่", "à¸§à¸±à¸™à¸—à¸µà¹ˆ"]);
  const customer = projectValue(row, ["ชื่อลูกค้า", "à¸Šà¸·à¹ˆà¸­à¸¥à¸¹à¸à¹‰à¸²"]);
  const company = projectValue(row, ["บริษัท", "à¸šà¸£à¸´à¸©à¸±à¸—"]);
  const owner = projectValue(row, ["รับผิดชอบ", "à¸£à¸±à¸šà¸œà¸´à¸”à¸Šà¸­à¸š"]);
  const total = projectValue(row, ["รวม ALL", "à¸£à¸§à¸¡ ALL", "ยอดงาน", "à¸¢à¸­à¸”à¸‡à¸²à¸™"]);
  const totalVat = projectValue(row, ["ยอดรวม vat", "à¸¢à¸­à¸”à¸£à¸§à¸¡ vat"]);
  const budget = projectValue(row, ["งบไม่เกิน", "à¸‡à¸šà¹„à¸¡à¹ˆà¹€à¸à¸´à¸™"]);

  return (
    <article className={`project-item-card project-item-${tone}`}>
      <div className="project-item-head">
        <strong>{title}</strong>
        <span>{formatCell(row["ID Project"])}</span>
      </div>
      <div className="project-item-body">
        <div className="project-item-title">
          <strong>{formatCell(projectName) || "-"}</strong>
          <span>{formatCell(date) || "-"}</span>
        </div>
        <div className="project-item-lines">
          <span>ลูกค้า: {formatCell(customer) || "-"}</span>
          <span>บริษัท: {formatCell(company) || "-"}</span>
          <span>ผู้รับผิดชอบ: {formatCell(owner) || "-"}</span>
        </div>
        <div className="project-item-metrics">
          <div>
            <span>ยอดรวม</span>
            <strong>{money(total)}</strong>
          </div>
          <div>
            <span>ยอดรวม vat</span>
            <strong>{money(totalVat)}</strong>
          </div>
        </div>
        <div className="project-item-foot">
          <span>งบไม่เกิน: {money(budget)}</span>
          <span>รวม ALL: {money(total)}</span>
        </div>
      </div>
    </article>
  );
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
                <td key={cellIndex}>{typeof cell === "number" ? money(cell) : cell}</td>
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

function hydrateDataRows(rows: SheetRow[]) {
  const amountColumns = ["ค่าของ", "ค่าแรง", "พนักงาน", "น้ำมัน", "ซ่อมรถ", "เครื่องจักร", "เครื่องมือ", "อื่นๆ", "à¸„à¹ˆà¸²à¸‚à¸­à¸‡", "à¸„à¹ˆà¸²à¹à¸£à¸‡", "à¸žà¸™à¸±à¸à¸‡à¸²à¸™", "à¸™à¹‰à¸³à¸¡à¸±à¸™", "à¸‹à¹ˆà¸­à¸¡à¸£à¸–", "à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸ˆà¸±à¸à¸£", "à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¸¡à¸·à¸­", "à¸­à¸·à¹ˆà¸™à¹†"];
  return rows.map(row => {
    const output = { ...row };
    if (!hasValue(output["à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™"])) output["à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™"] = sumColumns([output], amountColumns);
    if (!hasValue(output["à¸¢à¸­à¸”à¹‚à¸­à¸™"])) output["à¸¢à¸­à¸”à¹‚à¸­à¸™"] = computeTransferAmount(output);
    if (!hasValue(output["à¸£à¹‰à¸²à¸™/à¸šà¸¸à¸„à¸„à¸¥"])) output["à¸£à¹‰à¸²à¸™/à¸šà¸¸à¸„à¸„à¸¥"] = firstValue(output, ["à¸£à¹‰à¸²à¸™à¸„à¹‰à¸²", "à¸œà¸¹à¹‰à¸£à¸±à¸šà¹€à¸«à¸¡à¸²", "à¸£à¹‰à¸²à¸™à¸„à¹‰à¸²/à¸œà¸¹à¹‰à¸£à¸±à¸šà¹€à¸«à¸¡à¸²"]);
    if (!hasValue(output["à¸ªà¸´à¸™à¸„à¹‰à¸²/à¸—à¸³à¸‡à¸²à¸™"])) output["à¸ªà¸´à¸™à¸„à¹‰à¸²/à¸—à¸³à¸‡à¸²à¸™"] = firstValue(output, ["à¸ªà¸´à¸™à¸„à¹‰à¸²", "à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸‡à¸²à¸™", "à¸£à¸²à¸¢à¸à¸²à¸£"]);
    output["ลำดับ"] = firstValue(output, ["ลำดับ", "à¸¥à¸³à¸”à¸±à¸š"]);
    output["ชื่อ Project"] = firstValue(output, ["ชื่อ Project", "à¸Šà¸·à¹ˆà¸­ Project"]);
    output["ร้าน/บุคคล"] = firstValue(output, ["ร้าน/บุคคล", "à¸£à¹‰à¸²à¸™/à¸šà¸¸à¸„à¸„à¸¥"]);
    output["สินค้า/ทำงาน"] = firstValue(output, ["สินค้า/ทำงาน", "à¸ªà¸´à¸™à¸„à¹‰à¸²/à¸—à¸³à¸‡à¸²à¸™"]);
    output["รายการ"] = firstValue(output, ["รายการ", "à¸£à¸²à¸¢à¸à¸²à¸£"]);
    output["ยอดเงิน"] = firstValue(output, ["ยอดเงิน", "à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™"]);
    output["ยอดโอน"] = firstValue(output, ["ยอดโอน", "à¸¢à¸­à¸”à¹‚à¸­à¸™"]);
    output["ผู้เบิก"] = firstValue(output, ["ผู้เบิก", "à¸œà¸¹à¹‰à¹€à¸šà¸´à¸"]);
    output["หัก"] = firstValue(output, ["หัก", "à¸«à¸±à¸"]);
    output["เครดิต"] = firstValue(output, ["เครดิต", "à¹€à¸„à¸£à¸”à¸´à¸•"]);
    return output;
  });
}

function hydrateProjectSummary(project: SheetRow, dataRows: SheetRow[]): SheetRow {
  const projectId = String(project["ID Project"] || "");
  const projectDataRows = dataRows.filter(row => String(row["ID Project"] || "") === projectId);
  const total = sumColumns(projectDataRows, ["ยอดเงิน", "à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™"]);
  const totalAll = firstValue(project, ["รวม ALL", "à¸£à¸§à¸¡ ALL"]) || total;
  const totalVat = firstValue(project, ["ยอดรวม vat", "à¸¢à¸­à¸”à¸£à¸§à¸¡ vat"]) || toNumber(firstValue(project, ["ยอดงาน", "à¸¢à¸­à¸”à¸‡à¸²à¸™"])) * 1.07;
  return {
    ...project,
    "รวม ALL": totalAll,
    "ยอดรวม vat": totalVat
  };
}

function projectValue(row: SheetRow, columns: string[]) {
  return firstValue(row, columns);
}

function computeTransferAmount(row: SheetRow) {
  const amount = toNumber(row["à¸¢à¸­à¸”à¹€à¸‡à¸´à¸™"]);
  const hasVat = hasValue(row.vat);
  const hasDeduct = hasValue(row["à¸«à¸±à¸"]);
  if (!hasVat && !hasDeduct) return amount;
  if (hasVat && hasDeduct) return amount * 104 / 107;
  if (hasVat) return amount;
  if (hasDeduct) return amount * computeDeductMultiplier(row);
  return 0;
}

function computeDeductMultiplier(row: SheetRow) {
  const deduct = String(row["à¸«à¸±à¸"] || "").trim();
  const status = String(row["statusà¸„à¹ˆà¸²à¹à¸£à¸‡"] || "").trim();
  const company = status === "à¸šà¸£à¸´à¸©à¸±à¸—";
  if (deduct === "1") return company ? 1.06 : 0.99;
  if (deduct === "3") return company ? 1.04 : 0.97;
  if (deduct === "5") return company ? 1.02 : 0.95;
  if (deduct === "8") return company ? 0.99 : 0.92;
  return 1;
}

function firstValue(row: SheetRow, columns: string[]) {
  for (const column of columns) {
    if (hasValue(row[column])) return row[column];
  }
  return "";
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function lower(value: unknown) {
  return String(value || "").toLowerCase();
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return money(value);
  return String(value);
}

async function safeRows(tableName: string): Promise<SheetRow[]> {
  try {
    return await getRows(tableName);
  } catch {
    return [];
  }
}

