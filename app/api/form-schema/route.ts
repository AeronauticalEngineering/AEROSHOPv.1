import { NextRequest, NextResponse } from "next/server";
import { getFormPayload } from "@/lib/form";

export async function GET(request: NextRequest) {
  const tableName = request.nextUrl.searchParams.get("tableName");
  if (!tableName) return NextResponse.json({ error: "Missing tableName" }, { status: 400 });
  return NextResponse.json(await getFormPayload(tableName));
}
