const functions = require("firebase-functions");
const admin = require("firebase-admin");
const FormData = require("form-data");
const fetch = require("node-fetch");

admin.initializeApp();

function parseBase64(data, fallbackType) {
  if (!data) return { buffer: null, mimeType: fallbackType || "image/jpeg" };
  const match = /^data:(.*?);base64,(.*)$/.exec(data);
  if (match) {
    return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1] || fallbackType };
  }
  return { buffer: Buffer.from(data, "base64"), mimeType: fallbackType || "image/jpeg" };
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function getSlipOkSettings() {
  try {
    const snap = await admin.firestore().doc("settings/store").get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return {
      enabled: data.enableSlipVerify === true,
      branchId: data.slipokBranchId || null,
      apiKey: data.slipokApiKey || null
    };
  } catch (err) {
    return null;
  }
}

exports.verifyPaymentSlip = functions.firestore
  .document("payment_slips/{slipId}")
  .onWrite(async (change, context) => {
    if (!change.after.exists) return;
    const data = change.after.data();

    if (!data || data.needsVerify !== true) return;

    const settings = await getSlipOkSettings();
    if (settings && settings.enabled !== true) {
      await change.after.ref.update({
        needsVerify: false,
        verifyStatus: "skipped",
        verifyMessage: "Slip verification disabled",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    const apikey = (settings && settings.apiKey) || (functions.config().slipok && functions.config().slipok.apikey);
    const branchId = (settings && settings.branchId) || (functions.config().slipok && functions.config().slipok.branchid);
    if (!apikey || !branchId) {
      await change.after.ref.update({
        needsVerify: false,
        verifyStatus: "error",
        verifyMessage: "SlipOK config not set",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    const { buffer, mimeType } = parseBase64(data.base64, data.mimeType);
    if (!buffer) {
      await change.after.ref.update({
        needsVerify: false,
        verifyStatus: "error",
        verifyMessage: "Missing base64",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    const form = new FormData();
    form.append("files", buffer, {
      filename: data.filename || `slip-${context.params.slipId}.jpg`,
      contentType: mimeType || "image/jpeg"
    });
    form.append("log", "true");

    let verifyStatus = "error";
    let verifyMessage = "Verification failed";
    let verifiedAmount = null;
    let slipOkCode = null;
    let slipOkMessage = null;

    try {
      const url = `https://api.slipok.com/api/line/apikey/${branchId}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-authorization": apikey,
          ...form.getHeaders()
        },
        body: form
      });
      const json = await res.json();

      slipOkCode = json && json.code ? json.code : null;
      slipOkMessage = json && json.message ? json.message : null;

      if (res.status === 200 && json && json.success === true) {
        const actual = toNumber(json.data && json.data.amount);
        verifiedAmount = actual;
        const expected = toNumber(data.amount);
        const match = Math.abs(actual - expected) < 0.01;
        if (match) {
          verifyStatus = "verified";
          verifyMessage = "Payment verified";
        } else {
          verifyStatus = "mismatch";
          verifyMessage = `Amount mismatch (${actual})`;
        }
      } else if (json && json.code === 1014) {
        verifyStatus = "account_mismatch";
        verifyMessage = "Account mismatch";
      } else {
        verifyStatus = "error";
        verifyMessage = slipOkMessage || "Verification failed";
      }
    } catch (err) {
      verifyStatus = "error";
      verifyMessage = err.message || "Verification failed";
    }

    await change.after.ref.update({
      needsVerify: false,
      verifyStatus,
      verifyMessage,
      verifiedAmount,
      slipOkCode,
      slipOkMessage,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (data.orderId && verifyStatus === "verified") {
      await admin.firestore().doc(`orders/${data.orderId}`).set({
        paymentStatus: "verified",
        paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
  });
