import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";
import { releaseUnpaidPendingOrdersStock } from "@/lib/stockManagement";

export const runtime = "nodejs";

export async function POST() {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json({ ok: false, error: "Firebase Admin not configured" }, { status: 500 });
    }

    const db = admin.firestore();
    const { releasedOrders } = await releaseUnpaidPendingOrdersStock(db);

    return NextResponse.json({
      ok: true,
      releasedCount: releasedOrders.length,
      releasedOrders
    });
  } catch (error: unknown) {
    console.error("Error releasing unpaid stock:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

