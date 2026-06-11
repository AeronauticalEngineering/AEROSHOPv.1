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

function getStorageBucketName() {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
}

function isNotFoundStorageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return normalized.includes("not found") || normalized.includes("no such object") || normalized.includes("404");
}

async function deleteStorageObjects(storagePaths: string[]) {
  const bucketName = getStorageBucketName();
  if (!bucketName || storagePaths.length === 0) {
    return {
      deletedStorageCount: 0,
      failedStorageDeleteCount: 0,
      storageDeleteSkipped: !bucketName && storagePaths.length > 0
    };
  }

  const bucket = admin.storage().bucket(bucketName);
  let deletedStorageCount = 0;
  let failedStorageDeleteCount = 0;

  await Promise.all(storagePaths.map(async (storagePath) => {
    try {
      await bucket.file(storagePath).delete();
      deletedStorageCount += 1;
    } catch (error) {
      if (isNotFoundStorageError(error)) {
        deletedStorageCount += 1;
        return;
      }
      failedStorageDeleteCount += 1;
      console.error("Failed to delete slip storage object:", storagePath, error);
    }
  }));

  return {
    deletedStorageCount,
    failedStorageDeleteCount,
    storageDeleteSkipped: false
  };
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
    let deletedStorageCount = 0;
    let failedStorageDeleteCount = 0;
    let storageDeleteSkipped = false;

    while (true) {
      const snap = await db
        .collection("payment_slips")
        .where("createdAt", "<=", cutoffTimestamp)
        .limit(BATCH_LIMIT)
        .get();

      if (snap.empty) {
        break;
      }

      const storagePaths = snap.docs
        .map((item) => item.data()?.storagePath)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      const storageResult = await deleteStorageObjects(storagePaths);
      deletedStorageCount += storageResult.deletedStorageCount;
      failedStorageDeleteCount += storageResult.failedStorageDeleteCount;
      storageDeleteSkipped = storageDeleteSkipped || storageResult.storageDeleteSkipped;

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
      deletedStorageCount,
      failedStorageDeleteCount,
      storageDeleteSkipped,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
