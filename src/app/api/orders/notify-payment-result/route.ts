import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";
import { buildOrderStatusFlex, sendLineMessage } from "@/lib/lineNotify";

export const runtime = "nodejs";

type NotifyType = "manual" | "gateway_paid" | "failed";

const notifyEnabled = (value: unknown) => value !== false;

async function resolveCustomerLineId(
  db: FirebaseFirestore.Firestore,
  order: Record<string, unknown>
) {
  const directLineId = order.lineId;
  if (typeof directLineId === "string" && directLineId) return directLineId;

  const customerId = order.customerId;
  if (typeof customerId !== "string" || !customerId) return null;
  const customerSnap = await db.doc(`customers/${customerId}`).get();
  if (!customerSnap.exists) return null;
  const customer = (customerSnap.data() || {}) as Record<string, unknown>;
  const lineId = customer.lineId;
  return typeof lineId === "string" && lineId ? lineId : null;
}

export async function POST(req: Request) {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.orderId === "string" ? body.orderId : undefined;
    const rawType = body?.type;
    const type: NotifyType | undefined =
      rawType === "manual" || rawType === "gateway_paid" || rawType === "failed"
        ? rawType
        : undefined;
    const message = typeof body?.message === "string" ? body.message : "";

    if (!orderId || !type) {
      return NextResponse.json({ error: "Missing orderId or type" }, { status: 400 });
    }

    const db = admin.firestore();
    const notificationRef = db.doc(`order_notification_locks/${orderId}_payment_${type}`);
    try {
      await notificationRef.create({
        orderId,
        type: `payment_${type}`,
        status: "processing",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined;
      if (code === 6 || code === "already-exists") {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      throw error;
    }

    const orderRef = db.doc(`orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = (orderSnap.data() || {}) as Record<string, unknown>;
    const settingsSnap = await db.doc("settings/store").get();
    if (!settingsSnap.exists) return NextResponse.json({ ok: true });
    const settings = settingsSnap.data() || {};

    const token = settings?.lineChannelAccessToken;
    if (!token) return NextResponse.json({ ok: true });

    if (!notifyEnabled(settings?.lineNotifyCustomerPaymentConfirmed)) {
      return NextResponse.json({ ok: true, reason: "customer_payment_notification_disabled" });
    }

    const customerLineId = await resolveCustomerLineId(db, order);
    if (!customerLineId) return NextResponse.json({ ok: true, reason: "missing_customer_line_id" });

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || null;
    const amount = Number(order?.totalAmount || 0);

    let lineMessage: Record<string, unknown>;

    if (type === "gateway_paid") {
      lineMessage = buildOrderStatusFlex({
        status: "paid",
        orderId,
        amount: Number.isFinite(amount) ? amount : 0,
        detail: message || "ชำระเงินผ่าน Payment Gateway สำเร็จ",
        liffId
      });
    } else if (type === "manual") {
      lineMessage = buildOrderStatusFlex({
        status: "paid",
        orderId,
        amount: Number.isFinite(amount) ? amount : 0,
        detail: message || "ได้รับหลักฐานการชำระเงินแล้ว รอเจ้าหน้าที่ตรวจสอบ",
        liffId
      });
    } else {
      lineMessage = buildOrderStatusFlex({
        status: "cancelled",
        orderId,
        amount: Number.isFinite(amount) ? amount : 0,
        detail: message || "ตรวจสอบการชำระเงินไม่สำเร็จ กรุณาตรวจสอบและลองใหม่อีกครั้ง",
        liffId
      });
    }

    await sendLineMessage({
      token,
      targets: [customerLineId],
      message: lineMessage
    });

    await notificationRef.set({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("notify_payment_result:error", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


