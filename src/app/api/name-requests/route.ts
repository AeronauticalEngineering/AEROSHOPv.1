import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authHelper";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      type,
      targetId,
      requestedName,
      reason,
      customerId,
      userId,
      lineId
    } = body;

    if (!type || !["order", "profile"].includes(type)) {
      return NextResponse.json({ error: "ประเภทคำขอไม่ถูกต้อง (type ต้องเป็น order หรือ profile)" }, { status: 400 });
    }

    if (!targetId || typeof targetId !== "string") {
      return NextResponse.json({ error: "ไม่พบรหัสเป้าหมาย (targetId)" }, { status: 400 });
    }

    const trimmedRequestedName = (requestedName || "").trim();
    if (!trimmedRequestedName) {
      return NextResponse.json({ error: "กรุณาระบุชื่อใหม่ที่ต้องการขอเปลี่ยน" }, { status: 400 });
    }

    const trimmedReason = (reason || "").trim();
    if (!trimmedReason) {
      return NextResponse.json({ error: "กรุณาระบุเหตุผลในการขอแก้ไขชื่อ" }, { status: 400 });
    }

    const db = admin.firestore();

    // Check if there is already a pending request for this targetId
    const existingPending = await db
      .collection("name_change_requests")
      .where("targetId", "==", targetId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingPending.empty) {
      return NextResponse.json(
        { error: "มีคำขอแก้ไขชื่อสำหรับรายการนี้ที่อยู่ระหว่างรอตรวจสอบแล้ว" },
        { status: 400 }
      );
    }

    let currentName = "";
    let orderNo: string | undefined;

    if (type === "order") {
      const orderDoc = await db.doc(`orders/${targetId}`).get();
      if (!orderDoc.exists) {
        return NextResponse.json({ error: "ไม่พบคำสั่งซื้อที่ระบุ" }, { status: 404 });
      }

      const orderData = orderDoc.data() || {};
      const status = orderData.status;

      if (["shipped", "completed", "cancelled"].includes(status)) {
        return NextResponse.json(
          { error: "ไม่สามารถขอแก้ไขชื่อสำหรับคำสั่งซื้อที่จัดส่งแล้วหรือยกเลิกแล้วได้" },
          { status: 400 }
        );
      }

      currentName = orderData.customerName || "";
      orderNo = orderData.orderNo || targetId;
    } else {
      // type === 'profile'
      const customerDoc = await db.doc(`customers/${targetId}`).get();
      if (customerDoc.exists) {
        currentName = customerDoc.data()?.name || "";
      } else if (userId) {
        const userDoc = await db.doc(`users/${userId}`).get();
        if (userDoc.exists) {
          currentName = userDoc.data()?.name || userDoc.data()?.displayName || "";
        }
      }
    }

    const newRequest = {
      type,
      targetId,
      orderNo: orderNo || null,
      customerId: customerId || null,
      userId: userId || null,
      lineId: lineId || null,
      currentName,
      requestedName: trimmedRequestedName,
      reason: trimmedReason,
      status: "pending",
      rejectReason: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null
    };

    const docRef = await db.collection("name_change_requests").add(newRequest);

    return NextResponse.json({
      success: true,
      requestId: docRef.id,
      message: "ส่งคำขอแก้ไขชื่อเรียบร้อยแล้ว แอดมินจะตรวจสอบและดำเนินการให้เร็วที่สุด"
    });
  } catch (error: any) {
    console.error("Error submitting name change request:", error);
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการส่งคำขอ" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const authCheck = await verifyAdminRequest(req, true);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error || "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const targetIdParam = searchParams.get("targetId");

    const db = admin.firestore();
    let query: admin.firestore.Query = db.collection("name_change_requests");

    if (statusParam && ["pending", "approved", "rejected"].includes(statusParam)) {
      query = query.where("status", "==", statusParam);
    }

    if (targetIdParam) {
      query = query.where("targetId", "==", targetIdParam);
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

    // Sort descending by createdAt
    requests.sort((a: any, b: any) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return NextResponse.json({ success: true, requests });
  } catch (error: any) {
    console.error("Error fetching name change requests:", error);
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการดึงข้อมูลคำขอ" },
      { status: 500 }
    );
  }
}
