import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authHelper";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      orderId,
      requestType = "addon",
      itemName,
      details,
      reason,
      customerId,
      userId,
      lineId
    } = body;

    if (!orderId || typeof orderId !== "string") {
      return NextResponse.json({ error: "ไม่พบรหัสคำสั่งซื้อ (orderId)" }, { status: 400 });
    }

    const trimmedDetails = (details || "").trim();
    if (!trimmedDetails) {
      return NextResponse.json({ error: "กรุณาระบุรายละเอียดบริการเสริมหรือสิ่งที่ต้องการแก้ไข" }, { status: 400 });
    }

    const trimmedReason = (reason || "").trim();
    if (!trimmedReason) {
      return NextResponse.json({ error: "กรุณาระบุเหตุผลในการขอแก้ไข" }, { status: 400 });
    }

    const db = admin.firestore();
    const orderDoc = await db.doc(`orders/${orderId}`).get();

    if (!orderDoc.exists) {
      return NextResponse.json({ error: "ไม่พบคำสั่งซื้อที่ระบุ" }, { status: 404 });
    }

    const orderData = orderDoc.data() || {};
    if (["shipped", "completed", "cancelled"].includes(orderData.status)) {
      return NextResponse.json(
        { error: "ไม่สามารถขอแก้ไขสำหรับคำสั่งซื้อที่จัดส่งแล้วหรือยกเลิกแล้วได้" },
        { status: 400 }
      );
    }

    // Check if there is already a pending request for this orderId
    const existingPending = await db
      .collection("order_edit_requests")
      .where("orderId", "==", orderId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingPending.empty) {
      return NextResponse.json(
        { error: "มีคำขอแก้ไขสำหรับคำสั่งซื้อนี้ที่อยู่ระหว่างรอตรวจสอบแล้ว" },
        { status: 400 }
      );
    }

    const newRequest = {
      orderId,
      orderNo: orderData.orderNo || orderId,
      customerId: customerId || orderData.customerId || null,
      userId: userId || orderData.userId || null,
      lineId: lineId || orderData.lineId || null,
      customerName: orderData.customerName || null,
      customerPhone: orderData.customerPhone || null,
      requestType,
      itemName: (itemName || "").trim() || null,
      details: trimmedDetails,
      reason: trimmedReason,
      status: "pending",
      adminNote: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null
    };

    const docRef = await db.collection("order_edit_requests").add(newRequest);

    return NextResponse.json({
      success: true,
      requestId: docRef.id,
      message: "ส่งคำขอแก้ไขออเดอร์/บริการเสริมเรียบร้อยแล้ว แอดมินจะตรวจสอบและดำเนินการให้ค่ะ"
    });
  } catch (error: any) {
    console.error("Error submitting order edit request:", error);
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการส่งคำขอ" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const isDev = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_MOCK_LIFF === "true";
    const authCheck = await verifyAdminRequest(req, true);
    if (!authCheck.authorized && !isDev) {
      return NextResponse.json({ error: authCheck.error || "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const orderIdParam = searchParams.get("orderId");

    const db = admin.firestore();
    let query: admin.firestore.Query = db.collection("order_edit_requests");

    if (statusParam && ["pending", "completed", "rejected"].includes(statusParam)) {
      query = query.where("status", "==", statusParam);
    }

    if (orderIdParam) {
      query = query.where("orderId", "==", orderIdParam);
    }

    const snap = await query.get();
    const requests = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : null,
        reviewedAt: data.reviewedAt?.toDate?.() ? data.reviewedAt.toDate().toISOString() : null
      };
    });

    requests.sort((a: any, b: any) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return NextResponse.json({ success: true, requests });
  } catch (error: any) {
    console.error("Error fetching order edit requests:", error);
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการดึงข้อมูลคำขอ" },
      { status: 500 }
    );
  }
}
