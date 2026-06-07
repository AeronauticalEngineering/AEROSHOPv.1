import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const db = admin.firestore();
    const settingsSnap = await db.doc("settings/store").get();
    if (!settingsSnap.exists) {
      return NextResponse.json({ error: "Settings not found" }, { status: 400 });
    }

    const settings = settingsSnap.data() || {};
    const token = settings?.lineChannelAccessToken;
    if (!token) {
      return NextResponse.json({ error: "LINE Channel Access Token is missing" }, { status: 400 });
    }

    const [quotaRes, consumptionRes] = await Promise.all([
      fetch("https://api.line.me/v2/bot/message/quota", {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch("https://api.line.me/v2/bot/message/quota/consumption", {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    if (!quotaRes.ok) {
      const err = await quotaRes.json().catch(() => ({}));
      return NextResponse.json({ error: err?.message || "Failed to fetch quota" }, { status: 400 });
    }

    if (!consumptionRes.ok) {
      const err = await consumptionRes.json().catch(() => ({}));
      return NextResponse.json({ error: err?.message || "Failed to fetch consumption" }, { status: 400 });
    }

    const quotaJson = await quotaRes.json();
    const consumptionJson = await consumptionRes.json();

    return NextResponse.json({
      type: quotaJson?.type ?? "limited",
      value: quotaJson?.value ?? null,
      totalUsage: consumptionJson?.totalUsage ?? null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
