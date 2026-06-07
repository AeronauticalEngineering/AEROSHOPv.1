import { NextResponse } from "next/server";
import { APP_NAME, PRIMARY_VIEWS, VIEW_COLUMNS } from "@/lib/config";
import { FORM_SCHEMAS } from "@/lib/schemas";

export async function GET() {
  return NextResponse.json({
    appName: APP_NAME,
    views: PRIMARY_VIEWS,
    viewColumns: VIEW_COLUMNS,
    formSchemas: FORM_SCHEMAS
  });
}
