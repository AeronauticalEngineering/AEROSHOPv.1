import { TABLES } from "@/lib/config";
import type { FieldSchema } from "@/lib/types";

export const FORM_SCHEMAS: Record<string, FieldSchema[]> = {
  [TABLES.DATA]: [
    { name: "ลำดับ", type: "Text", key: true, initialValue: "nextDataSequence", required: true, readonlyOnEdit: true },
    { name: "ID Project", type: "Ref", refTable: TABLES.PROJECT, refKey: "ID Project", refLabel: "ชื่อ Project", validIf: "activeProjects", required: true, refFill: { "ชื่อ Project": "ชื่อ Project" } },
    { name: "ชื่อ Project", type: "Hidden" },
    { name: "ชื่อบริษัท", type: "Hidden" },
    { name: "บิล", type: "Enum", values: ["หลัก", "ย่อย"], initialValue: "ย่อย", required: true },
    { name: "ร้านค้า/ผู้รับเหมา", type: "Enum", values: ["ร้านค้า", "ผู้รับเหมา"], inputMode: "buttons", initialValue: "ร้านค้า", required: true, description: "ร้านค้า บริษัท และ หจก. : ผู้รับเหมา และนิติบุคคล" },
    { name: "ร้านค้า", type: "Ref", refTable: TABLES.STORE, refKey: "id_store", refLabel: "ชื่อร้านค้า", showIf: { column: "ร้านค้า/ผู้รับเหมา", equals: "ร้านค้า" } },
    { name: "ผู้รับเหมา", type: "Ref", refTable: TABLES.CONTRACT_WORK, refKey: "id_Conwork", refLabel: "ชื่อเล่น", showIf: { column: "ร้านค้า/ผู้รับเหมา", equals: "ผู้รับเหมา" }, filterBy: { field: "ID Project", column: "ID Project", openContract: true }, refFill: { "รายละเอียดงาน": "รายละเอียดงาน", "ค่าแรงคงเหลือ": "ค่าแรงคงเหลือ" } },
    { name: "รายละเอียดงาน", type: "Text", readonly: true, showIf: { column: "ร้านค้า/ผู้รับเหมา", equals: "ผู้รับเหมา" } },
    { name: "สินค้า", type: "Enum", values: ["เหล็กเส้น", "รูปพรรณ", "คอนกรีต", "ไม้แบบ", "วัสดุมุง", "ฝ้าผนัง", "ปูพื้น", "กระจก", "ไฟฟ้า", "ประปา", "อื่นๆ", "สีเคมี", "สุขภัณฑ์", "บิวอิน", "แอร์", "ดิน", "หินทราย", "เตรียมงาน", "non"], description: "อื่นๆคือสินค้าทั่วไป | non : 7.เครื่องมือ 8.อื่นๆ ที่พัก", showIf: { column: "ร้านค้า/ผู้รับเหมา", equals: "ร้านค้า" } },
    { name: "ประเภท", type: "Enum", values: ["1.ค่าของ", "2.ค่าแรง", "3.พนักงาน", "4.น้ำมัน", "5.ซ่อมรถ", "6.เครื่องจักร", "7.เครื่องมือ", "8.อื่นๆ"], inputMode: "buttons", required: true, dynamicValues: "billTypeOptions" },
    { name: "รูปถ่ายบิล", type: "Image", showIf: { column: "ประเภท", in: ["1.ค่าของ", "2.ค่าแรง", "3.พนักงาน", "4.น้ำมัน", "5.ซ่อมรถ", "6.เครื่องจักร", "7.เครื่องมือ", "8.อื่นๆ"] } },
    { name: "ค่าของ", type: "Decimal", showIf: { column: "ประเภท", equals: "1.ค่าของ" } },
    { name: "รายการ", type: "Text" },
    { name: "ชื่อเครื่องมือ", type: "Text", showIf: { column: "ประเภท", equals: "7.เครื่องมือ" } },
    { name: "เครื่องมือ", type: "Decimal", showIf: { column: "ประเภท", equals: "7.เครื่องมือ" } },
    { name: "น้ำมัน", type: "Decimal", showIf: { column: "ประเภท", equals: "4.น้ำมัน" } },
    { name: "ซ่อมรถ", type: "Decimal", showIf: { column: "ประเภท", equals: "5.ซ่อมรถ" } },
    { name: "ทะเบียน", type: "Ref", refTable: TABLES.CAR, refKey: "id_car", refLabel: "หมายเลขทะเบียน", showIf: { column: "ประเภท", in: ["4.น้ำมัน", "5.ซ่อมรถ"] } },
    { name: "เครื่องจักร", type: "Decimal", showIf: { column: "ประเภท", equals: "6.เครื่องจักร" } },
    { name: "statusค่าแรง", type: "Enum", values: ["บุคคลธรรมดา", "บริษัท"], inputMode: "buttons", showIf: { column: "ประเภท", equals: "2.ค่าแรง" } },
    { name: "ค่าแรงคงเหลือ", type: "Decimal", readonly: true, showIf: { column: "ร้านค้า/ผู้รับเหมา", equals: "ผู้รับเหมา" } },
    { name: "อื่นๆ", type: "Decimal", showIf: { column: "ประเภท", equals: "8.อื่นๆ" } },
    { name: "vat", type: "Enum", values: ["7"], showIf: { column: "ประเภท", in: ["1.ค่าของ", "4.น้ำมัน", "5.ซ่อมรถ", "6.เครื่องจักร", "7.เครื่องมือ", "8.อื่นๆ"] } },
    { name: "ค่าแรง", type: "Decimal", showIf: { column: "ประเภท", equals: "2.ค่าแรง" } },
    { name: "วันได้บิล", type: "Date", showIf: { column: "vat", equals: "7" } },
    { name: "หัก", type: "Enum", values: ["3"], showIf: { column: "ประเภท", equals: "2.ค่าแรง" } },
    { name: "วันออก 3%", type: "Date", showIf: { column: "หัก", equals: "3" } },
    { name: "ชื่อพนักงาน", type: "Ref", refTable: TABLES.PEOPLE, refKey: "รหัสพนักงาน", refLabel: "ชื่อเล่น", showIf: { column: "ประเภท", equals: "3.พนักงาน" } },
    { name: "พนักงาน", type: "Decimal", showIf: { column: "ประเภท", equals: "3.พนักงาน" } },
    { name: "เครดิต", type: "Text" },
    { name: "วันจ่าย", type: "Date" },
    { name: "ผู้เบิก", type: "Ref", refTable: TABLES.PEOPLE, refKey: "รหัสพนักงาน", refLabel: "ชื่อเล่น" },
    { name: "ว/ด/ป", type: "Date", initialValue: "today" },
    { name: "สถานะ", type: "Hidden", initialValue: "อนุมัติ" },
    { name: "ยอดเงิน", type: "Hidden" },
    { name: "ร้าน/บุคคล", type: "Hidden" },
    { name: "สินค้า/ทำงาน", type: "Hidden" },
    { name: "ยอดโอน", type: "Hidden" }
  ],
  [TABLES.CONTRACT_WORK]: [
    { name: "id_Conwork", type: "Text", key: true, initialValue: "nextContractWorkId", required: true, readonlyOnEdit: true },
    {
      name: "ID Project",
      type: "Ref",
      refTable: TABLES.PROJECT,
      refKey: "ID Project",
      refLabel: "ชื่อ Project",
      validIf: "activeProjects",
      required: true,
      refFill: {
        "ชื่อ Project": "ชื่อ Project",
        "สถานที่": "สถานที่"
      }
    },
    { name: "ชื่อ Project", type: "Text", readonly: true },
    {
      name: "id_Contractor",
      type: "Ref",
      refTable: TABLES.CONTRACTOR,
      refKey: "id_Contractor",
      refLabel: "ชื่อเล่น",
      required: true,
      refFill: {
        "ชื่อเล่น": "ชื่อเล่น",
        "ชื่อ-นามสกุล": "ชื่อ-นามสกุล",
        "เลขบัญชี": "เลขบัญชี",
        "ธนาคาร": "ธนาคาร",
        "บัตรประจำตัวประชาชน": "บัตรประจำตัวประชาชน",
        "เบอร์โทรศัพท์": "เบอร์โทรศัพท์",
        "ที่อยู่": "ที่อยู่"
      }
    },
    { name: "ชื่อเล่น", type: "Text", readonly: true },
    { name: "ชื่อ-นามสกุล", type: "Text", readonly: true },
    { name: "เลขบัญชี", type: "Text", readonly: true },
    { name: "ธนาคาร", type: "Ref", refTable: TABLES.BANK, refKey: "id_bank", refLabel: "ชื่อธนาคาร", readonly: true },
    { name: "ยอดเงินจ้าง", type: "Decimal", required: true },
    { name: "รายละเอียดงาน", type: "EnumList", values: ["งานหลังคา", "งานผูกเหล็ก"], description: "เลือกได้หลายรายการ หรือพิมพ์เพิ่มเติมได้ คั่นด้วย comma" },
    { name: "สถานที่", type: "Text", readonly: true },
    { name: "วันที่", type: "Date", initialValue: "today" },
    { name: "บัตรประจำตัวประชาชน", type: "Text", readonly: true },
    { name: "เบอร์โทรศัพท์", type: "Text", readonly: true },
    { name: "ที่อยู่", type: "LongText", readonly: true },
    { name: "ยอดเงินจ่าย", type: "Decimal", readonly: true },
    { name: "ค่าแรงคงเหลือ", type: "Decimal", readonly: true }
  ]
};

export function getFormSchema(tableName: string) {
  return FORM_SCHEMAS[tableName] || [];
}

export function getRefRowColumns(column: FieldSchema) {
  const columns: string[] = [];
  if (column.refFill) Object.values(column.refFill).forEach(value => columns.push(value));
  if (column.filterBy) {
    columns.push(column.filterBy.column);
    if (column.filterBy.openContract) columns.push("ยอดเงินจ้าง", "ยอดเงินจ่าย");
  }
  return columns;
}
