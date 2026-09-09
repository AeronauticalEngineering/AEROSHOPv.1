import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authHelper";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const authCheck = await verifyAdminRequest(req, true);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error || "Unauthorized" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { orderId, customerName, customerPhone, shippingAddress } = body;

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "ไม่พบรหัสคำสั่งซื้อ (orderId)" }, { status: 400 });
    }

    const trimmedName = (customerName || "").trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "ชื่อผู้รับไม่สามารถเว้นว่างได้" }, { status: 400 });
    }

    const db = admin.firestore();
    const orderRef = db.doc(`orders/${orderId}`);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
    }

    const updates: Record<string, any> = {
      customerName: trimmedName,
      customerPhone: (customerPhone || "").trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (typeof shippingAddress === "string") {
      updates.shippingAddress = shippingAddress.trim();
    }

    await orderRef.update(updates);

    return NextResponse.json({
      success: true,
      message: "อัปเดตข้อมูลผู้รับในคำสั่งซื้อเรียบร้อยแล้ว"
    });
  } catch (error: any) {
    console.error("Error updating order customer info:", error);
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการอัปเดตข้อมูล" },
      { status: 500 }
    );
  }
}
