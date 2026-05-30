import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";
import { buildAdminIssueFlex, sendLineMessage } from "@/lib/lineNotify";

export const runtime = "nodejs";

type IssueStatus = "cancelled" | "returned";

const notifyEnabled = (value: unknown) => value !== false;

const isIssueStatus = (value: unknown): value is IssueStatus =>
  value === "cancelled" || value === "returned";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const resolveAdminTargets = (settings: Record<string, unknown>) => {
  const adminUsers = Array.isArray(settings.lineAdminUsers)
    ? settings.lineAdminUsers
        .map((user) => asRecord(user).userId)
        .filter((userId): userId is string => typeof userId === "string" && userId.trim().length > 0)
    : [];

  return [
    typeof settings.lineAdminUserId === "string" ? settings.lineAdminUserId : "",
    ...adminUsers,
    typeof settings.lineAdminGroupId === "string" ? settings.lineAdminGroupId : ""
  ].filter(Boolean);
};

export async function POST(req: Request) {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    const itemIndex = Number(body?.itemIndex);
    const issueStatus = isIssueStatus(body?.issueStatus) ? body.issueStatus : undefined;
    const issueReason = typeof body?.issueReason === "string" ? body.issueReason.trim() : "";

    if (!orderId || !Number.isInteger(itemIndex) || itemIndex < 0 || !issueStatus || issueReason.length < 3) {
      return NextResponse.json({ error: "Invalid issue notification payload" }, { status: 400 });
    }

    const db = admin.firestore();
    const orderSnap = await db.doc(`orders/${orderId}`).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = orderSnap.data() || {};
    const items = Array.isArray(order.items) ? order.items.map(asRecord) : [];
    const item = items[itemIndex];
    if (!item) {
      return NextResponse.json({ error: "Order item not found" }, { status: 404 });
    }

    const settingsSnap = await db.doc("settings/store").get();
    if (!settingsSnap.exists) return NextResponse.json({ ok: true, reason: "settings_missing" });

    const settings = settingsSnap.data() || {};
    const token = typeof settings.lineChannelAccessToken === "string" ? settings.lineChannelAccessToken : "";
    const adminTargets = resolveAdminTargets(settings);

    if (!token || adminTargets.length === 0 || !notifyEnabled(settings.lineNotifyAdminOrder)) {
      return NextResponse.json({ ok: true, reason: "admin_notification_disabled" });
    }

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || null;
    const amount = Number(order.totalAmount || 0);

    const message = buildAdminIssueFlex({
      orderId,
      amount: Number.isFinite(amount) ? amount : 0,
      customerName: typeof order.customerName === "string" ? order.customerName : undefined,
      customerPhone: typeof order.customerPhone === "string" ? order.customerPhone : undefined,
      itemName: typeof item.productName === "string" ? item.productName : undefined,
      issueStatus,
      issueReason,
      liffId
    });

    await sendLineMessage({ token, targets: adminTargets, message });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("order_notify_issue:error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
