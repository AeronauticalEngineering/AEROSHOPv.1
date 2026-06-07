import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const ALLOWED_MONTHS = new Set([1, 3, 6]);
const BATCH_LIMIT = 400;

function getCutoffDate(months: number) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

export async function POST(req: Request) {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json(
        { error: "Firebase Admin not configured" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const months = Number(body?.months);

    if (!ALLOWED_MONTHS.has(months)) {
      return NextResponse.json(
        { error: "months must be one of 1, 3, 6" },
        { status: 400 }
      );
    }

    const db = admin.firestore();
    const cutoffDate = getCutoffDate(months);
    const cutoffTimestamp = admin.firestore.Timestamp.fromDate(cutoffDate);
    let deletedCount = 0;

    while (true) {
      const snap = await db
        .collection("payment_slips")
        .where("createdAt", "<=", cutoffTimestamp)
        .limit(BATCH_LIMIT)
        .get();

      if (snap.empty) {
        break;
      }

      const batch = db.batch();
      snap.docs.forEach((item) => batch.delete(item.ref));
      await batch.commit();
      deletedCount += snap.size;

      if (snap.size < BATCH_LIMIT) {
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      months,
      cutoffDate: cutoffDate.toISOString(),
      deletedCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
