"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, limit, onSnapshot, orderBy, query, updateDoc, deleteDoc, doc, addDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db, auth, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Link from "next/link";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Clock, Image as ImageIcon, Search, Trash2, XCircle, Upload, Plus, Loader2 } from "lucide-react";

type SlipCheck = {
  id: string;
  orderId?: string;
  amount?: number;
  paymentMethod?: string;
  base64?: string;
  imageUrl?: string;
  storagePath?: string;
  verifyStatus?: string;
  verifyMessage?: string;
  verifiedAmount?: number | null;
  createdAt?: unknown;
  verifiedAt?: unknown;
};

type ManualVerifyTarget = {
  slip: SlipCheck;
  status: string;
  message: string;
  title: string;
  description: string;
  tone: "green" | "red";
};

const statusMap: Record<string, { label: string; color: string; icon: ReactNode }> = {
  pending: { label: "รอตรวจสอบ", color: "bg-amber-100 text-amber-700", icon: <Clock size={12} /> },
  verified: { label: "ยืนยันแล้ว", color: "bg-green-100 text-green-700", icon: <CheckCircle size={12} /> },
  rejected: { label: "ไม่ผ่าน", color: "bg-red-100 text-red-700", icon: <XCircle size={12} /> },
  mismatch: { label: "ยอดไม่ตรง", color: "bg-red-100 text-red-700", icon: <XCircle size={12} /> },
  account_mismatch: { label: "บัญชีไม่ตรง", color: "bg-orange-100 text-orange-700", icon: <AlertTriangle size={12} /> },
  error: { label: "ผิดพลาด", color: "bg-gray-100 text-gray-700", icon: <AlertTriangle size={12} /> }
};

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { toDate?: unknown };
  return typeof candidate.toDate === "function";
}

function OrderCancelledBadge({ orderId }: { orderId: string }) {
  const [isCancelled, setIsCancelled] = useState(false);
  useEffect(() => {
    if (!orderId) return;
    const unsub = onSnapshot(doc(db, "orders", orderId), (snap) => {
      if (snap.exists() && snap.data().status === "cancelled") {
        setIsCancelled(true);
      } else {
        setIsCancelled(false);
      }
    });
    return () => unsub();
  }, [orderId]);

  if (!isCancelled) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">
      <XCircle size={10} />
      ออเดอร์ยกเลิก
    </span>
  );
}

export default function SlipChecksPage() {
  const [slips, setSlips] = useState<SlipCheck[]>([]);
  const [isSlipVerifyEnabled, setIsSlipVerifyEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [imagePreviewTarget, setImagePreviewTarget] = useState<SlipCheck | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SlipCheck | null>(null);
  const [deletingSlipId, setDeletingSlipId] = useState<string | null>(null);
  const [manualVerifyTarget, setManualVerifyTarget] = useState<ManualVerifyTarget | null>(null);
  const [manualVerifyLoadingId, setManualVerifyLoadingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [useStorageForSlips, setUseStorageForSlips] = useState(true);
  const [uploadingSlipId, setUploadingSlipId] = useState<string | null>(null);
  const [isImageBroken, setIsImageBroken] = useState(false);

  // สำหรับ Modal แนบสลิปให้ออเดอร์ใหม่
  const [isNewSlipModalOpen, setIsNewSlipModalOpen] = useState(false);
  const [newSlipOrderId, setNewSlipOrderId] = useState("");
  const [newSlipAmount, setNewSlipAmount] = useState<number | "">("");
  const [newSlipFile, setNewSlipFile] = useState<File | null>(null);
  const [newSlipPreview, setNewSlipPreview] = useState<string | null>(null);
  const [isCreatingSlip, setIsCreatingSlip] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "payment_slips"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as SlipCheck));
      setSlips(rows);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "store"), (snap) => {
      if (!snap.exists()) {
        setIsSlipVerifyEnabled(false);
        return;
      }
      const data = snap.data() as { enableSlipVerify?: boolean; useStorageForPaymentSlips?: boolean };
      setIsSlipVerifyEnabled(Boolean(data.enableSlipVerify));
      setUseStorageForSlips(data.useStorageForPaymentSlips !== false);
    });
    return () => unsub();
  }, []);

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
      reader.readAsDataURL(file);
    });

  const uploadSlipFile = async (file: File, slipId: string) => {
    if (useStorageForSlips) {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const storagePath = `payment_slips/${slipId}-${Date.now()}.${extension}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
      const imageUrl = await getDownloadURL(storageRef);
      return { imageUrl, storagePath, storageProvider: "firebase_storage", base64: "" };
    } else {
      const base64 = await fileToBase64(file);
      return { base64, storageProvider: "firestore_base64", imageUrl: "", storagePath: "" };
    }
  };

  const handleReplaceSlipImage = async (slip: SlipCheck, file: File) => {
    if (!file || !slip.id) return;
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert("ไฟล์รูปภาพมีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB)");
      return;
    }

    try {
      setUploadingSlipId(slip.id);
      const uploaded = await uploadSlipFile(file, slip.id);

      const updatePayload: Record<string, unknown> = {
        mimeType: file.type || "image/jpeg",
        size: file.size,
        updatedAt: serverTimestamp(),
        ...uploaded
      };

      await updateDoc(doc(db, "payment_slips", slip.id), updatePayload);

      if (imagePreviewTarget?.id === slip.id) {
        setImagePreviewTarget((prev) =>
          prev
            ? {
                ...prev,
                imageUrl: uploaded.imageUrl,
                base64: uploaded.base64,
                storagePath: uploaded.storagePath
              }
            : null
        );
        setIsImageBroken(false);
      }

      alert("แนบรูปสลิปใหม่เรียบร้อยแล้ว");
    } catch (error) {
      console.error("Error replacing slip image:", error);
      alert("เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ");
    } finally {
      setUploadingSlipId(null);
    }
  };

  const handleCreateNewSlip = async () => {
    const trimmedOrderId = newSlipOrderId.trim();
    if (!trimmedOrderId) {
      alert("กรุณาระบุรหัสออเดอร์ (Order ID)");
      return;
    }
    if (!newSlipFile) {
      alert("กรุณาเลือกไฟล์รูปภาพสลิป");
      return;
    }

    try {
      setIsCreatingSlip(true);
      let orderAmount = typeof newSlipAmount === "number" ? newSlipAmount : 0;
      let orderUserId: string | null = null;
      let orderPaymentMethod: string | null = "promptpay";

      try {
        const orderSnap = await getDoc(doc(db, "orders", trimmedOrderId));
        if (orderSnap.exists()) {
          const oData = orderSnap.data();
          if (!orderAmount && oData.totalAmount) orderAmount = Number(oData.totalAmount);
          if (oData.userId) orderUserId = oData.userId;
          if (oData.paymentMethod) orderPaymentMethod = oData.paymentMethod;
        }
      } catch (err) {
        console.warn("Could not fetch order data:", err);
      }

      const slipRef = await addDoc(collection(db, "payment_slips"), {
        orderId: trimmedOrderId,
        userId: orderUserId,
        amount: orderAmount,
        paymentMethod: orderPaymentMethod,
        needsVerify: false,
        verifyStatus: "pending",
        verifyMessage: "แนบสลิปโดยแอดมิน (รอตรวจสอบ)",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const uploaded = await uploadSlipFile(newSlipFile, slipRef.id);
      await updateDoc(slipRef, {
        mimeType: newSlipFile.type || "image/jpeg",
        size: newSlipFile.size,
        ...uploaded
      });

      setIsNewSlipModalOpen(false);
      setNewSlipOrderId("");
      setNewSlipAmount("");
      setNewSlipFile(null);
      setNewSlipPreview(null);
      alert(`แนบสลิปสำหรับออเดอร์ ${trimmedOrderId} สำเร็จแล้ว`);
    } catch (error) {
      console.error("Error creating slip:", error);
      alert("เกิดข้อผิดพลาดในการแนบสลิป");
    } finally {
      setIsCreatingSlip(false);
    }
  };

  const filtered = useMemo(() => {
    return slips.filter((s) => {
      const matchesFilter = filter === "all" ? true : s.verifyStatus === filter;
      const text = `${s.orderId || ""}`.toLowerCase();
      const matchesSearch = text.includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [slips, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const pageEnd = Math.min(currentPage * itemsPerPage, filtered.length);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const visiblePages = useMemo(() => {
    const maxVisiblePages = 5;
    const halfWindow = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, currentPage - halfWindow);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);

    start = Math.max(1, end - maxVisiblePages + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const formatDate = (value: unknown) => {
    let date: Date | null = null;
    if (isTimestampLike(value)) {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
    } else if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      date = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return date ? format(date, "d MMM yyyy, HH:mm", { locale: th }) : "-";
  };

  const requestVerify = async (slip: SlipCheck) => {
    if (!slip.id) return;
    setVerifyingId(slip.id);
    try {
      const res = await fetch("/api/slipok/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slipId: slip.id })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Verify failed:", data?.error || res.statusText);
      }
    } catch (err) {
      console.error("Error requesting verify:", err);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleManualVerify = async (slip: SlipCheck, status: string, message: string) => {
    try {
      setManualVerifyLoadingId(slip.id);
      await updateDoc(doc(db, "payment_slips", slip.id), {
        verifyStatus: status,
        verifyMessage: message,
        verifiedAt: new Date()
      });

      if (slip.orderId) {
        if (status === "verified") {
          const idToken = await auth?.currentUser?.getIdToken();
          const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};

          const res = await fetch("/api/orders/update-status", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              orderId: slip.orderId,
              status: "paid",
              paymentDetail: message
            })
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || "Update order failed");
          }
        } else {
          // If rejected or manual check needed, update order's paymentStatus
          await updateDoc(doc(db, "orders", slip.orderId), {
            paymentStatus: status,
            paymentDetail: message,
            updatedAt: new Date()
          }).catch(() => undefined);
        }
      }

      setManualVerifyTarget(null);
    } catch (err) {
      console.error("Error manual verify:", err);
      alert("เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setManualVerifyLoadingId(null);
    }
  };

  const openManualVerifyConfirm = (target: ManualVerifyTarget) => {
    if (manualVerifyLoadingId) return;
    setManualVerifyTarget(target);
  };

  const closeManualVerifyConfirm = () => {
    if (manualVerifyLoadingId) return;
    setManualVerifyTarget(null);
  };

  const confirmManualVerify = async () => {
    if (!manualVerifyTarget) return;
    await handleManualVerify(
      manualVerifyTarget.slip,
      manualVerifyTarget.status,
      manualVerifyTarget.message
    );
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingSlipId(id);
      await deleteDoc(doc(db, "payment_slips", id));
    } catch (err) {
      console.error("Error deleting:", err);
      alert("ลบไม่สำเร็จ");
    } finally {
      setDeletingSlipId(null);
    }
  };

  const openDeleteConfirm = (slip: SlipCheck) => {
    if (deletingSlipId) return;
    setDeleteTarget(slip);
    setIsDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    if (deletingSlipId) return;
    setIsDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  const confirmDeleteSlip = async () => {
    if (!deleteTarget) return;
    await handleDelete(deleteTarget.id);
    closeDeleteConfirm();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">ผลตรวจสลิป</h1>
          <p className="text-xs text-gray-500">
            {filtered.length} รายการ
            {slips.length !== filtered.length ? ` (จากทั้งหมด ${slips.length})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewSlipModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition shrink-0"
          >
            <Plus size={14} />
            <span>แนบสลิปให้ออเดอร์</span>
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหา Order ID"
              className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none"
          >
            <option value="all">ทั้งหมด</option>
            <option value="pending">รอตรวจสอบ</option>
            <option value="verified">ยืนยันแล้ว</option>
            <option value="mismatch">ยอดไม่ตรง</option>
            <option value="account_mismatch">บัญชีไม่ตรง</option>
            <option value="error">ผิดพลาด</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">กำลังโหลด...</div>
        ) : paginated.length === 0 ? (
          <div className="p-8 text-center text-gray-400">ไม่พบรายการ</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-xs">
              <thead className="bg-gray-100 text-[11px] text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">สถานะ</th>
                  <th className="px-3 py-2 text-left font-semibold">ออเดอร์</th>
                  <th className="px-3 py-2 text-right font-semibold">ยอด / ตรวจพบ</th>
                  <th className="px-3 py-2 text-left font-semibold">เวลา</th>
                  <th className="px-3 py-2 text-left font-semibold">ผล</th>
                  <th className="px-3 py-2 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((slip) => {
                  const status = statusMap[slip.verifyStatus || "pending"] || statusMap.pending;
                  return (
                    <Fragment key={slip.id}>
                      <tr className="hover:bg-gray-50/50">
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-start gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${status.color}`}>
                              {status.icon}
                              {status.label}
                            </span>
                            {slip.orderId && (
                              <OrderCancelledBadge orderId={slip.orderId} />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs font-medium text-gray-900">{slip.orderId || "-"}</div>
                          {slip.orderId && (
                            <Link href={`/orders/${encodeURIComponent(slip.orderId)}`} className="text-[10px] text-blue-600 hover:underline">
                              ดูออเดอร์
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-[11px] text-gray-500">
                          ฿{Number(slip.amount || 0).toLocaleString()}
                          <div className="text-[10px] text-gray-400">
                            ตรวจพบ: {slip.verifiedAmount != null ? `฿${Number(slip.verifiedAmount).toLocaleString()}` : "-"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-gray-400 leading-relaxed">
                          ส่งเมื่อ: {formatDate(slip.createdAt)}
                          <div>ตรวจเมื่อ: {formatDate(slip.verifiedAt)}</div>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-gray-600 max-w-[180px] truncate">
                          {slip.verifyMessage || "-"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <div className="flex bg-gray-50 rounded-md p-0.5 gap-0.5">
                              <button
                                onClick={() => openManualVerifyConfirm({
                                  slip,
                                  status: "verified",
                                  message: "ตรวจสอบเอง: ผ่าน",
                                  title: "ยืนยันสลิป",
                                  description: "ต้องการยืนยันสลิปนี้ว่าตรวจสอบผ่านใช่หรือไม่?",
                                  tone: "green"
                                })}
                                className="px-1.5 py-0.5 text-[10px] font-semibold text-green-700 hover:bg-white rounded shadow-sm hover:shadow transition-all"
                                title="อนุมัติเอง"
                              >
                                อนุมัติ
                              </button>
                              <button
                                onClick={() => openManualVerifyConfirm({
                                  slip,
                                  status: "rejected",
                                  message: "ตรวจสอบเอง: ไม่ผ่าน",
                                  title: "ไม่อนุมัติสลิป",
                                  description: "ต้องการเปลี่ยนสลิปนี้เป็นไม่ผ่านใช่หรือไม่?",
                                  tone: "red"
                                })}
                                className="px-1.5 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-white rounded shadow-sm hover:shadow transition-all"
                                title="ไม่อนุมัติ"
                              >
                                ไม่ผ่าน
                              </button>
                            </div>
                            {isSlipVerifyEnabled && (
                              <button
                                onClick={() => requestVerify(slip)}
                                disabled={(!slip.base64 && !slip.imageUrl) || verifyingId === slip.id}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
                                title="ให้ระบบช่วยตรวจสอบ"
                              >
                                <CheckCircle size={12} />
                                Auto
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setIsImageBroken(false);
                                setImagePreviewTarget(slip);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-gray-200 rounded-md hover:bg-gray-50"
                              title="ดูรูปสลิป"
                            >
                              <ImageIcon size={12} />
                              รูป
                            </button>
                            <label
                              className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border rounded-md cursor-pointer transition ${
                                uploadingSlipId === slip.id
                                  ? "bg-gray-100 text-gray-400 border-gray-200 pointer-events-none"
                                  : "bg-blue-50/80 border-blue-200 text-blue-700 hover:bg-blue-100"
                              }`}
                              title="แนบรูปสลิปใหม่ / แทนที่รูปเดิม"
                            >
                              {uploadingSlipId === slip.id ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Upload size={11} />
                              )}
                              <span>{uploadingSlipId === slip.id ? "กำลังส่ง..." : "แนบรูป"}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploadingSlipId === slip.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleReplaceSlipImage(slip, file);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                            <button
                              onClick={() => openDeleteConfirm(slip)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-gray-200 text-red-600 rounded-md hover:bg-white hover:border-red-200 hover:bg-red-50"
                              title="ลบรายการ"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-gray-500">
            <span>
              แสดง {pageStart}-{pageEnd} จาก {filtered.length}
            </span>
            <label className="flex items-center gap-2">
              <span className="text-xs">แสดง</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-gray-200"
              >
                {[10, 25, 50, 100].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <span className="text-xs">รายการ</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-1 md:justify-end">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1">
              {visiblePages.map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition-colors ${currentPage === page
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                    }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {manualVerifyTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className={`flex size-9 items-center justify-center rounded-full ${manualVerifyTarget.tone === "green"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
                  }`}
                >
                  {manualVerifyTarget.tone === "green" ? <CheckCircle size={18} /> : <XCircle size={18} />}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  {manualVerifyTarget.title}
                </h3>
              </div>
              <button
                onClick={closeManualVerifyConfirm}
                className="p-1 hover:bg-gray-100 rounded"
                disabled={manualVerifyLoadingId === manualVerifyTarget.slip.id}
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="p-5 bg-[#F8F9FA] space-y-3">
              <p className="text-sm text-gray-700">{manualVerifyTarget.description}</p>
              <div className="rounded-xl border border-gray-100 bg-white p-3 text-xs text-gray-500">
                <div className="flex justify-between gap-3">
                  <span>Order ID</span>
                  <span className="font-medium text-gray-900">{manualVerifyTarget.slip.orderId || "-"}</span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span>ยอดสลิป</span>
                  <span className="font-medium text-gray-900">
                    ฿{Number(manualVerifyTarget.slip.amount || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
              <button
                onClick={closeManualVerifyConfirm}
                className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                disabled={manualVerifyLoadingId === manualVerifyTarget.slip.id}
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmManualVerify}
                className={`flex-1 px-4 py-2.5 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors ${manualVerifyTarget.tone === "green"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
                  }`}
                disabled={manualVerifyLoadingId === manualVerifyTarget.slip.id}
              >
                {manualVerifyLoadingId === manualVerifyTarget.slip.id ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}

      {imagePreviewTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">รูปสลิป</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {imagePreviewTarget.orderId || "-"} · ฿{Number(imagePreviewTarget.amount || 0).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => {
                  setImagePreviewTarget(null);
                  setIsImageBroken(false);
                }}
                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition"
                aria-label="ปิดรูปสลิป"
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="bg-[#F8F9FA] p-4">
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-gray-200 bg-white p-3">
                {uploadingSlipId === imagePreviewTarget.id ? (
                  <div className="flex flex-col items-center justify-center p-8 text-blue-600 gap-2">
                    <Loader2 size={32} className="animate-spin" />
                    <p className="text-xs font-semibold">กำลังอัปโหลดรูปภาพใหม่...</p>
                  </div>
                ) : isImageBroken ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-3">
                      <AlertTriangle size={24} />
                    </div>
                    <p className="text-sm font-bold text-gray-900">รูปภาพสลิปไม่สมบูรณ์ หรือไฟล์เสียหาย</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-sm">
                      เกิดจากลูกค้าอัปโหลดไม่สำเร็จหรือเน็ตหลุด คุณสามารถกดปุ่ม "แนบรูปสลิปใหม่" ด้านล่างเพื่ออัปโหลดแทนที่ได้ทันที
                    </p>
                  </div>
                ) : imagePreviewTarget.base64 || imagePreviewTarget.imageUrl ? (
                  <img
                    src={imagePreviewTarget.base64 || imagePreviewTarget.imageUrl}
                    alt={`สลิป ${imagePreviewTarget.orderId || ""}`}
                    className="max-h-[72vh] max-w-full object-contain rounded-lg"
                    onError={() => setIsImageBroken(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-gray-400">
                    <ImageIcon size={32} className="mb-2 text-gray-300" />
                    <p className="text-sm">ไม่มีรูปสลิปในระบบ</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-white flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer transition shadow-sm">
                <Upload size={14} />
                <span>แนบรูปสลิปใหม่ / แทนที่รูปเดิม</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingSlipId === imagePreviewTarget.id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleReplaceSlipImage(imagePreviewTarget, file);
                    e.target.value = "";
                  }}
                />
              </label>

              <div className="flex items-center gap-2">
                {isSlipVerifyEnabled && (
                  <button
                    type="button"
                    onClick={() => requestVerify(imagePreviewTarget)}
                    disabled={(!imagePreviewTarget.base64 && !imagePreviewTarget.imageUrl) || verifyingId === imagePreviewTarget.id}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition"
                  >
                    <CheckCircle size={14} />
                    Auto ตรวจสอบ
                  </button>
                )}
                <button
                  onClick={() => {
                    setImagePreviewTarget(null);
                    setIsImageBroken(false);
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isNewSlipModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Upload size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">แนบสลิปให้ออเดอร์</h3>
                  <p className="text-[11px] text-gray-500">สร้างรายการสลิปและอัปโหลดรูปภาพ</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewSlipModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition"
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3.5 bg-[#F8F9FA]">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  รหัสออเดอร์ (Order ID) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น INV00233"
                  value={newSlipOrderId}
                  onChange={(e) => setNewSlipOrderId(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  ยอดเงินในสลิป (บาท) <span className="text-gray-400 font-normal">(ไม่บังคับ)</span>
                </label>
                <input
                  type="number"
                  placeholder="เช่น 2500"
                  value={newSlipAmount}
                  onChange={(e) => setNewSlipAmount(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  ไฟล์รูปภาพสลิป <span className="text-rose-500">*</span>
                </label>
                <div className="border border-dashed border-gray-300 rounded-xl p-3 bg-white text-center">
                  {newSlipPreview ? (
                    <div className="space-y-2">
                      <img src={newSlipPreview} alt="Preview" className="max-h-40 mx-auto object-contain rounded-lg border border-gray-200" />
                      <p className="text-[11px] text-gray-500 truncate">{newSlipFile?.name}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setNewSlipFile(null);
                          setNewSlipPreview(null);
                        }}
                        className="text-[11px] text-rose-600 hover:underline font-semibold"
                      >
                        เปลี่ยนรูป
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer block py-4">
                      <Upload size={24} className="mx-auto text-gray-400 mb-1.5" />
                      <p className="text-xs font-semibold text-gray-700">คลิกเพื่อเลือกรูปภาพสลิป</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">รองรับไฟล์ JPG, PNG, WEBP (ไม่เกิน 10MB)</p>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setNewSlipFile(file);
                            setNewSlipPreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
              <button
                type="button"
                onClick={() => setIsNewSlipModalOpen(false)}
                className="flex-1 px-4 py-2 bg-white text-gray-700 text-xs font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 transition"
                disabled={isCreatingSlip}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleCreateNewSlip}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                disabled={isCreatingSlip || !newSlipOrderId || !newSlipFile}
              >
                {isCreatingSlip ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <span>บันทึกสลิป</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && deleteTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <h3 className="font-semibold text-gray-900 text-sm">ลบสลิป</h3>
              <button onClick={closeDeleteConfirm} className="p-1 hover:bg-gray-100 rounded">
                <XCircle size={18} />
              </button>
            </div>
            <div className="p-5 bg-[#F8F9FA] space-y-2">
              <p className="text-sm text-gray-700">
                ต้องการลบสลิปของออเดอร์ {deleteTarget.orderId || "-"} ใช่หรือไม่?
              </p>
              <p className="text-xs text-red-600">ลบแล้วไม่สามารถกู้คืนได้</p>
            </div>
            <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
              <button
                onClick={closeDeleteConfirm}
                className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                disabled={deletingSlipId === deleteTarget.id}
              >
                ปิด
              </button>
              <button
                onClick={confirmDeleteSlip}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                disabled={deletingSlipId === deleteTarget.id}
              >
                {deletingSlipId === deleteTarget.id ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
