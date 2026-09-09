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
    const { requestId, action, rejectReason } = body;

    if (!requestId || !action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบถ้วน (ต้องระบุ requestId และ action)" }, { status: 400 });
    }

    const db = admin.firestore();
    const requestRef = db.doc(`name_change_requests/${requestId}`);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return NextResponse.json({ error: "ไม่พบข้อมูลคำขอแก้ไขชื่อ" }, { status: 404 });
    }

    const requestData = requestSnap.data() || {};
    if (requestData.status !== "pending") {
      return NextResponse.json(
        { error: `คำขอนี้ได้รับการจัดการไปแล้ว (สถานะปัจจุบัน: ${requestData.status})` },
        { status: 400 }
      );
    }

    const targetId = requestData.targetId;
    const type = requestData.type;
    const requestedName = requestData.requestedName;
    const customerLineId = requestData.lineId;

    if (action === "approve") {
      if (type === "order") {
        const orderRef = db.doc(`orders/${targetId}`);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
          return NextResponse.json({ error: "ไม่พบคำสั่งซื้อที่ต้องการแก้ไข" }, { status: 404 });
        }

        const currentOrder = orderSnap.data() || {};
        let updatedAddress = currentOrder.shippingAddress;
        
        // If shipping address starts with old name, update it to the new name
        if (updatedAddress && requestData.currentName && updatedAddress.includes(requestData.currentName)) {
          updatedAddress = updatedAddress.replace(requestData.currentName, requestedName);
        }

        await orderRef.update({
          customerName: requestedName,
          ...(updatedAddress ? { shippingAddress: updatedAddress } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else if (type === "profile") {
        const customerRef = db.doc(`customers/${targetId}`);
        const customerSnap = await customerRef.get();
        if (customerSnap.exists) {
          await customerRef.update({
            name: requestedName,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        if (requestData.userId) {
          const userRef = db.doc(`users/${requestData.userId}`);
          const userSnap = await userRef.get();
          if (userSnap.exists) {
            await userRef.update({
              name: requestedName,
              displayName: requestedName,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      }

      await requestRef.update({
        status: "approved",
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: authCheck.uid || null
      });
    } else {
      // action === 'reject'
      await requestRef.update({
        status: "rejected",
        rejectReason: (rejectReason || "").trim() || "คำขอไม่ผ่านการพิจารณา",
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: authCheck.uid || null
      });
    }

    // Try sending LINE notification to customer if lineId exists
    if (customerLineId) {
      try {
        const storeSettingsSnap = await db.doc("settings/store").get();
        const storeData = storeSettingsSnap.data() || {};
        const token = storeData.lineChannelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;

        if (token) {
          const messageText = action === "approve"
            ? `✅ คำขอแก้ไขชื่อของคุณได้รับการอนุมัติแล้ว!\n\nเปลี่ยนเป็น: "${requestedName}" เรียบร้อยแล้วค่ะ`
            : `❌ คำขอแก้ไขชื่อไม่ได้รับการอนุมัติ\n\nเหตุผล: ${rejectReason || "ไม่สามารถดำเนินการได้"}`;

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
        console.warn("Error sending LINE notification for name request:", notifyErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: action === "approve" ? "อนุมัติและปรับปรุงชื่อเรียบร้อยแล้ว" : "ปฏิเสธคำขอเรียบร้อยแล้ว"
    });
  } catch (error: any) {
    console.error("Error approving/rejecting name request:", error);
    return NextResponse.json(
      { error: error?.message || "เกิดข้อผิดพลาดในการทำรายการ" },
      { status: 500 }
    );
  }
}
