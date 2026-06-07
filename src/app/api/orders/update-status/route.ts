import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";
import { buildAdminPaymentFlex, buildOrderStatusFlex, sendLineMessage } from "@/lib/lineNotify";

export const runtime = "nodejs";

const allowedStatuses = ["pending", "paid", "shipped", "completed", "cancelled", "returned"] as const;
type AllowedStatus = (typeof allowedStatuses)[number];

type OrderStatusUpdateData = {
  lineId?: string;
  customerId?: string;
  totalAmount?: number;
  customerName?: string;
  paymentMethod?: string;
  paymentDetail?: string | null;
  shippingDetail?: string | null;
  completionDetail?: string | null;
  trackingNumber?: string | null;
  cancelReason?: string | null;
  refundChannel?: string | null;
  returnReason?: string | null;
};

const notifyEnabled = (value: unknown) => value !== false;

async function resolveCustomerLineId(db: FirebaseFirestore.Firestore, order: OrderStatusUpdateData) {
  if (order?.lineId) return order.lineId as string;
  if (!order?.customerId) return null;
  const customerSnap = await db.doc(`customers/${order.customerId}`).get();
  if (!customerSnap.exists) return null;
  const customer = customerSnap.data() || {};
  const lineId = (customer as { lineId?: string }).lineId;
  return lineId || null;
}

export async function POST(req: Request) {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = body?.orderId as string | undefined;
    const status = body?.status as AllowedStatus | undefined;
    const paymentDetail = (body?.paymentDetail as string | undefined) || null;
    const shippingDetail = (body?.shippingDetail as string | undefined) || null;
    const completionDetail = (body?.completionDetail as string | undefined) || null;
    const trackingNumber = (body?.trackingNumber as string | undefined) || null;
    const cancelReason = (body?.cancelReason as string | undefined) || null;
    const refundChannel = (body?.refundChannel as string | undefined) || null;
    const returnReason = (body?.returnReason as string | undefined) || null;

    if (!orderId || !status || !allowedStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid orderId or status" }, { status: 400 });
    }

    const db = admin.firestore();
    const orderRef = db.doc(`orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = (orderSnap.data() || {}) as OrderStatusUpdateData;
    console.log("order_status_update:request", { orderId, status });
    await orderRef.set(
      {
        status,
        ...(status === "paid"
          ? {
              paymentDetail,
              paymentStatus: "verified",
              paidAt: admin.firestore.FieldValue.serverTimestamp()
            }
          : {}),
        ...(status === "shipped" ? { shippingDetail, trackingNumber } : {}),
        ...(status === "completed" ? { completionDetail } : {}),
        ...(status === "cancelled"
          ? { cancelReason, refundChannel, cancelledAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
        ...(status === "returned"
          ? { returnReason, returnedAt: admin.firestore.FieldValue.serverTimestamp() }
          : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    console.log("order_status_update:db_updated", { orderId, status });
    const orderForNotify = {
      ...order,
      totalAmount: order?.totalAmount,
      status,
      paymentDetail: status === "paid" ? paymentDetail : order?.paymentDetail,
      shippingDetail: status === "shipped" ? shippingDetail : order?.shippingDetail,
      completionDetail: status === "completed" ? completionDetail : order?.completionDetail,
      trackingNumber: status === "shipped" ? trackingNumber : order?.trackingNumber,
      cancelReason: status === "cancelled" ? cancelReason : order?.cancelReason,
      refundChannel: status === "cancelled" ? refundChannel : order?.refundChannel,
      returnReason: status === "returned" ? returnReason : order?.returnReason
    };

    const settingsSnap = await db.doc("settings/store").get();
    if (!settingsSnap.exists) {
      console.log("order_status_update:settings_missing", { orderId });
      return NextResponse.json({ ok: true });
    }
    const settings = settingsSnap.data() || {};
    const token = settings?.lineChannelAccessToken;
    if (!token) {
      console.log("order_status_update:token_missing", { orderId });
      return NextResponse.json({ ok: true });
    }

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || null;

    const customerLineId = await resolveCustomerLineId(db, order);
    const adminTargets = [settings?.lineAdminUserId, settings?.lineAdminGroupId].filter(Boolean);
    console.log("order_status_update:settings_loaded", {
      orderId,
      status,
      hasToken: Boolean(token),
      liffId: liffId ? "set" : "missing",
      adminTargetsCount: adminTargets.length,
      customerLineId: customerLineId ? "set" : "missing",
      lineNotifyAdminPayment: notifyEnabled(settings?.lineNotifyAdminPayment),
      lineNotifyAdminOrder: notifyEnabled(settings?.lineNotifyAdminOrder),
      lineNotifyAdminCancelled: notifyEnabled(settings?.lineNotifyAdminCancelled),
      lineNotifyCustomerPaymentConfirmed: notifyEnabled(settings?.lineNotifyCustomerPaymentConfirmed),
      lineNotifyCustomerShipped: notifyEnabled(settings?.lineNotifyCustomerShipped),
      lineNotifyCustomerCancelled: notifyEnabled(settings?.lineNotifyCustomerCancelled)
    });

    if (status === "paid" && notifyEnabled(settings?.lineNotifyAdminPayment) && adminTargets.length > 0) {
      const adminFlex = buildAdminPaymentFlex({
        orderId,
        amount: order?.totalAmount,
        customerName: order?.customerName,
        paymentMethod: order?.paymentMethod
      });
      console.log("order_status_update:send_admin", { orderId, status, targets: adminTargets.length });
      await sendLineMessage({ token, targets: adminTargets, message: adminFlex });
    }

    const shouldNotifyAdminStatus =
      adminTargets.length > 0 &&
      status !== "pending" &&
      status !== "paid" &&
      (status === "cancelled"
        ? notifyEnabled(settings?.lineNotifyAdminCancelled)
        : notifyEnabled(settings?.lineNotifyAdminOrder));

    if (shouldNotifyAdminStatus) {
      const adminStatusFlex = buildOrderStatusFlex({
        status: status as "paid" | "shipped" | "completed" | "cancelled" | "returned",
        orderId,
        amount: orderForNotify?.totalAmount,
        trackingNumber: orderForNotify?.trackingNumber || null,
        detail:
          status === "shipped"
            ? orderForNotify?.shippingDetail || null
            : status === "completed"
            ? orderForNotify?.completionDetail || null
            : status === "cancelled"
            ? orderForNotify?.cancelReason || null
            : status === "returned"
            ? orderForNotify?.returnReason || null
            : null,
        liffId
      });
      console.log("order_status_update:send_admin_status", { orderId, status, targets: adminTargets.length });
      await sendLineMessage({ token, targets: adminTargets, message: adminStatusFlex });
    }

    if (customerLineId) {
      const shouldSendCustomer =
        (status === "paid" && notifyEnabled(settings?.lineNotifyCustomerPaymentConfirmed)) ||
        (status === "shipped" && notifyEnabled(settings?.lineNotifyCustomerShipped)) ||
        (status === "cancelled" && notifyEnabled(settings?.lineNotifyCustomerCancelled));

      if (shouldSendCustomer) {
        const customerFlex = buildOrderStatusFlex({
          status: status as "paid" | "shipped" | "cancelled",
          orderId,
          amount: orderForNotify?.totalAmount,
          trackingNumber: orderForNotify?.trackingNumber || null,
          detail:
            status === "paid"
              ? orderForNotify?.paymentDetail || null
              : status === "shipped"
              ? orderForNotify?.shippingDetail || null
              : status === "cancelled"
              ? orderForNotify?.cancelReason || null
              : null,
          liffId
        });
        console.log("order_status_update:send_customer", { orderId, status, target: customerLineId });
        await sendLineMessage({ token, targets: [customerLineId], message: customerFlex });
      } else {
        console.log("order_status_update:skip_customer", { orderId, status, reason: "setting_disabled" });
      }
    } else {
      console.log("order_status_update:skip_customer", { orderId, status, reason: "missing_customer_line_id" });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("order_status_update:error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
