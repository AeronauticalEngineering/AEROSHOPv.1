import { TABLES } from "@/lib/config";
import { getRows } from "@/lib/sheets";
import type { SheetRow } from "@/lib/types";

const amountFields = ["ค่าของ", "ค่าแรง", "พนักงาน", "น้ำมัน", "ซ่อมรถ", "เครื่องจักร", "เครื่องมือ", "อื่นๆ"];

export async function applyBillFormulas(row: SheetRow) {
  const [projects, stores, contracts] = await Promise.all([
    getRows(TABLES.PROJECT, 120_000),
    getRows(TABLES.STORE, 120_000),
    getRows(TABLES.CONTRACT_WORK, 60_000)
  ]);

  const project = projects.find(item => String(item["ID Project"]) === String(row["ID Project"]));
  if (project) {
    row["ชื่อ Project"] = project["ชื่อ Project"] || row["ชื่อ Project"] || "";
    row["ชื่อบริษัท"] = project["ชื่อบริษัท"] || row["ชื่อบริษัท"] || "";
  }

  const contract = contracts.find(item => String(item["id_Conwork"]) === String(row["ผู้รับเหมา"]));
  if (contract) {
    row["รายละเอียดงาน"] = contract["รายละเอียดงาน"] || row["รายละเอียดงาน"] || "";
    row["ค่าแรงคงเหลือ"] = contract["ค่าแรงคงเหลือ"] || "";
  }

  row["ยอดเงิน"] = amountFields.reduce((sum, field) => sum + toNumber(row[field]), 0);
  row["ค่าแรง+พนักงาน+อื่น"] = toNumber(row["ค่าแรง"]) + toNumber(row["พนักงาน"]) + toNumber(row["อื่นๆ"]);
  row["3เปอร์"] = hasValue(row["หัก"]) ? toNumber(row["ค่าแรง+พนักงาน+อื่น"]) * toNumber(row["หัก"]) * 0.01 : "";
  row["รวม"] = hasValue(row["หัก"]) ? toNumber(row["ค่าแรง+พนักงาน+อื่น"]) - toNumber(row["3เปอร์"]) : "";
  row["ค่าแรง(หัก)"] = hasValue(row["หัก"]) ? laborDeductRate(row) : "";
  row["ยอดโอน(มีvat)"] = row["ยอดเงิน"];
  row["ยอดโอน(มีหัก)"] = hasValue(row["หัก"]) ? toNumber(row["ยอดเงิน"]) * toNumber(row["ค่าแรง(หัก)"]) : "";
  row["ยอดโอน(vat,หัก)"] = hasValue(row["vat"]) && hasValue(row["หัก"]) ? toNumber(row["ยอดเงิน"]) * 104 / 107 : "";
  row["ยอดโอน"] = transferAmount(row);
  row["ร้าน/บุคคล"] = vendorName(row, stores, contract);
  row["สินค้า/ทำงาน"] = `${row["สินค้า"] || ""}${row["รายละเอียดงาน"] || ""}`;
  return row;
}

function vendorName(row: SheetRow, stores: SheetRow[], contract?: SheetRow) {
  if (row["ร้านค้า/ผู้รับเหมา"] === "ผู้รับเหมา") return contract?.["ชื่อเล่น"] || row["ผู้รับเหมา"] || "";
  const store = stores.find(item => String(item["id_store"]) === String(row["ร้านค้า"]));
  return store?.["ชื่อร้านค้า"] || row["ร้านค้า"] || "";
}

function transferAmount(row: SheetRow) {
  const amount = toNumber(row["ยอดเงิน"]);
  const hasVat = hasValue(row["vat"]);
  const hasDeduct = hasValue(row["หัก"]);
  if (!amount) return "";
  if (!hasVat && !hasDeduct) return amount;
  if (hasVat && hasDeduct) return amount * 104 / 107;
  if (hasVat) return amount;
  return amount * laborDeductRate(row);
}

function laborDeductRate(row: SheetRow) {
  const deduct = toNumber(row["หัก"]);
  const status = String(row["statusค่าแรง"] || "");
  const companyRates: Record<number, number> = { 1: 1.06, 3: 1.04, 5: 1.02, 8: 0.99 };
  const personRates: Record<number, number> = { 1: 0.99, 3: 0.97, 5: 0.95, 8: 0.92 };
  if (status === "บริษัท") return companyRates[deduct] ?? 1 - (deduct / 100);
  return personRates[deduct] ?? 1 - (deduct / 100);
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}
