import { NextRequest, NextResponse } from "next/server";
import { clearCache } from "@/lib/cache";
import { PRIMARY_VIEWS, TABLE_KEYS, VIEW_COLUMNS } from "@/lib/config";
import { appendRow, deleteRows, getRows, updateRow } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  const tableName = request.nextUrl.searchParams.get("tableName");
  const viewName = request.nextUrl.searchParams.get("viewName") || "";
  const limit = Number(request.nextUrl.searchParams.get("limit") || 120);
  const search = request.nextUrl.searchParams.get("search") || "";
  if (!tableName) return NextResponse.json({ error: "Missing tableName" }, { status: 400 });

  let rows = await getRows(tableName);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(row => Object.values(row).some(value => String(value || "").toLowerCase().includes(q)));
  }
  const keyColumn = TABLE_KEYS[tableName] || "_RowNumber";
  rows = rows.slice(0, limit);

  return NextResponse.json({
    tableName,
    viewName,
    columns: VIEW_COLUMNS[viewName] || Object.keys(rows[0] || {}),
    keyColumn,
    rows
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tableName = String(body.tableName || "");
    if (!canManageTable(tableName)) return NextResponse.json({ error: "Table is not manageable" }, { status: 403 });

    const row = body.row && typeof body.row === "object" ? body.row : {};
    await appendRow(tableName, row);
    clearCache("rows:");
    clearCache("headers:");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const tableName = String(body.tableName || "");
    if (!canManageTable(tableName)) return NextResponse.json({ error: "Table is not manageable" }, { status: 403 });

    const sheetRow = Number(body.sheetRow);
    const values = body.values && typeof body.values === "object" ? body.values : {};
    const row = await updateRow(tableName, sheetRow, values);
    clearCache("rows:");
    return NextResponse.json({ ok: true, row });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const tableName = String(body.tableName || "");
    if (!canManageTable(tableName)) return NextResponse.json({ error: "Table is not manageable" }, { status: 403 });

    const sheetRows = Array.isArray(body.sheetRows) ? body.sheetRows.map(Number) : [];
    await deleteRows(tableName, sheetRows);
    clearCache("rows:");
    return NextResponse.json({ ok: true, deleted: sheetRows.length });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}

function canManageTable(tableName: string) {
  return PRIMARY_VIEWS.some(view => view.position === "menu" && view.type === "table" && view.table === tableName);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}
