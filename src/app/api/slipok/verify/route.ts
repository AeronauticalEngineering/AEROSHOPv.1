import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";
import { buildAdminPaymentFlex, buildOrderStatusFlex, sendLineMessage } from "@/lib/lineNotify";

export const runtime = "nodejs";

function parseBase64(data: string, fallbackType?: string) {
  if (!data) return { buffer: null as Buffer | null, mimeType: fallbackType || "image/jpeg" };
  const match = /^data:(.*?);base64,(.*)$/.exec(data);
  if (match) {
    return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1] || fallbackType };
  }
  return { buffer: Buffer.from(data, "base64"), mimeType: fallbackType || "image/jpeg" };
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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
        paymentMethod: typeof orderData?.paymentMethod === "string" ? orderData.paymentMethod : undefined
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
    console.error("LINE notify failed:", err);
  }
}

export async function POST(req: Request) {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const slipId = body?.slipId as string | undefined;
    if (!slipId) {
      return NextResponse.json({ error: "Missing slipId" }, { status: 400 });
    }

    const db = admin.firestore();
    const slipRef = db.doc(`payment_slips/${slipId}`);
    const slipSnap = await slipRef.get();
    if (!slipSnap.exists) {
      return NextResponse.json({ error: "Slip not found" }, { status: 404 });
    }
    const slip = slipSnap.data() || {};

    const settingsSnap = await db.doc("settings/store").get();
    if (!settingsSnap.exists) {
      return NextResponse.json({ error: "Settings not found" }, { status: 400 });
    }
    const settings = (settingsSnap.data() || {}) as Record<string, unknown>;

    if (settings.enableSlipVerify !== true) {
      return NextResponse.json({ error: "Slip verification disabled" }, { status: 400 });
    }

    const branchId = typeof settings.slipokBranchId === "string" ? settings.slipokBranchId : "";
    const apiKey = typeof settings.slipokApiKey === "string" ? settings.slipokApiKey : "";
    if (!branchId || !apiKey) {
      return NextResponse.json({ error: "SlipOK config not set" }, { status: 400 });
    }

    const { buffer, mimeType } = parseBase64(slip.base64, slip.mimeType);
    if (!buffer) {
      return NextResponse.json({ error: "Missing base64" }, { status: 400 });
    }

    const form = new FormData();
    const filename = slip.filename || `slip-${slipId}.jpg`;
    const bytes = Uint8Array.from(buffer);
    const blob = new Blob([bytes], { type: mimeType || "image/jpeg" });
    form.append("files", blob, filename);
    form.append("log", "true");

    let verifyStatus = "error";
    let verifyMessage = "ตรวจสอบไม่สำเร็จ";
    let verifiedAmount: number | null = null;
    let slipOkCode: number | null = null;
    let slipOkMessage: string | null = null;

    const res = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
      method: "POST",
      headers: { "x-authorization": apiKey },
      body: form
    });

    const json = await res.json().catch(() => null);
    slipOkCode = json?.code ?? null;
    slipOkMessage = json?.message ?? null;

    if (res.ok && json?.success === true) {
      const actual = toNumber(json?.data?.amount);
      verifiedAmount = actual;
      const expected = toNumber(slip.amount);
      const match = Math.abs(actual - expected) < 0.01;
      if (match) {
        verifyStatus = "verified";
        verifyMessage = "การชำระเงินถูกต้อง";
      } else {
        verifyStatus = "mismatch";
        verifyMessage = `ยอดไม่ตรง (${actual})`;
      }
    } else if (json?.code === 1014) {
      verifyStatus = "account_mismatch";
      verifyMessage = "บัญชีผู้รับไม่ตรงกับบัญชีหลักของร้าน";
    } else {
      verifyStatus = "error";
      verifyMessage = slipOkMessage || "ตรวจสอบไม่สำเร็จ";
    }

    await slipRef.update({
      needsVerify: false,
      verifyStatus,
      verifyMessage,
      verifiedAmount,
      slipOkCode,
      slipOkMessage,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    let orderData: Record<string, unknown> | null = null;
    if (slip.orderId) {
      const orderSnap = await db.doc(`orders/${slip.orderId}`).get();
      if (orderSnap.exists) orderData = (orderSnap.data() || {}) as Record<string, unknown>;
    }

    if (slip.orderId && verifyStatus === "verified") {
      await db.doc(`orders/${slip.orderId}`).set(
        {
          status: "paid",
          paymentStatus: "verified",
          paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await notifyPaymentVerified(
        settings,
        orderData,
        slip.orderId,
        verifiedAmount ?? toNumber(slip.amount)
      );
    }

    return NextResponse.json({ ok: true, verifyStatus, verifyMessage });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
