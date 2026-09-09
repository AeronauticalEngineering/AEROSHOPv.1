import { NextResponse } from "next/server";
import admin from "@/lib/firebaseAdmin";
import { verifyAdminRequest } from "@/lib/authHelper";
import { sendLineMessage } from "@/lib/lineNotify";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const authCheck = await verifyAdminRequest(req, true);
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error || "Unauthorized" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { requestId, action, adminNote } = body;

    if (!requestId || !action || !["complete", "reject"].includes(action)) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบถ้วน (ต้องระบุ requestId และ action)" }, { status: 400 });
    }

    const db = admin.firestore();
    const requestRef = db.doc(`order_edit_requests/${requestId}`);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return NextResponse.json({ error: "ไม่พบข้อมูลคำขอแก้ไขออเดอร์" }, { status: 404 });
    }

    const requestData = requestSnap.data() || {};
    if (requestData.status !== "pending") {
      return NextResponse.json(
        { error: `คำขอนี้ได้รับการจัดการไปแล้ว (สถานะปัจจุบัน: ${requestData.status})` },
        { status: 400 }
      );
    }

    const customerLineId = requestData.lineId;
    const orderNo = requestData.orderNo || requestData.orderId;

    if (action === "complete") {
      await requestRef.update({
        status: "completed",
        adminNote: adminNote || null,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: authCheck.uid || null
      });
    } else {
      await requestRef.update({
        status: "rejected",
        adminNote: (adminNote || "").trim() || "คำขอไม่ผ่านการพิจารณา",
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: authCheck.uid || null
      });
    }

    // LINE Notification to customer
    if (customerLineId) {
      try {
        const storeSettingsSnap = await db.doc("settings/store").get();
        const storeData = storeSettingsSnap.data() || {};
        const token = storeData.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;

        if (token) {
          const messageText = action === "complete"
            ? `✅ คำขอแก้ไขออเดอร์/บริการเสริมของคุณ (#${orderNo})\nได้รับการดำเนินการเรียบร้อยแล้วค่ะ!\n${adminNote ? `\nหมายเหตุ: ${adminNote}` : ""}`
            : `❌ คำขอแก้ไขออเดอร์ (#${orderNo}) ไม่สามารถดำเนินการได้\nเนื่องจาก: ${adminNote || "ไม่สามารถดำเนินการได้ในสถานะนี้"}`;

          await sendLineMessage({
            token,
            targets: [customerLineId],
            message: {
              type: "text",
              text: messageText
            }
          });
        }
      } catch (notifyErr) {
        console.warn("Error sending LINE notification for order request:", notifyErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: action === "complete" ? "บันทึกดำเนินการคำขอเรียบร้อยแล้ว" : "ปฏิเสธคำขอเรียบร้อยแล้ว"
    });
  } catch (error: any) {
    console.error("Error resolving order request:", error);
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการทำรายการ" },
      { status: 500 }
    );
  }
}
