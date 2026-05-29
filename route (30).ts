"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, limit, onSnapshot, orderBy, query, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Clock, Image as ImageIcon, Search, Trash2, XCircle } from "lucide-react";

type SlipCheck = {
  id: string;
  orderId?: string;
  amount?: number;
  paymentMethod?: string;
  base64?: string;
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
      const data = snap.data() as { enableSlipVerify?: boolean };
      setIsSlipVerifyEnabled(Boolean(data.enableSlipVerify));
    });
    return () => unsub();
  }, []);

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

      if (status === "verified" && slip.orderId) {
        const res = await fetch("/api/orders/update-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
          <h1 className="text-xl font-bold text-gray-900">ผลตรวจสลิป</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} รายการ
            {slips.length !== filtered.length ? ` (จากทั้งหมด ${slips.length})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="ค้นหา Order ID"
              className="pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none"
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
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
                  <th className="px-4 py-3 text-left font-semibold">ออเดอร์</th>
                  <th className="px-4 py-3 text-right font-semibold">ยอด / ตรวจพบ</th>
                  <th className="px-4 py-3 text-left font-semibold">เวลา</th>
                  <th className="px-4 py-3 text-left font-semibold">ผล</th>
                  <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((slip) => {
                  const status = statusMap[slip.verifyStatus || "pending"] || statusMap.pending;
                  return (
                    <Fragment key={slip.id}>
                      <tr className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${status.color}`}>
                            {status.icon}
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{slip.orderId || "-"}</div>
                          {slip.orderId && (
                            <Link href={`/myorder/${slip.orderId}`} className="text-xs text-blue-600 hover:underline">
                              ดูออเดอร์
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-gray-500">
                          ฿{Number(slip.amount || 0).toLocaleString()}
                          <div className="text-[11px] text-gray-400">
                            ตรวจพบ: {slip.verifiedAmount != null ? `฿${Number(slip.verifiedAmount).toLocaleString()}` : "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          ส่งเมื่อ: {formatDate(slip.createdAt)}
                          <div>ตรวจเมื่อ: {formatDate(slip.verifiedAt)}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {slip.verifyMessage || "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="flex bg-gray-50 rounded-lg p-1 gap-1">
                              <button
                                onClick={() => openManualVerifyConfirm({
                                  slip,
                                  status: "verified",
                                  message: "ตรวจสอบเอง: ผ่าน",
                                  title: "ยืนยันสลิป",
                                  description: "ต้องการยืนยันสลิปนี้ว่าตรวจสอบผ่านใช่หรือไม่?",
                                  tone: "green"
                                })}
                                className="px-2 py-1 text-xs font-semibold text-green-700 hover:bg-white rounded shadow-sm hover:shadow transition-all"
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
                                className="px-2 py-1 text-xs font-semibold text-red-700 hover:bg-white rounded shadow-sm hover:shadow transition-all"
                                title="ไม่อนุมัติ"
                              >
                                ไม่ผ่าน
                              </button>
                            </div>
                            {isSlipVerifyEnabled && (
                              <button
                                onClick={() => requestVerify(slip)}
                                disabled={!slip.base64 || verifyingId === slip.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                                title="ให้ระบบช่วยตรวจสอบ"
                              >
                                <CheckCircle size={14} />
                                Auto
                              </button>
                            )}
                            <button
                              onClick={() => setImagePreviewTarget(slip)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50"
                            >
                              <ImageIcon size={14} />
                              รูป
                            </button>
                            <button
                              onClick={() => openDeleteConfirm(slip)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border border-gray-200 text-red-600 rounded-lg hover:bg-white hover:border-red-200 hover:bg-red-50"
                              title="ลบรายการ"
                            >
                              <Trash2 size={14} />
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
                onClick={() => setImagePreviewTarget(null)}
                className="p-1 hover:bg-gray-100 rounded"
                aria-label="ปิดรูปสลิป"
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="bg-[#F8F9FA] p-4">
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-gray-200 bg-white p-3">
                {imagePreviewTarget.base64 ? (
                  <img
                    src={imagePreviewTarget.base64}
                    alt={`สลิป ${imagePreviewTarget.orderId || ""}`}
                    className="max-h-[72vh] max-w-full object-contain"
                  />
                ) : (
                  <div className="text-sm text-gray-400">ไม่มีรูปสลิป</div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
              <button
                onClick={() => setImagePreviewTarget(null)}
                className="px-4 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-colors"
              >
                ปิด
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
