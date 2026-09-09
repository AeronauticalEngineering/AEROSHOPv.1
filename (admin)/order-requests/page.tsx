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
    ShoppingBag, 
    Sparkles, 
    XCircle,
    FileText,
    ArrowRight
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { OrderEditRequest, OrderEditRequestStatus } from "@/types/orderEditRequest";

export default function AdminOrderRequestsPage() {
    const [requests, setRequests] = useState<OrderEditRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTab, setSelectedTab] = useState<OrderEditRequestStatus | "all">("pending");
    const [searchTerm, setSearchTerm] = useState("");
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Resolve / Reject Modal State
    const [modalData, setModalData] = useState<{ id: string; action: "complete" | "reject"; orderNo?: string } | null>(null);
    const [adminNoteInput, setAdminNoteInput] = useState("");
    const [modalSubmitting, setModalSubmitting] = useState(false);

    const fetchRequestsFromApi = async () => {
        try {
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};
            const res = await fetch("/api/order-requests", {
                headers: authHeaders
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.requests)) {
                    setRequests(data.requests);
                }
            }
        } catch (e) {
            console.warn("API fallback error:", e);
        } finally {
            setLoading(false);
        }
    };

    // Load requests via API and live listen via Firestore
    useEffect(() => {
        fetchRequestsFromApi();

        const q = query(collection(db, "order_edit_requests"));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const list = snapshot.docs.map((doc) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || (data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000) : new Date()),
                        reviewedAt: data.reviewedAt?.toDate?.() || (data.reviewedAt?.seconds ? new Date(data.reviewedAt.seconds * 1000) : null)
                    } as OrderEditRequest;
                });

                // Sort descending by createdAt in memory
                list.sort((a, b) => {
                    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return timeB - timeA;
                });

                if (list.length > 0) {
                    setRequests(list);
                }
                setLoading(false);
            },
            (err) => {
                console.warn("Firestore snapshot error in order-requests:", err);
                fetchRequestsFromApi();
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
                const matchOrderNo = req.orderNo?.toLowerCase().includes(term);
                const matchCustomer = req.customerName?.toLowerCase().includes(term);
                const matchPhone = req.customerPhone?.toLowerCase().includes(term);
                const matchItem = req.itemName?.toLowerCase().includes(term);
                const matchDetails = req.details?.toLowerCase().includes(term);
                const matchReason = req.reason?.toLowerCase().includes(term);
                return matchOrderNo || matchCustomer || matchPhone || matchItem || matchDetails || matchReason;
            }
            return true;
        });
    }, [requests, selectedTab, searchTerm]);

    const counts = useMemo(() => {
        return {
            all: requests.length,
            pending: requests.filter((r) => r.status === "pending").length,
            completed: requests.filter((r) => r.status === "completed").length,
            rejected: requests.filter((r) => r.status === "rejected").length
        };
    }, [requests]);

    const openModal = (id: string, action: "complete" | "reject", orderNo?: string) => {
        setModalData({ id, action, orderNo });
        setAdminNoteInput(action === "complete" ? "แก้ไขบริการเสริม/ออเดอร์ให้เรียบร้อยแล้ว" : "");
    };

    const handleConfirmAction = async () => {
        if (!modalData || modalSubmitting) return;

        try {
            setModalSubmitting(true);
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};

            const res = await fetch("/api/order-requests/resolve", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({
                    requestId: modalData.id,
                    action: modalData.action,
                    adminNote: adminNoteInput.trim()
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาดในการบันทึก");
            setModalData(null);
        } catch (err: any) {
            alert(err.message || "เกิดข้อผิดพลาด");
        } finally {
            setModalSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="text-amber-500" />
                        คำขอแก้ไขออเดอร์ & บริการเสริม
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        จัดการและตรวจสอบคำขอปรับเปลี่ยนบริการเสริมหรือรายละเอียดสินค้าจากลูกค้า
                    </p>
                </div>
            </div>

            {/* Quick Stats Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                <button
                    onClick={() => setSelectedTab("pending")}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                        selectedTab === "pending"
                            ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                >
                    <Clock size={16} />
                    รอดำเนินการ
                    {counts.pending > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                            selectedTab === "pending" ? "bg-white text-amber-600 font-bold" : "bg-amber-100 text-amber-700"
                        }`}>
                            {counts.pending}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setSelectedTab("completed")}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                        selectedTab === "completed"
                            ? "bg-green-600 text-white shadow-md shadow-green-600/20"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                >
                    <CheckCircle size={16} />
                    ดำเนินการแล้ว ({counts.completed})
                </button>

                <button
                    onClick={() => setSelectedTab("rejected")}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                        selectedTab === "rejected"
                            ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                >
                    <XCircle size={16} />
                    ปฏิเสธ ({counts.rejected})
                </button>

                <button
                    onClick={() => setSelectedTab("all")}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                        selectedTab === "all"
                            ? "bg-slate-800 text-white shadow-md shadow-slate-800/20"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                >
                    <Filter size={16} />
                    ทั้งหมด ({counts.all})
                </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="ค้นหาเลขที่ออเดอร์, ชื่อลูกค้า, บริการ..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                </div>
                <div className="text-xs text-slate-500">
                    พบ {filteredRequests.length} รายการ
                </div>
            </div>

            {/* Content Table / Cards */}
            {loading ? (
                <div className="bg-white rounded-2xl p-12 border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3">
                    <Loader2 className="animate-spin text-blue-600" size={32} />
                    <p className="text-sm text-slate-500">กำลังโหลดคำขอแก้ไขออเดอร์...</p>
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 border border-slate-100 shadow-sm text-center">
                    <div className="w-14 h-14 mx-auto rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-3">
                        <CheckCircle size={28} />
                    </div>
                    <h3 className="font-semibold text-slate-700 text-base">ไม่มีคำขอในหมวดนี้</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        {searchTerm ? "ไม่พบคำขอที่ตรงกับเงื่อนไขการค้นหา" : "ไม่มีคำขอแก้ไขออเดอร์หรือบริการเสริมที่รอดำเนินการ"}
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-600 font-semibold text-xs">
                                    <th className="py-3 px-4">ออเดอร์ & ลูกค้า</th>
                                    <th className="py-3 px-4">สินค้า / บริการเสริมที่ขอแก้ไข</th>
                                    <th className="py-3 px-4">เหตุผลในการขอแก้ไข</th>
                                    <th className="py-3 px-4">วันที่แจ้ง</th>
                                    <th className="py-3 px-4">สถานะ</th>
                                    <th className="py-3 px-4 text-right">การดำเนินการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRequests.map((req) => (
                                    <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                                        {/* Order & Customer */}
                                        <td className="py-3.5 px-4 align-top">
                                            <div className="space-y-1">
                                                <Link 
                                                    href={`/orders/${req.orderId}`}
                                                    className="font-bold text-blue-600 hover:underline flex items-center gap-1.5"
                                                >
                                                    <ShoppingBag size={14} />
                                                    #{req.orderNo || req.orderId}
                                                    <ExternalLink size={12} />
                                                </Link>
                                                <div className="text-xs text-slate-700 font-medium">
                                                    {req.customerName || "ไม่ระบุชื่อ"}
                                                </div>
                                                {req.customerPhone && (
                                                    <div className="text-[11px] text-slate-400">
                                                        โทร: {req.customerPhone}
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Request Details */}
                                        <td className="py-3.5 px-4 align-top max-w-xs">
                                            <div className="space-y-1">
                                                {req.itemName && (
                                                    <div className="font-semibold text-slate-800 text-xs flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
                                                        {req.itemName}
                                                    </div>
                                                )}
                                                <div className="p-2.5 bg-amber-50/70 border border-amber-200/70 rounded-xl text-xs text-amber-900 font-medium whitespace-pre-wrap">
                                                    {req.details}
                                                </div>
                                                {req.adminNote && (
                                                    <div className="text-[11px] text-slate-500 bg-slate-100 p-2 rounded-lg mt-1">
                                                        <span className="font-semibold text-slate-700">บันทึกแอดมิน: </span>
                                                        {req.adminNote}
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        {/* Reason */}
                                        <td className="py-3.5 px-4 align-top text-xs text-slate-600 max-w-[220px]">
                                            <p className="line-clamp-3">{req.reason || "-"}</p>
                                        </td>

                                        {/* Date */}
                                        <td className="py-3.5 px-4 align-top text-xs text-slate-500 whitespace-nowrap">
                                            <div>
                                                {req.createdAt ? format(new Date(req.createdAt), "dd MMM yyyy", { locale: th }) : "-"}
                                            </div>
                                            <div className="text-[11px] text-slate-400">
                                                {req.createdAt ? format(new Date(req.createdAt), "HH:mm น.", { locale: th }) : ""}
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="py-3.5 px-4 align-top">
                                            {req.status === "pending" && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                    <Clock size={12} />
                                                    รอดำเนินการ
                                                </span>
                                            )}
                                            {req.status === "completed" && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                                                    <CheckCircle size={12} />
                                                    แก้ไขแล้ว
                                                </span>
                                            )}
                                            {req.status === "rejected" && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                                                    <XCircle size={12} />
                                                    ปฏิเสธ
                                                </span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Link
                                                    href={`/orders/${req.orderId}`}
                                                    className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1"
                                                >
                                                    ไปหน้าคำสั่งซื้อ
                                                    <ArrowRight size={13} />
                                                </Link>

                                                {req.status === "pending" && (
                                                    <>
                                                        <button
                                                            onClick={() => openModal(req.id, "complete", req.orderNo)}
                                                            className="px-2.5 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg text-xs font-semibold transition-colors"
                                                        >
                                                            เสร็จสิ้น
                                                        </button>
                                                        <button
                                                            onClick={() => openModal(req.id, "reject", req.orderNo)}
                                                            className="px-2.5 py-1.5 bg-slate-100 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold transition-colors"
                                                        >
                                                            ปฏิเสธ
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Resolve / Reject Modal */}
            {modalData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                                {modalData.action === "complete" ? (
                                    <>
                                        <CheckCircle className="text-green-600" size={18} />
                                        ยืนยันดำเนินการแก้ไขคำสั่งซื้อ #{modalData.orderNo || ""}
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="text-red-600" size={18} />
                                        ปฏิเสธคำขอแก้ไขคำสั่งซื้อ #{modalData.orderNo || ""}
                                    </>
                                )}
                            </h3>
                            <button
                                onClick={() => setModalData(null)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {modalData.action === "complete" ? "ข้อความแจ้งลูกค้า (ไม่บังคับ)" : "เหตุผลในการปฏิเสธคำขอ *"}
                            </label>
                            <textarea
                                rows={3}
                                required={modalData.action === "reject"}
                                value={adminNoteInput}
                                onChange={(e) => setAdminNoteInput(e.target.value)}
                                placeholder={
                                    modalData.action === "complete"
                                        ? "เช่น ดำเนินการเพิ่มบริการเสริม/แก้ไขออเดอร์ให้เรียบร้อยแล้ว"
                                        : "เช่น คำสั่งซื้อถูกจัดเตรียมแล้วไม่สามารถเปลี่ยนได้ หรือ บริการเสริมนี้ไม่มีในสต็อก"
                                }
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setModalData(null)}
                                disabled={modalSubmitting}
                                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                            >
                                ปิด
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmAction}
                                disabled={modalSubmitting || (modalData.action === "reject" && !adminNoteInput.trim())}
                                className={`flex-1 py-2.5 px-4 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                                    modalData.action === "complete" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                                }`}
                            >
                                {modalSubmitting && <Loader2 size={14} className="animate-spin" />}
                                ยืนยัน
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
