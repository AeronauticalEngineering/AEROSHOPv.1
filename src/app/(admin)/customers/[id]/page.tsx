"use client";

import { useState, useEffect } from "react";
import { doc, collection, query, where, orderBy, onSnapshot, updateDoc, serverTimestamp, arrayRemove } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Users, Phone, MapPin, ShoppingBag, TrendingUp, Clock, Package, CheckCircle, Truck, XCircle, Calendar, CreditCard, X, User, Trash2, Pencil, Save, RotateCcw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Order, OrderStatus } from "@/types/order";
import { formatOrderId } from "@/lib/orderId";

interface AddressItem {
    name: string;
    phone: string;
    address: string;
    usedAt?: string;
}

interface Customer {
    id: string;
    name: string;
    phone: string;
    address: string;
    lineId?: string;
    displayName?: string;
    pictureUrl?: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderAt?: Date | null;
    createdAt?: Date | null;
    addressHistory?: AddressItem[];
}

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
    pending: { label: "รอชำระ", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200/60", icon: <Clock size={12} /> },
    processing: { label: "กำลังจัดเตรียม", color: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200/60", icon: <Package size={12} /> },
    paid: { label: "ชำระแล้ว", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200/60", icon: <CreditCard size={12} /> },
    shipped: { label: "จัดส่งแล้ว", color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200/60", icon: <Truck size={12} /> },
    completed: { label: "สำเร็จ", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200/60", icon: <CheckCircle size={12} /> },
    cancelled: { label: "ยกเลิก", color: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200/60", icon: <XCircle size={12} /> },
    returned: { label: "คืนสินค้า", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200/60", icon: <RotateCcw size={12} /> },
};

function CustomerAvatar({
    url,
    name,
    iconSize = 14,
}: {
    url?: string | null;
    name?: string;
    iconSize?: number;
}) {
    const [prevUrl, setPrevUrl] = useState(url);
    const [hasError, setHasError] = useState(false);

    if (url !== prevUrl) {
        setPrevUrl(url);
        setHasError(false);
    }

    if (!url || !url.trim() || hasError) {
        return <Users size={iconSize} className="text-slate-400" />;
    }

    return (
        <img
            key={url}
            src={url}
            alt={name || ""}
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
            referrerPolicy="no-referrer"
            loading="lazy"
        />
    );
}

export default function CustomerDetailPage() {
    const params = useParams();
    const router = useRouter();
    const customerId = params.id as string;

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [ordersLoading, setOrdersLoading] = useState(true);

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editFormData, setEditFormData] = useState<Partial<Customer>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Edit Address State
    const [editingAddressIndex, setEditingAddressIndex] = useState<number | null>(null);
    const [addressFormData, setAddressFormData] = useState<AddressItem | null>(null);

    const handleStartEditAddress = (idx: number, addr: AddressItem) => {
        setEditingAddressIndex(idx);
        setAddressFormData({ ...addr });
    };

    const handleSaveAddress = async (idx: number) => {
        if (!customer || !customer.addressHistory || !addressFormData) return;

        const newHistory = [...customer.addressHistory];
        newHistory[idx] = { ...newHistory[idx], ...addressFormData };

        try {
            await updateDoc(doc(db, "customers", customer.id), {
                addressHistory: newHistory
            });
            setEditingAddressIndex(null);
            setAddressFormData(null);
        } catch (error) {
            console.error("Error updating address:", error);
            alert("บันทึกที่อยู่ไม่สำเร็จ");
        }
    };

    // Fetch Customer with Real-time Updates
    useEffect(() => {
        if (!customerId) return;

        const docRef = doc(db, "customers", customerId);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCustomer({
                    id: docSnap.id,
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
                    lastOrderAt: data.lastOrderAt?.toDate ? data.lastOrderAt.toDate() : null,
                } as Customer);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching customer:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [customerId]);

    // Fetch Orders
    useEffect(() => {
        if (!customerId) return;

        const q = query(
            collection(db, "orders"),
            where("customerId", "==", customerId),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
            })) as Order[];
            setOrders(items);
            setOrdersLoading(false);
        }, (error) => {
            console.error("Error fetching orders:", error);
            setOrdersLoading(false);
        });

        return () => unsubscribe();
    }, [customerId]);

    const handleStartEdit = () => {
        if (customer) {
            setEditFormData({
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
                displayName: customer.displayName,
                lineId: customer.lineId,
                pictureUrl: customer.pictureUrl
            });
            setIsEditing(true);
        }
    };

    const handleSaveCustomer = async () => {
        if (!customer) return;
        setIsSaving(true);
        try {
            await updateDoc(doc(db, "customers", customer.id), {
                name: editFormData.name || customer.name,
                phone: editFormData.phone || customer.phone,
                address: editFormData.address || customer.address,
                displayName: editFormData.displayName || null,
                lineId: editFormData.lineId || null,
                pictureUrl: editFormData.pictureUrl || null,
                updatedAt: serverTimestamp()
            });
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating customer:", error);
            alert("เกิดข้อผิดพลาดในการบันทึก");
        } finally {
            setIsSaving(false);
        }
    };

    const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
        try {
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};

            const res = await fetch("/api/orders/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ orderId, status: newStatus })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Update failed");
            }
            if (selectedOrder && selectedOrder.id === orderId) {
                setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
            }
        } catch (error) {
            console.error("Error updating status:", error);
            alert("เกิดข้อผิดพลาด");
        }
    };

    const handleDeleteAddress = async (address: AddressItem) => {
        if (!confirm("คุณต้องการลบที่อยู่นี้ออกจากประวัติใช่หรือไม่?")) return;

        try {
            const docRef = doc(db, "customers", customerId);
            await updateDoc(docRef, {
                addressHistory: arrayRemove(address)
            });
        } catch (error) {
            console.error("Error deleting address:", error);
            alert("ไม่สามารถลบที่อยู่ได้");
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                <Loader2 className="animate-spin text-slate-500" size={24} />
                <p className="text-xs">กำลังโหลดข้อมูลลูกค้า...</p>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="text-center py-16 space-y-3">
                <Users size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-medium text-slate-600">ไม่พบข้อมูลลูกค้า</p>
                <button
                    type="button"
                    onClick={() => router.push("/customers")}
                    className="h-8 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                    กลับสู่หน้ารายการลูกค้า
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-3.5">
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition shadow-2xs"
                        title="ย้อนกลับ"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-0.5">
                            <span className="cursor-pointer hover:underline" onClick={() => router.push("/customers")}>ลูกค้า</span>
                            <span>/</span>
                            <span className="font-mono text-slate-700">#{customerId.slice(0, 8)}</span>
                        </div>
                        <h1 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                            {customer.name}
                            {customer.displayName && customer.displayName !== customer.name && (
                                <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-normal text-slate-500">
                                    LINE: {customer.displayName}
                                </span>
                            )}
                        </h1>
                    </div>
                </div>

                {!isEditing && (
                    <button
                        type="button"
                        onClick={handleStartEdit}
                        className="inline-flex h-8 items-center gap-1.5 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                    >
                        <Pencil size={12} className="text-slate-500" />
                        แก้ไขข้อมูลลูกค้า
                    </button>
                )}
            </div>

            {/* Customer Info Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-500" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">ข้อมูลส่วนตัวลูกค้า</span>
                    </div>
                    {isEditing && (
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                disabled={isSaving}
                                className="h-7 px-2.5 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveCustomer}
                                disabled={isSaving}
                                className="inline-flex h-7 items-center gap-1 px-3 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition"
                            >
                                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                บันทึก
                            </button>
                        </div>
                    )}
                </div>

                <div className="p-4">
                    {!isEditing ? (
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                            <div className="w-12 h-12 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                <CustomerAvatar url={customer.pictureUrl} name={customer.name} iconSize={20} />
                            </div>
                            <div className="flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-bold text-slate-900">{customer.name}</h3>
                                    {customer.lineId && (
                                        <span className="text-[10px] text-slate-400 font-mono">ID: {customer.lineId}</span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-mono">
                                    <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 hover:text-sky-600 transition">
                                        <Phone size={13} className="text-slate-400" />
                                        {customer.phone || "-"}
                                    </a>
                                </div>
                                {customer.address && (
                                    <div className="flex items-start gap-1.5 text-xs text-slate-600 pt-1">
                                        <MapPin size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />
                                        <span>{customer.address}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">ชื่อ-นามสกุล</label>
                                    <input
                                        type="text"
                                        value={editFormData.name || ''}
                                        onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                        className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">เบอร์โทรศัพท์</label>
                                    <input
                                        type="tel"
                                        value={editFormData.phone || ''}
                                        onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                                        className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">ที่อยู่ปัจจุบัน</label>
                                <textarea
                                    rows={2}
                                    value={editFormData.address || ''}
                                    onChange={e => setEditFormData({ ...editFormData, address: e.target.value })}
                                    className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition resize-y min-h-[50px]"
                                />
                            </div>

                            <div className="pt-2 border-t border-slate-100">
                                <span className="text-[11px] font-semibold text-slate-700 block mb-2">ข้อมูล LINE (สำหรับเชื่อมต่อ)</span>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div>
                                        <label className="block text-[10px] text-slate-500 mb-0.5">LINE Display Name</label>
                                        <input
                                            type="text"
                                            value={editFormData.displayName || ''}
                                            onChange={e => setEditFormData({ ...editFormData, displayName: e.target.value })}
                                            className="w-full h-7 px-2 bg-slate-50/60 border border-slate-200 rounded-md text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900/10"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 mb-0.5">LINE User ID</label>
                                        <input
                                            type="text"
                                            value={editFormData.lineId || ''}
                                            onChange={e => setEditFormData({ ...editFormData, lineId: e.target.value })}
                                            className="w-full h-7 px-2 bg-slate-50/60 border border-slate-200 rounded-md text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900/10"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-slate-500 mb-0.5">Profile Picture URL</label>
                                        <input
                                            type="text"
                                            value={editFormData.pictureUrl || ''}
                                            onChange={e => setEditFormData({ ...editFormData, pictureUrl: e.target.value })}
                                            className="w-full h-7 px-2 bg-slate-50/60 border border-slate-200 rounded-md text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900/10"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Stats Footer */}
                <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-200/80 bg-slate-50/40">
                    <div className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-slate-400 text-[11px] mb-0.5">
                            <ShoppingBag size={11} />
                            ออเดอร์
                        </div>
                        <p className="font-mono text-base font-bold text-slate-900">{(customer.totalOrders || 0).toLocaleString()}</p>
                    </div>
                    <div className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-slate-400 text-[11px] mb-0.5">
                            <TrendingUp size={11} />
                            ยอดซื้อรวม
                        </div>
                        <p className="font-mono text-base font-bold text-slate-900">฿{(customer.totalSpent || 0).toLocaleString()}</p>
                    </div>
                    <div className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-slate-400 text-[11px] mb-0.5">
                            <Calendar size={11} />
                            สั่งซื้อล่าสุด
                        </div>
                        <p className="font-mono text-xs font-semibold text-slate-800 mt-1">
                            {customer.lastOrderAt
                                ? format(customer.lastOrderAt, 'd MMM yy', { locale: th })
                                : '-'
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* Address Book */}
            {customer.addressHistory && customer.addressHistory.length > 0 && (
                <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
                        <MapPin size={14} className="text-slate-500" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">สมุดที่อยู่ลูกค้า ({customer.addressHistory.length})</span>
                    </div>
                    <div className="p-3.5 space-y-2">
                        {customer.addressHistory.map((addr, idx) => (
                            <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-2.5 text-xs transition group">
                                {editingAddressIndex === idx ? (
                                    <div className="space-y-2 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                value={addressFormData?.name || ''}
                                                onChange={e => setAddressFormData(prev => prev ? { ...prev, name: e.target.value } : null)}
                                                className="h-7 px-2 rounded-md border border-slate-200 text-xs bg-slate-50/60 outline-none focus:bg-white focus:ring-1 focus:ring-slate-900/10"
                                                placeholder="ชื่อผู้รับ"
                                            />
                                            <input
                                                type="text"
                                                value={addressFormData?.phone || ''}
                                                onChange={e => setAddressFormData(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                                className="h-7 px-2 rounded-md border border-slate-200 text-xs font-mono bg-slate-50/60 outline-none focus:bg-white focus:ring-1 focus:ring-slate-900/10"
                                                placeholder="เบอร์โทร"
                                            />
                                        </div>
                                        <textarea
                                            value={addressFormData?.address || ''}
                                            onChange={e => setAddressFormData(prev => prev ? { ...prev, address: e.target.value } : null)}
                                            className="w-full px-2 py-1 rounded-md border border-slate-200 text-xs bg-slate-50/60 resize-none outline-none focus:bg-white focus:ring-1 focus:ring-slate-900/10"
                                            rows={2}
                                            placeholder="ที่อยู่จัดส่ง"
                                        />
                                        <div className="flex justify-end gap-1.5 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setEditingAddressIndex(null)}
                                                className="h-6.5 px-2 text-[11px] font-medium text-slate-600 rounded hover:bg-slate-100"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSaveAddress(idx)}
                                                className="h-6.5 px-2.5 bg-slate-900 text-white text-[11px] font-medium rounded hover:bg-slate-800 transition"
                                            >
                                                บันทึก
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="space-y-0.5">
                                            <p className="font-semibold text-xs text-slate-900">{addr.name} • <span className="font-mono text-slate-600">{addr.phone}</span></p>
                                            <p className="text-[11px] text-slate-600">{addr.address}</p>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={() => handleStartEditAddress(idx, addr)}
                                                className="flex h-6 w-6 items-center justify-center text-slate-400 hover:text-slate-700 bg-white rounded border border-slate-200 transition"
                                                title="แก้ไขที่อยู่"
                                            >
                                                <Pencil size={11} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteAddress(addr)}
                                                className="flex h-6 w-6 items-center justify-center text-slate-400 hover:text-rose-600 bg-white rounded border border-slate-200 transition"
                                                title="ลบที่อยู่"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Order History */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                        <ShoppingBag size={14} className="text-slate-500" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">ประวัติการสั่งซื้อ</span>
                        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                            {orders.length} รายการ
                        </span>
                    </div>
                </div>

                {ordersLoading ? (
                    <div className="p-8 text-center text-slate-400 text-xs">กำลังโหลดประวัติการสั่งซื้อ...</div>
                ) : orders.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        <ShoppingBag size={28} className="mx-auto mb-1.5 text-slate-300" />
                        <p className="text-xs">ยังไม่มีประวัติการสั่งซื้อ</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {orders.map((order) => {
                            const status = statusConfig[order.status] || statusConfig['pending'];
                            return (
                                <div
                                    key={order.id}
                                    onClick={() => router.push(`/orders/${encodeURIComponent(order.id)}`)}
                                    className="p-3.5 hover:bg-slate-50/60 transition cursor-pointer"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono font-semibold text-slate-900">{formatOrderId(order, 8)}</span>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${status.bg} ${status.color} ${status.border}`}>
                                                    {status.icon}
                                                    {status.label}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-700 truncate">
                                                {order.items[0]?.productName}
                                                {order.items.length > 1 && ` +${order.items.length - 1} รายการ`}
                                            </p>
                                            <p className="text-[10px] font-mono text-slate-400">
                                                {format(order.createdAt as Date, 'd MMM yyyy, HH:mm', { locale: th })}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-mono text-xs font-bold text-slate-900">฿{order.totalAmount.toLocaleString()}</p>
                                            <p className="font-mono text-[10px] text-slate-400">
                                                {order.items.reduce((sum, item) => sum + item.quantity, 0)} ชิ้น
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Order Detail Modal */}
            {selectedOrder && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl border border-slate-200/80 overflow-hidden flex flex-col shadow-xl animate-in fade-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                            <div>
                                <span className="font-semibold text-xs text-slate-900">คำสั่งซื้อ {formatOrderId(selectedOrder, 8)}</span>
                                <p className="text-[10px] font-mono text-slate-400">{format(selectedOrder.createdAt as Date, 'd MMMM yyyy HH:mm', { locale: th })}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedOrder(null)}
                                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {/* Status */}
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-medium text-slate-500">สถานะ</span>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${statusConfig[selectedOrder.status].bg} ${statusConfig[selectedOrder.status].color} ${statusConfig[selectedOrder.status].border}`}>
                                    {statusConfig[selectedOrder.status].icon}
                                    {statusConfig[selectedOrder.status].label}
                                </span>
                            </div>

                            {/* Customer Info */}
                            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden p-3 space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <User size={13} className="text-slate-400" />
                                    <span>ข้อมูลลูกค้า</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <p className="text-[10px] text-slate-400">ชื่อ</p>
                                        <p className="font-medium text-slate-900">{selectedOrder.customerName}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400">เบอร์โทร</p>
                                        <p className="font-mono text-slate-900">{selectedOrder.customerPhone}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Shipping Address */}
                            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden p-3 space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <MapPin size={13} className="text-slate-400" />
                                    <span>ที่อยู่จัดส่ง</span>
                                </div>
                                <p className="text-xs text-slate-600">{selectedOrder.shippingAddress || "ไม่ระบุ (รับเอง)"}</p>
                            </div>

                            {/* Items */}
                            <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
                                <div className="px-3 py-2 bg-slate-50/70 border-b border-slate-100 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                    <Package size={13} className="text-slate-400" />
                                    <span>รายการสินค้า</span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {selectedOrder.items.map((item, idx) => (
                                        <div key={idx} className="px-3 py-2 flex justify-between items-center text-xs">
                                            <div>
                                                <p className="font-medium text-slate-900">{item.productName}</p>
                                                <p className="text-[10px] font-mono text-slate-400">฿{item.price.toLocaleString()} × {item.quantity}</p>
                                            </div>
                                            <p className="font-mono font-bold text-slate-900">฿{(item.price * item.quantity).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="px-3 py-2 bg-slate-50/70 border-t border-slate-100 flex justify-between items-center text-xs">
                                    <span className="font-semibold text-slate-700">ยอดรวมทั้งสิ้น</span>
                                    <span className="font-mono font-bold text-sm text-slate-900">฿{selectedOrder.totalAmount.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer - Actions */}
                        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-1.5">
                            {selectedOrder.status === 'pending' && (
                                <button
                                    type="button"
                                    onClick={() => handleStatusChange(selectedOrder.id, 'paid')}
                                    className="flex-1 h-7.5 bg-blue-600 text-white rounded-lg font-medium text-xs hover:bg-blue-700 flex items-center justify-center gap-1.5 transition"
                                >
                                    <CreditCard size={13} /> ยืนยันชำระเงิน
                                </button>
                            )}
                            {selectedOrder.status === 'paid' && (
                                <button
                                    type="button"
                                    onClick={() => handleStatusChange(selectedOrder.id, 'shipped')}
                                    className="flex-1 h-7.5 bg-purple-600 text-white rounded-lg font-medium text-xs hover:bg-purple-700 flex items-center justify-center gap-1.5 transition"
                                >
                                    <Truck size={13} /> จัดส่งแล้ว
                                </button>
                            )}
                            {selectedOrder.status === 'shipped' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleStatusChange(selectedOrder.id, 'completed')}
                                        className="flex-1 h-7.5 bg-emerald-600 text-white rounded-lg font-medium text-xs hover:bg-emerald-700 flex items-center justify-center gap-1.5 transition"
                                    >
                                        <CheckCircle size={13} /> สำเร็จ
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleStatusChange(selectedOrder.id, 'returned')}
                                        className="flex-1 h-7.5 bg-orange-600 text-white rounded-lg font-medium text-xs hover:bg-orange-700 flex items-center justify-center gap-1.5 transition"
                                    >
                                        <RotateCcw size={13} /> คืนสินค้า
                                    </button>
                                </>
                            )}
                            {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'completed' && selectedOrder.status !== 'returned' && (
                                <button
                                    type="button"
                                    onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                                    className="h-7.5 px-3 border border-rose-200 text-rose-600 rounded-lg font-medium text-xs hover:bg-rose-50 transition"
                                >
                                    ยกเลิก
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
