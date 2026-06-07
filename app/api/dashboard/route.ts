import { NextRequest, NextResponse } from "next/server";
import { clearCache } from "@/lib/cache";
import { TABLES } from "@/lib/config";
import { getRows } from "@/lib/sheets";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("refresh") === "1") {
    clearCache("rows:");
  }

  const [dataRows, projectRows] = await Promise.all([
    getRows(TABLES.DATA),
    getRows(TABLES.PROJECT)
  ]);

  return NextResponse.json({
    dataRows,
    projectRows,
    totalRows: dataRows.length,
    projectRowsCount: projectRows.length
  });
}
