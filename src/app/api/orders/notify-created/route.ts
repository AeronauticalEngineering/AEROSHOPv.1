import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";
import { buildAdminNewOrderFlex, sendLineMessage } from "@/lib/lineNotify";
import { buildReceiptFlexMessage } from "@/lib/line/flex";

export const runtime = "nodejs";

const notifyEnabled = (value: unknown) => value !== false;

async function resolveCustomerLineId(db: FirebaseFirestore.Firestore, order: Record<string, unknown>) {
  const directLineId = order.lineId;
  if (typeof directLineId === "string" && directLineId) return directLineId;

  const customerId = order.customerId;
  if (typeof customerId !== "string" || !customerId) return null;
  const customerSnap = await db.doc(`customers/${customerId}`).get();
  if (!customerSnap.exists) return null;
  const customer = customerSnap.data() || {};
  const lineId = customer.lineId;
  return typeof lineId === "string" && lineId ? lineId : null;
}

export async function POST(req: Request) {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId as string | undefined;
    if (!orderId) {
      return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });
    }

    const db = admin.firestore();
    const notificationRef = db.doc(`order_notification_locks/${orderId}_created`);
    try {
      await notificationRef.create({
        orderId,
        type: "created",
        status: "processing",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined;
      if (code === 6 || code === "already-exists") {
        return NextResponse.json({ ok: true, duplicate: true, adminNotified: false, customerNotified: false });
      }
      throw error;
    }

    const orderSnap = await db.doc(`orders/${orderId}`).get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const order = orderSnap.data() || {};

    const settingsSnap = await db.doc("settings/store").get();
    if (!settingsSnap.exists) return NextResponse.json({ ok: true });
    const settings = settingsSnap.data() || {};

    const token = settings?.lineChannelAccessToken;
    const adminTargets = [settings?.lineAdminUserId, settings?.lineAdminGroupId].filter(Boolean);
    if (!token) return NextResponse.json({ ok: true });
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || null;
    const items = Array.isArray(order.items)
      ? order.items.map((item: Record<string, unknown>) => ({
        name: String(item.productName || item.name || "สินค้า"),
        quantity: Number(item.quantity || 0)
      }))
      : [];

    let adminNotified = false;
    let customerNotified = false;

    if (notifyEnabled(settings?.lineNotifyAdminNewOrder) && adminTargets.length > 0) {
      const adminFlex = buildAdminNewOrderFlex({
        orderId,
        amount: order?.totalAmount,
        customerName: order?.customerName,
        customerPhone: order?.customerPhone,
        paymentMethod: order?.paymentMethod,
        items,
        liffId
      });

      await sendLineMessage({ token, targets: adminTargets, message: adminFlex });
      adminNotified = true;
    }

    if (notifyEnabled(settings?.lineNotifyCustomerOrderSuccess) && liffId) {
      const customerLineId = await resolveCustomerLineId(db, order);
      if (customerLineId) {
        const customerFlex = buildReceiptFlexMessage({
          orderId,
          liffId,
          orderData: order
        });
        await sendLineMessage({ token, targets: [customerLineId], message: customerFlex });
        customerNotified = true;
      }
    }

    await notificationRef.set({
      status: "sent",
      adminNotified,
      customerNotified,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return NextResponse.json({ ok: true, adminNotified, customerNotified });
  } catch (err: unknown) {
    console.error("order_notify_created:error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
