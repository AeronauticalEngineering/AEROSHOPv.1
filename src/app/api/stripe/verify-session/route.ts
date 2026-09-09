import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";
import { deductOrderStock } from "@/lib/stockManagement";
import { buildAdminPaymentFlex, buildOrderStatusFlex, sendLineMessage } from "@/lib/lineNotify";

export const runtime = "nodejs";

const notifyEnabled = (value: unknown) => value !== false;

async function notifyPaymentVerified(
  settings: Record<string, unknown>,
  orderData: Record<string, unknown> | null,
  orderId: string,
  amount: number
) {
  try {
    const token = typeof settings?.lineChannelAccessToken === "string" ? settings.lineChannelAccessToken : "";
    if (!token) return;
    const db = admin.firestore();

    const adminTargets = [settings?.lineAdminUserId, settings?.lineAdminGroupId].filter(Boolean).map(String);
    if (notifyEnabled(settings?.lineNotifyAdminPayment) && adminTargets.length > 0) {
      const adminFlex = buildAdminPaymentFlex({
        orderId,
        amount,
        customerName: typeof orderData?.customerName === "string" ? orderData.customerName : undefined,
        paymentMethod: "stripe"
      });
      await sendLineMessage({ token, targets: adminTargets, message: adminFlex });
    }

    if (!notifyEnabled(settings?.lineNotifyCustomerPaymentConfirmed)) return;
    let customerLineId = typeof orderData?.lineId === "string" ? orderData.lineId : null;
    if (!customerLineId && orderData?.customerId) {
      const customerSnap = await db.doc(`customers/${String(orderData.customerId)}`).get();
      if (customerSnap.exists) {
        const customer = customerSnap.data() || {};
        customerLineId = typeof customer.lineId === "string" ? customer.lineId : null;
      }
    }
    if (!customerLineId) return;

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || null;
    const customerFlex = buildOrderStatusFlex({
      status: "paid",
      orderId,
      amount,
      trackingNumber: typeof orderData?.trackingNumber === "string" ? orderData.trackingNumber : null,
      liffId
    });
    await sendLineMessage({ token, targets: [customerLineId], message: customerFlex });
  } catch (err) {
    console.error("LINE notify failed for Stripe payment:", err);
  }
}

export async function POST(req: Request) {
    try {
        if (!isFirebaseAdminReady()) {
            return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
        }

        const { session_id, orderId } = await req.json().catch(() => ({}));

        if (!session_id || !orderId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const db = admin.firestore();
        const settingsSnap = await db.doc('settings/store').get();

        if (!settingsSnap.exists) {
            return NextResponse.json({ error: 'Store settings not found' }, { status: 500 });
        }

        const settingsData = settingsSnap.data() || {};

        if (!settingsData.enableStripe || !settingsData.stripeSecretKey) {
            return NextResponse.json({ error: 'Stripe is not configured or enabled on this store' }, { status: 400 });
        }

        const stripe = new Stripe(settingsData.stripeSecretKey as string);

        // Retrieve the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(session_id);

        // Verify session belongs to this orderId
        const sessionOrderId = session.client_reference_id || session.metadata?.orderId;
        if (sessionOrderId && sessionOrderId !== orderId) {
            return NextResponse.json({ error: "Session does not match order" }, { status: 400 });
        }

        const orderRef = db.doc(`orders/${orderId}`);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        const orderData = orderSnap.data() || {};

        if (session.payment_status === 'paid') {
            // Deduct stock for Stripe order
            await deductOrderStock(db, orderData, orderId);

            // Update the order in Firestore
            await orderRef.set({
                status: 'paid',
                paymentMethod: 'stripe',
                paymentStatus: 'verified', // Standardized with rest of system
                stripeSessionId: session_id,
                stripePaymentIntentId: session.payment_intent,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            // Notify admin and customer via LINE
            await notifyPaymentVerified(
                settingsData,
                orderData,
                orderId,
                Number(orderData.totalAmount) || 0
            );

            return NextResponse.json({ success: true, payment_status: 'paid' });
        } else {
            return NextResponse.json({ success: true, payment_status: session.payment_status });
        }

    } catch (error: unknown) {
        console.error('Error verifying Stripe session:', error);
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
    }
}
