"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { 
    CheckCircle, 
    Clock, 
    ExternalLink, 
    Filter, 
    Loader2, 
    RefreshCw, 
    Search, 
    User, 
    UserCheck, 
    XCircle,
    ShoppingBag
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { NameChangeRequest, NameChangeStatus } from "@/types/nameChangeRequest";

export default function AdminNameRequestsPage() {
    const [requests, setRequests] = useState<NameChangeRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTab, setSelectedTab] = useState<NameChangeStatus | "all">("pending");
    const [searchTerm, setSearchTerm] = useState("");
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Reject Modal State
    const [rejectModalData, setRejectModalData] = useState<{ id: string; name: string } | null>(null);
    const [rejectReasonInput, setRejectReasonInput] = useState("");
    const [rejectSubmitting, setRejectSubmitting] = useState(false);

    // Live listen to name_change_requests
    useEffect(() => {
        const q = query(
            collection(db, "name_change_requests"),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const list = snapshot.docs.map((doc) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || new Date(),
                        reviewedAt: data.reviewedAt?.toDate?.() || null
                    } as NameChangeRequest;
                });
                setRequests(list);
                setLoading(false);
            },
            (err) => {
                console.error("Error listening to name change requests:", err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    const filteredRequests = useMemo(() => {
        return requests.filter((req) => {
            if (selectedTab !== "all" && req.status !== selectedTab) {
                return false;
            }
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const matchName = req.requestedName?.toLowerCase().includes(term);
                const matchCurrent = req.currentName?.toLowerCase().includes(term);
                const matchReason = req.reason?.toLowerCase().includes(term);
                const matchTarget = req.targetId?.toLowerCase().includes(term);
                const matchOrderNo = req.orderNo?.toLowerCase().includes(term);
                return matchName || matchCurrent || matchReason || matchTarget || matchOrderNo;
            }
            return true;
        });
    }, [requests, selectedTab, searchTerm]);

    const counts = useMemo(() => {
        return {
            all: requests.length,
            pending: requests.filter((r) => r.status === "pending").length,
            approved: requests.filter((r) => r.status === "approved").length,
            rejected: requests.filter((r) => r.status === "rejected").length
        };
    }, [requests]);

    const handleApprove = async (req: NameChangeRequest) => {
        if (!confirm(`ยืนยันการอนุมัติแก้ไขชื่อเป็น "${req.requestedName}"?`)) return;

        try {
            setProcessingId(req.id);
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};

            const res = await fetch("/api/name-requests/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ requestId: req.id, action: "approve" })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการอนุมัติ");
        } catch (err: any) {
            alert(err.message || "เกิดข้อผิดพลาด");
        } finally {
            setProcessingId(null);
        }
    };

    const openRejectModal = (req: NameChangeRequest) => {
        setRejectModalData({ id: req.id, name: req.requestedName });
        setRejectReasonInput("");
    };

    const handleConfirmReject = async () => {
        if (!rejectModalData || rejectSubmitting) return;
        const reason = rejectReasonInput.trim();
        if (!reason) {
            alert("กรุณาระบุเหตุผลในการปฏิเสธ");
            return;
        }

        try {
            setRejectSubmitting(true);
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};

            const res = await fetch("/api/name-requests/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({
                    requestId: rejectModalData.id,
                    action: "reject",
                    rejectReason: reason
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการปฏิเสธ");
            setRejectModalData(null);
        } catch (err: any) {
            alert(err.message || "เกิดข้อผิดพลาด");
        } finally {
            setRejectSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <UserCheck className="h-6 w-6 text-gray-700" />
                        คำขอแก้ไขชื่อ
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        รายการคำขอแก้ไขชื่อผู้รับในคำสั่งซื้อและชื่อโปรไฟล์จากลูกค้า
                    </p>
                </div>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
                    <button
                        onClick={() => setSelectedTab("pending")}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            selectedTab === "pending"
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                    >
                        <Clock size={13} className="text-amber-600" />
                        รอตรวจสอบ
                        {counts.pending > 0 && (
                            <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] text-white">
                                {counts.pending}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setSelectedTab("approved")}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            selectedTab === "approved"
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                    >
                        <CheckCircle size={13} className="text-emerald-600" />
                        อนุมัติแล้ว ({counts.approved})
                    </button>
                    <button
                        onClick={() => setSelectedTab("rejected")}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            selectedTab === "rejected"
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                    >
                        <XCircle size={13} className="text-red-600" />
                        ปฏิเสธ ({counts.rejected})
                    </button>
                    <button
                        onClick={() => setSelectedTab("all")}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            selectedTab === "all"
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                    >
                        ทั้งหมด ({counts.all})
                    </button>
                </div>

                <div className="relative min-w-[240px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="ค้นหาชื่อ, รหัสคำสั่งซื้อ..."
                        className="w-full rounded-xl border border-gray-200 bg-white py-1.5 pl-9 pr-4 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                </div>
            </div>

            {/* Content Table */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                {loading ? (
                    <div className="flex h-64 items-center justify-center text-gray-500">
                        <Loader2 className="mr-2 animate-spin" size={20} />
                        กำลังโหลดรายการคำขอ...
                    </div>
                ) : filteredRequests.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
                        <div className="rounded-full bg-gray-100 p-4 text-gray-400">
                            <UserCheck size={28} />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-gray-800">ไม่พบคำขอแก้ไขชื่อ</p>
                        <p className="text-xs text-gray-500 mt-1">
                            {selectedTab === "pending"
                                ? "ไม่มีคำขอที่รอการตรวจสอบในขณะนี้"
                                : "ไม่มีรายการที่ตรงกับเงื่อนไขการค้นหา"}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="px-4 py-3">วันเวลาที่ขอ</th>
                                    <th className="px-4 py-3">ประเภท</th>
                                    <th className="px-4 py-3">คำสั่งซื้อ / ลูกค้า</th>
                                    <th className="px-4 py-3">ชื่อเดิม</th>
                                    <th className="px-4 py-3">ชื่อใหม่ที่ขอ</th>
                                    <th className="px-4 py-3">เหตุผล</th>
                                    <th className="px-4 py-3">สถานะ</th>
                                    <th className="px-4 py-3 text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredRequests.map((req) => (
                                    <tr key={req.id} className="transition-colors hover:bg-gray-50/60">
                                        <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-gray-500">
                                            {format(new Date(req.createdAt), "d MMM yyyy HH:mm", { locale: th })}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                req.type === "order"
                                                    ? "bg-blue-50 text-blue-700"
                                                    : "bg-purple-50 text-purple-700"
                                            }`}>
                                                {req.type === "order" ? "คำสั่งซื้อ" : "โปรไฟล์"}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            {req.type === "order" ? (
                                                <Link
                                                    href={`/orders/${req.targetId}`}
                                                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                                    target="_blank"
                                                >
                                                    <ShoppingBag size={12} />
                                                    {req.orderNo || req.targetId.slice(0, 8)}
                                                    <ExternalLink size={10} />
                                                </Link>
                                            ) : (
                                                <span className="font-mono text-gray-600">
                                                    {req.customerId || req.userId || "-"}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 line-through">
                                            {req.currentName || "-"}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-gray-900">
                                            {req.requestedName}
                                        </td>
                                        <td className="max-w-[200px] truncate px-4 py-3 text-gray-600" title={req.reason}>
                                            {req.reason}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            {req.status === "pending" && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                                                    <Clock size={10} />
                                                    รอตรวจสอบ
                                                </span>
                                            )}
                                            {req.status === "approved" && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                                                    <CheckCircle size={10} />
                                                    อนุมัติแล้ว
                                                </span>
                                            )}
                                            {req.status === "rejected" && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 border border-red-200" title={req.rejectReason || ""}>
                                                    <XCircle size={10} />
                                                    ปฏิเสธ
                                                </span>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right">
                                            {req.status === "pending" ? (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        type="button"
                                                        disabled={processingId === req.id}
                                                        onClick={() => openRejectModal(req)}
                                                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                                    >
                                                        ปฏิเสธ
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={processingId === req.id}
                                                        onClick={() => handleApprove(req)}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                                    >
                                                        {processingId === req.id ? (
                                                            <Loader2 size={11} className="animate-spin" />
                                                        ) : (
                                                            <CheckCircle size={11} />
                                                        )}
                                                        อนุมัติ
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-gray-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Reject Modal */}
            {rejectModalData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="font-bold text-gray-900 text-sm">ปฏิเสธคำขอแก้ไขชื่อ</h3>
                                <p className="text-xs text-gray-500 mt-0.5">ชื่อที่ขอ: {rejectModalData.name}</p>
                            </div>
                            <button
                                onClick={() => setRejectModalData(null)}
                                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                            >
                                <XCircle size={18} />
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                ระบุเหตุผลการปฏิเสธ <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                required
                                rows={3}
                                value={rejectReasonInput}
                                onChange={(e) => setRejectReasonInput(e.target.value)}
                                placeholder="เช่น ชื่อไม่ตรงกับเอกสารยืนยันตัวตน, คำสั่งซื้อจัดส่งแล้ว"
                                className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                            />
                        </div>

                        <div className="flex gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => setRejectModalData(null)}
                                disabled={rejectSubmitting}
                                className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmReject}
                                disabled={rejectSubmitting || !rejectReasonInput.trim()}
                                className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                {rejectSubmitting && <Loader2 size={12} className="animate-spin" />}
                                ยืนยันปฏิเสธ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
