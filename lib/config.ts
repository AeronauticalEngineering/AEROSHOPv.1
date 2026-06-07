export const APP_NAME = "Cost Test";

export const SHEET_ID = process.env.GOOGLE_SHEET_ID || "11nJrMjmDurFVj8e65-EOCXHxpAQJPkxn3O39KpgktE0";

export const TABLES = {
  DATA: "Data",
  PROJECT: "Project",
  STORE: "ร้านค้า",
  CONTRACTOR: "รับเหมา",
  CAR: "ทะเบียน",
  BANK: "ธนาคาร",
  CATEGORY: "ประเภท",
  FILTER: "Filter",
  PEOPLE: "รายชื่อ",
  FILTER_MAIN: "Filter_main",
  MAIN: "main",
  MAIN2: "main2",
  CONTRACT_WORK: "งานรับเหมา",
  CUSTOMER: "ลูกค้า",
  COMPANY: "บริษัท",
  LOAN: "ยืมเงิน",
  MAIN3: "main3",
  MAIN4: "main4",
  MAIN5: "main5",
  WITHDRAW: "เบิกเงิน"
} as const;

export const TABLE_KEYS: Record<string, string> = {
  [TABLES.DATA]: "ลำดับ",
  [TABLES.PROJECT]: "ID Project",
  [TABLES.STORE]: "id_store",
  [TABLES.CONTRACTOR]: "id_Contractor",
  [TABLES.CAR]: "id_car",
  [TABLES.PEOPLE]: "รหัสพนักงาน",
  [TABLES.FILTER_MAIN]: "id_fmain",
  [TABLES.CONTRACT_WORK]: "id_Conwork"
};

export const PRIMARY_VIEWS = [
  { id: "dashboard-main", name: "Main Program", type: "dashboard", position: "first", items: ["กรอง main", "main", "main2", "main 3", "main 4", "main 5"] },
  { id: "bill-entry", name: "กรอกบิล", type: "table", table: TABLES.DATA, position: "first" },
  { id: "withdraw-request", name: "ตั้งเบิก", type: "dashboard", position: "first", items: ["ตรวจการเบิกเงิน", "บิลหลัก/ย่อย", "รวมยอด รออนุมัติ(บาท)", "ยอดโอน รออนุมัติ(บาท)"] },
  { id: "contract-open", name: "เปิดจ้าง", type: "table", table: TABLES.CONTRACT_WORK, position: "next" },
  { id: "bill-follow", name: "ตามบิล", type: "dashboard", position: "next", items: ["ตาม vat", "หัก 3", "หัก 3 บริษัท", "เครดิต"] },
  { id: "work-status", name: "งานที่ทำ", type: "dashboard", position: "last", items: ["Project ทำอยู่", "Project เสร็จแล้ว"] },
  { id: "project-all", name: "1. Project รวม", type: "table", table: TABLES.PROJECT, position: "menu" },
  { id: "banks", name: "2. ธนาคาร", type: "table", table: TABLES.BANK, position: "menu" },
  { id: "categories", name: "3. ประเภท", type: "table", table: TABLES.CATEGORY, position: "menu" },
  { id: "stores", name: "4. ร้านค้า", type: "table", table: TABLES.STORE, position: "menu" },
  { id: "contractors", name: "5. รับเหมา", type: "table", table: TABLES.CONTRACTOR, position: "menu" },
  { id: "people", name: "6. ชื่อพนักงาน", type: "table", table: TABLES.PEOPLE, position: "menu" },
  { id: "cars", name: "7. ทะเบียนรถ", type: "table", table: TABLES.CAR, position: "menu" },
  { id: "customers", name: "8.ลูกค้า", type: "table", table: TABLES.CUSTOMER, position: "menu" }
] as const;

export const VIEW_COLUMNS: Record<string, string[]> = {
  "กรอกบิล": ["ลำดับ", "ID Project", "ชื่อ Project", "ร้าน/บุคคล", "สินค้า/ทำงาน", "บิล", "ประเภท", "รายการ", "ยอดเงิน", "vat", "หัก", "เครดิต", "ผู้เบิก", "ว/ด/ป", "รูปถ่ายบิล", "สถานะ"],
  "เปิดจ้าง": ["id_Conwork", "id_Contractor", "ID Project", "ชื่อ Project", "ยอดเงินจ้าง", "รายละเอียดงาน", "วันที่", "เบอร์โทรศัพท์", "ยอดเงินจ่าย", "ค่าแรงคงเหลือ"],
  "1. Project รวม": ["ID Project", "ชื่อ Project", "ชื่อลูกค้า", "ยอดงาน", "ยอดรวม vat", "งบไม่เกิน", "วันที่", "color", "รวม ALL", "บริษัท", "รับผิดชอบ"],
  "2. ธนาคาร": ["id_bank", "ชื่อธนาคาร"],
  "3. ประเภท": ["ประเภท Name1", "ประเภท Name2", "ประเภท Name3"],
  "4. ร้านค้า": ["ชื่อร้านค้า", "ชื่อเต็ม", "เลขบัญชี", "เบอร์โทร", "ที่อยู่", "เลขที่ผู้เสียภาษี"],
  "5. รับเหมา": ["ชื่อเล่น", "ชื่อ-นามสกุล", "เลขบัญชี", "บัตรประจำตัวประชาชน", "เบอร์โทรศัพท์", "ที่อยู่", "รวมยอดเงินจ้าง", "จำกัดยอด/ปี"],
  "6. ชื่อพนักงาน": ["ชื่อเล่น", "ชื่อ-นามสกุล", "เลขบัญชี", "เบอร์โทร", "ที่อยู่", "เลขที่บัตรประชาชน"],
  "7. ทะเบียนรถ": ["หมายเลขทะเบียน", "ยี่ห้อรถ", "สี", "รับผิดชอบ", "รถของ"],
  "8.ลูกค้า": ["ชื่อลูกค้า", "ที่อยู่", "เลขที่ผู้เสียภาษี"]
};
