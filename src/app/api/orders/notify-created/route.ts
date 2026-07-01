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

async function deductStock(db: FirebaseFirestore.Firestore, order: Record<string, unknown>) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) return;

  try {
    await db.runTransaction(async (transaction) => {
      const productIdsToRead = new Set<string>();
      const actions: { productId: string; variantId?: string; quantity: number }[] = [];

      for (const item of items) {
        const itemQuantity = Number(item.quantity) || 1;
        if (item.bundleItems && Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
          for (const bundleItem of item.bundleItems) {
            if (!bundleItem.productId) continue;
            if (typeof bundleItem.variantId === "string" && bundleItem.variantId.startsWith("custom-")) continue;

            productIdsToRead.add(bundleItem.productId);
            actions.push({
              productId: bundleItem.productId,
              variantId: typeof bundleItem.variantId === "string" && bundleItem.variantId ? bundleItem.variantId : undefined,
              quantity: itemQuantity * (Number(bundleItem.quantity) || 1)
            });
          }
        } else {
          if (!item.productId) continue;
          if (typeof item.variantId === "string" && item.variantId.startsWith("custom-")) continue;

          productIdsToRead.add(item.productId);
          actions.push({
            productId: item.productId,
            variantId: typeof item.variantId === "string" && item.variantId ? item.variantId : undefined,
            quantity: itemQuantity
          });
        }
      }

      if (productIdsToRead.size === 0) return;

      const productRefs = Array.from(productIdsToRead).map(id => db.doc(`products/${id}`));
      const productSnaps = await transaction.getAll(...productRefs);
      const productMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      productSnaps.forEach(snap => {
        if (snap.exists) productMap.set(snap.id, snap);
      });

      const updatesByProduct = new Map<string, Record<string, any>>();

      for (const action of actions) {
        const snap = productMap.get(action.productId);
        if (!snap) continue;

        const data = snap.data();
        if (!data) continue;

        const updateData = updatesByProduct.get(action.productId) || {};

        if (action.variantId) {
          const variants = updateData.variants || data.variants || [];
          const newVariants = variants.map((v: any) => {
            if (v.id === action.variantId) {
              return { ...v, stock: Math.max(0, Number(v.stock || 0) - action.quantity) };
            }
            return v;
          });
          updateData.variants = newVariants;
        } else {
          const currentStock = typeof updateData.stock === "number" ? updateData.stock : Number(data.stock || 0);
          updateData.stock = Math.max(0, currentStock - action.quantity);
        }

        updatesByProduct.set(action.productId, updateData);
      }

      for (const [productId, updateData] of updatesByProduct.entries()) {
        transaction.update(db.doc(`products/${productId}`), updateData);
      }
    });
    console.log(`Stock successfully deducted for order ${order.orderId || order.id || ""}`);
  } catch (error) {
    console.error("Error deducting stock:", error);
  }
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
    
    // Deduct stock asynchronously (we don't await strictly to not block notifications, but we can await it too)
    await deductStock(db, { ...order, orderId });

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
