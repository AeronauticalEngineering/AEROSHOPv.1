"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, updateDoc, serverTimestamp, arrayRemove } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Users, Phone, MapPin, ShoppingBag, TrendingUp, Clock, Package, CheckCircle, Truck, XCircle, Calendar, CreditCard, X, User, Trash2, Pencil, Save, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Order, OrderStatus } from "@/types/order";
import { formatOrderId } from "@/lib/orderId";

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
    lastOrderAt?: any;
    createdAt?: any;
    addressHistory?: Array<{
        name: string;
        phone: string;
        address: string;
        usedAt: string;
    }>;
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    pending: { label: "รอชำระ", color: "text-amber-600", bg: "bg-amber-50", icon: <Clock size={14} /> },
    processing: { label: "กำลังจัดเตรียม", color: "text-blue-600", bg: "bg-blue-50", icon: <Package size={14} /> },
    paid: { label: "ชำระแล้ว", color: "text-blue-600", bg: "bg-blue-50", icon: <CreditCard size={14} /> },
    shipped: { label: "จัดส่งแล้ว", color: "text-purple-600", bg: "bg-purple-50", icon: <Truck size={14} /> },
    completed: { label: "สำเร็จ", color: "text-green-600", bg: "bg-green-50", icon: <CheckCircle size={14} /> },
    cancelled: { label: "ยกเลิก", color: "text-red-600", bg: "bg-red-50", icon: <XCircle size={14} /> },
    returned: { label: "คืนสินค้า", color: "text-orange-600", bg: "bg-orange-50", icon: <RotateCcw size={14} /> },
};

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
    const [addressFormData, setAddressFormData] = useState<any>(null);

    const handleStartEditAddress = (idx: number, addr: any) => {
        setEditingAddressIndex(idx);
        setAddressFormData({ ...addr });
    };

    const handleSaveAddress = async (idx: number) => {
        if (!customer || !customer.addressHistory) return;

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
                    createdAt: data.createdAt?.toDate() || null,
                    lastOrderAt: data.lastOrderAt?.toDate() || null,
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
                createdAt: doc.data().createdAt?.toDate() || new Date()
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
            const res = await fetch("/api/orders/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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

    const handleDeleteAddress = async (address: any) => {
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
            <div className="flex items-center justify-center h-64">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="text-center py-16">
                <Users size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">ไม่พบข้อมูลลูกค้า</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
                    <ChevronLeft size={20} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-gray-800">ข้อมูลลูกค้า</h1>
                    <p className="text-sm text-gray-500">#{customerId.slice(0, 8)}</p>
                </div>
            </div>

            {/* Customer Info Card */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <h2 className="text-lg font-bold text-gray-900">ข้อมูลส่วนตัว</h2>
                        {!isEditing ? (
                            <button
                                onClick={handleStartEdit}
                                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <Pencil size={18} />
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsEditing(false)}
                                    disabled={isSaving}
                                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg font-medium text-sm"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    onClick={handleSaveCustomer}
                                    disabled={isSaving}
                                    className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 disabled:opacity-50"
                                >
                                    <Save size={16} /> บันทึก
                                </button>
                            </div>
                        )}
                    </div>

                    {!isEditing ? (
                        <>
                            <div className="flex items-start gap-4">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {customer.pictureUrl ? (
                                        <img src={customer.pictureUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <Users size={28} className="text-gray-400" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-gray-900">{customer.name}</h3>
                                    {customer.displayName && (
                                        <p className="text-sm text-gray-500">LINE: {customer.displayName}</p>
                                    )}
                                    {customer.lineId && (
                                        <p className="text-xs text-gray-400 font-mono mt-0.5">ID: {customer.lineId}</p>
                                    )}
                                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                                        <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 hover:text-blue-600">
                                            <Phone size={14} className="text-gray-400" />
                                            {customer.phone}
                                        </a>
                                    </div>
                                </div>
                            </div>


                        </>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
                                    <input
                                        type="text"
                                        value={editFormData.name || ''}
                                        onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-black outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                                    <input
                                        type="tel"
                                        value={editFormData.phone || ''}
                                        onChange={e => setEditFormData({ ...editFormData, phone: e.target.value })}
                                        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-black outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่</label>
                                <textarea
                                    rows={3}
                                    value={editFormData.address || ''}
                                    onChange={e => setEditFormData({ ...editFormData, address: e.target.value })}
                                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-black outline-none transition-all resize-none"
                                />
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    ข้อมูล LINE (สำหรับเชื่อมต่อ)
                                </h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
                                            <input
                                                type="text"
                                                value={editFormData.displayName || ''}
                                                onChange={e => setEditFormData({ ...editFormData, displayName: e.target.value })}
                                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-black outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">User ID</label>
                                            <input
                                                type="text"
                                                value={editFormData.lineId || ''}
                                                onChange={e => setEditFormData({ ...editFormData, lineId: e.target.value })}
                                                className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-black outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Profile Picture URL</label>
                                        <input
                                            type="text"
                                            value={editFormData.pictureUrl || ''}
                                            onChange={e => setEditFormData({ ...editFormData, pictureUrl: e.target.value })}
                                            className="w-full border rounded-lg px-3 py-2 text-xs text-gray-600 focus:ring-2 focus:ring-black outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100 bg-gray-50">
                    <div className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
                            <ShoppingBag size={12} />
                            ออเดอร์
                        </div>
                        <p className="font-bold text-lg text-gray-900">{customer.totalOrders || 0}</p>
                    </div>
                    <div className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
                            <TrendingUp size={12} />
                            ยอดซื้อรวม
                        </div>
                        <p className="font-bold text-lg text-gray-900">฿{(customer.totalSpent || 0).toLocaleString()}</p>
                    </div>
                    <div className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
                            <Calendar size={12} />
                            สั่งซื้อล่าสุด
                        </div>
                        <p className="font-bold text-sm text-gray-900">
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
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <h3 className="font-semibold text-sm text-gray-900 mb-3">สมุดที่อยู่</h3>
                    <div className="space-y-2">
                        {customer.addressHistory.map((addr, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-3 text-sm group transition-all">
                                {editingAddressIndex === idx ? (
                                    <div className="space-y-3 bg-white p-3 rounded border border-blue-100 shadow-sm">
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                type="text"
                                                value={addressFormData?.name || ''}
                                                onChange={e => setAddressFormData({ ...addressFormData, name: e.target.value })}
                                                className="border rounded px-2 py-1.5 text-sm bg-gray-50 w-full outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="ชื่อ"
                                            />
                                            <input
                                                type="text"
                                                value={addressFormData?.phone || ''}
                                                onChange={e => setAddressFormData({ ...addressFormData, phone: e.target.value })}
                                                className="border rounded px-2 py-1.5 text-sm bg-gray-50 w-full outline-none focus:ring-1 focus:ring-blue-500"
                                                placeholder="เบอร์โทร"
                                            />
                                        </div>
                                        <textarea
                                            value={addressFormData?.address || ''}
                                            onChange={e => setAddressFormData({ ...addressFormData, address: e.target.value })}
                                            className="w-full border rounded px-2 py-1.5 text-sm bg-gray-50 resize-none outline-none focus:ring-1 focus:ring-blue-500"
                                            rows={2}
                                            placeholder="ที่อยู่"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setEditingAddressIndex(null)} className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1 font-medium">ยกเลิก</button>
                                            <button onClick={() => handleSaveAddress(idx)} className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-gray-800">บันทึก</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-medium text-gray-900">{addr.name} • {addr.phone}</p>
                                            <p className="text-gray-500 text-xs mt-1 text-gray-600">{addr.address}</p>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleStartEditAddress(idx, addr)}
                                                className="text-gray-400 hover:text-gray-600 p-1.5 bg-white rounded border border-gray-200 shadow-sm"
                                                title="แก้ไข"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteAddress(addr)}
                                                className="text-gray-400 hover:text-red-500 p-1.5 bg-white rounded border border-gray-200 shadow-sm"
                                                title="ลบ"
                                            >
                                                <Trash2 size={12} />
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
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900">ประวัติการสั่งซื้อ ({orders.length})</h3>
                </div>

                {ordersLoading ? (
                    <div className="p-8 text-center text-gray-500">กำลังโหลด...</div>
                ) : orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <ShoppingBag size={32} className="mx-auto mb-2 text-gray-300" />
                        <p>ยังไม่มีประวัติการสั่งซื้อ</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {orders.map((order) => {
                            const status = statusConfig[order.status] || statusConfig['pending'];
                            return (
                                <div
                                    key={order.id}
                                    onClick={() => setSelectedOrder(order)}
                                    className="block p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-gray-400">{formatOrderId(order, 8)}</span>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                                                    {status.icon}
                                                    {status.label}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-gray-900 truncate">
                                                {order.items[0]?.productName}
                                                {order.items.length > 1 && ` +${order.items.length - 1} รายการ`}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {format(order.createdAt as Date, 'd MMM yyyy, HH:mm', { locale: th })}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-bold text-gray-900">฿{order.totalAmount.toLocaleString()}</p>
                                            <p className="text-xs text-gray-400">
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
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-xl max-h-[90vh] rounded-xl overflow-hidden flex flex-col shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                            <div>
                                <span className="font-semibold text-sm text-gray-900">คำสั่งซื้อ {formatOrderId(selectedOrder, 8)}</span>
                                <p className="text-xs text-gray-500">{format(selectedOrder.createdAt as Date, 'd MMMM yyyy HH:mm', { locale: th })}</p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="p-1 hover:bg-gray-200 rounded transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {/* Status */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-500">สถานะ</span>
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${statusConfig[selectedOrder.status].bg} ${statusConfig[selectedOrder.status].color}`}>
                                    {statusConfig[selectedOrder.status].icon}
                                    {statusConfig[selectedOrder.status].label}
                                </span>
                            </div>

                            {/* Customer Info */}
                            <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                    <User size={16} className="text-gray-500" />
                                    <span className="font-semibold text-sm text-gray-900">ข้อมูลลูกค้า</span>
                                </div>
                                <div className="p-4 grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">ชื่อ</p>
                                        <p className="font-medium text-sm text-gray-900">{selectedOrder.customerName}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 mb-1">เบอร์โทร</p>
                                        <p className="font-medium text-sm text-gray-900">{selectedOrder.customerPhone}</p>
                                    </div>
                                </div>
                            </section>

                            {/* Shipping Address */}
                            <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                    <MapPin size={16} className="text-gray-500" />
                                    <span className="font-semibold text-sm text-gray-900">ที่อยู่จัดส่ง</span>
                                </div>
                                <div className="p-4">
                                    <p className="text-sm text-gray-700">{selectedOrder.shippingAddress || "ไม่ระบุ (รับเอง)"}</p>
                                </div>
                            </section>

                            {/* Items */}
                            <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                    <Package size={16} className="text-gray-500" />
                                    <span className="font-semibold text-sm text-gray-900">รายการสินค้า</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {selectedOrder.items.map((item, idx) => (
                                        <div key={idx} className="px-4 py-3 flex justify-between items-center">
                                            <div>
                                                <p className="font-medium text-sm text-gray-900">{item.productName}</p>
                                                <p className="text-xs text-gray-400">฿{item.price.toLocaleString()} × {item.quantity}</p>
                                            </div>
                                            <p className="font-bold text-sm text-gray-900">฿{(item.price * item.quantity).toLocaleString()}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                                    <span className="font-semibold text-sm text-gray-700">รวมทั้งสิ้น</span>
                                    <span className="font-bold text-lg text-gray-900">฿{selectedOrder.totalAmount.toLocaleString()}</span>
                                </div>
                            </section>
                        </div>

                        {/* Modal Footer - Actions */}
                        <div className="p-4 border-t border-gray-100 space-y-2">
                            <p className="text-xs font-semibold text-gray-500 mb-2">เปลี่ยนสถานะ</p>
                            <div className="flex flex-wrap gap-2">
                                {selectedOrder.status === 'pending' && (
                                    <button
                                        onClick={() => handleStatusChange(selectedOrder.id, 'paid')}
                                        className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 flex items-center justify-center gap-2"
                                    >
                                        <CreditCard size={16} /> ยืนยันชำระเงิน
                                    </button>
                                )}
                                {selectedOrder.status === 'paid' && (
                                    <button
                                        onClick={() => handleStatusChange(selectedOrder.id, 'shipped')}
                                        className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-semibold text-sm hover:bg-purple-700 flex items-center justify-center gap-2"
                                    >
                                        <Truck size={16} /> จัดส่งแล้ว
                                    </button>
                                )}
                                {selectedOrder.status === 'shipped' && (
                                    <>
                                        <button
                                            onClick={() => handleStatusChange(selectedOrder.id, 'completed')}
                                            className="flex-1 py-2 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 flex items-center justify-center gap-2"
                                        >
                                            <CheckCircle size={16} /> สำเร็จ
                                        </button>
                                        <button
                                            onClick={() => handleStatusChange(selectedOrder.id, 'returned')}
                                            className="flex-1 py-2 bg-orange-600 text-white rounded-lg font-semibold text-sm hover:bg-orange-700 flex items-center justify-center gap-2"
                                        >
                                            <RotateCcw size={16} /> คืนสินค้า
                                        </button>
                                    </>
                                )}
                                {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'completed' && selectedOrder.status !== 'returned' && (
                                    <button
                                        onClick={() => handleStatusChange(selectedOrder.id, 'cancelled')}
                                        className="py-2 px-4 border border-red-200 text-red-600 rounded-lg font-semibold text-sm hover:bg-red-50"
                                    >
                                        ยกเลิก
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
