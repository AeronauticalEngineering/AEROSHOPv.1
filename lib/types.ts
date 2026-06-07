export type RowValue = string | number | boolean | null;

export type SheetRow = Record<string, RowValue>;

export type FieldType =
  | "Text"
  | "LongText"
  | "Number"
  | "Decimal"
  | "Date"
  | "Enum"
  | "EnumList"
  | "Ref"
  | "Image"
  | "File"
  | "Hidden";

export type ShowIf = {
  column: string;
  equals?: string;
  in?: string[];
};

export type FieldSchema = {
  name: string;
  type: FieldType;
  key?: boolean;
  required?: boolean;
  readonly?: boolean;
  readonlyOnEdit?: boolean;
  initialValue?: string;
  values?: string[];
  inputMode?: "buttons" | "dropdown";
  refTable?: string;
  refKey?: string;
  refLabel?: string;
  validIf?: string;
  showIf?: ShowIf;
  description?: string;
  dynamicValues?: string;
  dynamicOptionSets?: Record<string, string[]>;
  refFill?: Record<string, string>;
  filterBy?: {
    field: string;
    column: string;
    openContract?: boolean;
  };
};

export type ViewConfig = {
  id: string;
  name: string;
  type: "dashboard" | "table" | "detail";
  table?: string;
  sourceTable?: string;
  position: "first" | "next" | "last" | "menu";
  items?: string[];
};

export type RefOption = {
  value: RowValue;
  label: string;
  row?: SheetRow;
};
