"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, getDocs, limit, startAfter, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import useLiffAuth from "@/hooks/useLiffAuth";
import { Package, Clock, CheckCircle, Truck, XCircle, ChevronRight, ShoppingBag, Loader2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { SelectedProductAddOn } from "@/types/product";
import { formatOrderId } from "@/lib/orderId";

interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    imageUrl: string;
    variantInfo?: string | null;
    addOns?: SelectedProductAddOn[];
}

interface Order {
    id: string;
    orderNo?: string;
    status: 'pending' | 'paid' | 'processing' | 'shipped' | 'completed' | 'cancelled' | 'returned';
    totalAmount: number;
    items: OrderItem[];
    createdAt: Date;
    paymentMethod: string;
    trackingNumber?: string;
}

const ITEMS_PER_PAGE = 10;
const QUERY_LIMIT = ITEMS_PER_PAGE + 1;

export default function MyOrdersPage() {
    const { userProfile: authProfile, loading: authLoading } = useAuth();
    const { userProfile: liffProfile } = useLiffAuth();
    const userProfile = authProfile || liffProfile;
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

    useEffect(() => {
        if (authLoading) return;
        if (!userProfile) {
            setOrders([]);
            setHasMore(false);
            setLastDoc(null);
            setLoading(true);
            return;
        }

        const customerId = userProfile.lineId || userProfile.uid || userProfile.id;
        let cancelled = false;

        const fetchOrders = async () => {
            setLoading(true);
            try {
                const initialQuery = query(
                    collection(db, "orders"),
                    where("customerId", "==", customerId),
                    orderBy("createdAt", "desc"),
                    limit(QUERY_LIMIT)
                );

                const snapshot = await getDocs(initialQuery);
                if (cancelled) return;

                const visibleDocs = snapshot.docs.slice(0, ITEMS_PER_PAGE);
                const items = visibleDocs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date()
                })) as Order[];

                setOrders(items);
                setLastDoc(visibleDocs.length > 0 ? visibleDocs[visibleDocs.length - 1] : null);
                setHasMore(snapshot.docs.length > ITEMS_PER_PAGE);
            } catch (error) {
                console.error("Error fetching orders:", error);
                if (!cancelled) {
                    setOrders([]);
                    setHasMore(false);
                    setLastDoc(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchOrders();

        return () => {
            cancelled = true;
        };
    }, [userProfile, authLoading]);

    const handleLoadMore = async () => {
        if (!userProfile || !lastDoc || loadingMore) return;

        const customerId = userProfile.lineId || userProfile.uid || userProfile.id;
        if (!customerId) return;

        setLoadingMore(true);
        try {
            const nextQuery = query(
                collection(db, "orders"),
                where("customerId", "==", customerId),
                orderBy("createdAt", "desc"),
                startAfter(lastDoc),
                limit(QUERY_LIMIT)
            );

            const snapshot = await getDocs(nextQuery);
            const visibleDocs = snapshot.docs.slice(0, ITEMS_PER_PAGE);
            const nextItems = visibleDocs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date()
            })) as Order[];

            setOrders((prev) => [...prev, ...nextItems]);
            setLastDoc(visibleDocs.length > 0 ? visibleDocs[visibleDocs.length - 1] : null);
            setHasMore(snapshot.docs.length > ITEMS_PER_PAGE);
        } catch (error) {
            console.error("Error loading more orders:", error);
        } finally {
            setLoadingMore(false);
        }
    };

    const getStatusInfo = (status: Order['status']) => {
        switch (status) {
            case 'pending': return { label: 'รอยืนยัน', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', icon: <Clock size={14} /> };
            case 'paid': return { label: 'ชำระแล้ว', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', icon: <CheckCircle size={14} /> };
            case 'processing': return { label: 'กำลังจัดเตรียม', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', icon: <Package size={14} /> };
            case 'shipped': return { label: 'จัดส่งแล้ว', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', icon: <Truck size={14} /> };
            case 'completed': return { label: 'สำเร็จ', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100', icon: <CheckCircle size={14} /> };
            case 'cancelled': return { label: 'ยกเลิก', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', icon: <XCircle size={14} /> };
            case 'returned': return { label: 'คืนสินค้า', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', icon: <Package size={14} /> };
            default: return { label: status, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-100', icon: <Package size={14} /> };
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">

            <main className="flex-1 p-4 space-y-3 overflow-y-auto">
                {loading || !userProfile ? (
                    <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-white h-28 rounded-xl animate-pulse"></div>
                        ))}
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <ShoppingBag size={28} className="text-gray-300" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 mb-2">ยังไม่มีคำสั่งซื้อ</h2>
                        <p className="text-sm text-gray-500 text-center mb-6">คุณยังไม่ได้สั่งซื้อสินค้าใดๆ</p>
                        <Link
                            href="/"
                            className="bg-gray-900 text-white px-6 py-2.5 rounded-full font-medium text-sm hover:bg-gray-800 transition-colors"
                        >
                            เลือกซื้อสินค้า
                        </Link>
                    </div>
                ) : (
                    <>
                        {orders.map((order) => {
                            const status = getStatusInfo(order.status);
                            const firstItem = order.items[0];
                            const firstItemAddOns = firstItem?.addOns || [];
                            return (
                                <div key={order.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                    <Link href={`/myorder/${order.id}`} className="block">
                                        {/* Header */}
                                        <div className="px-4 py-3 flex justify-between items-center border-b border-gray-50">
                                            <div>
                                                <span className="text-xs font-medium text-gray-400">{formatOrderId(order, 8)}</span>
                                                <span className="mx-2 text-gray-200">•</span>
                                                <span className="text-xs text-gray-500">{format(order.createdAt, 'd MMM yyyy', { locale: th })}</span>
                                            </div>
                                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${status.bg} ${status.color} border ${status.border}`}>
                                                {status.icon}
                                                {status.label}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-4 flex gap-3">
                                            <div className="w-14 h-14 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 flex-shrink-0">
                                                {order.items[0]?.imageUrl ? (
                                                    <img src={order.items[0].imageUrl} alt="" className="w-full h-full object-contain p-1" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <Package size={20} className="text-gray-200" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-sm text-gray-900 truncate">{firstItem?.productName}</h3>
                                                <p className="text-xs text-gray-400 mt-0.5">
                                                    {order.items.length > 1
                                                        ? `+${order.items.length - 1} รายการ • รวม ${order.items.reduce((acc, item) => acc + item.quantity, 0)} ชิ้น`
                                                        : `จำนวน ${firstItem?.quantity} ชิ้น`
                                                    }
                                                </p>
                                                {(firstItem?.variantInfo || firstItemAddOns.length > 0) && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {firstItem.variantInfo && (
                                                            <span className="max-w-full truncate rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                                                {firstItem.variantInfo}
                                                            </span>
                                                        )}
                                                        {firstItemAddOns.slice(0, 2).map((addOn) => (
                                                            <span key={addOn.id} className="max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                                                {addOn.name}{addOn.value ? `: ${addOn.value}` : ""}{addOn.price > 0 ? ` +฿${addOn.price.toLocaleString()}` : ""}
                                                            </span>
                                                        ))}
                                                        {firstItemAddOns.length > 2 && (
                                                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                                                +{firstItemAddOns.length - 2} เพิ่มเติม
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="mt-1.5 font-bold text-sm text-gray-900">฿{order.totalAmount.toLocaleString()}</div>
                                            </div>
                                            <div className="flex items-center text-gray-300">
                                                <ChevronRight size={18} />
                                            </div>
                                        </div>

                                        {/* Tracking */}
                                        {order.trackingNumber && (
                                            <div className="mx-4 mb-3 p-2.5 bg-gray-50 rounded-lg flex items-center justify-between text-xs border border-gray-100">
                                                <span className="text-gray-500">พัสดุ: <span className="text-gray-900 font-mono font-bold">{order.trackingNumber}</span></span>
                                            </div>
                                        )}
                                    </Link>
                                </div>
                            );
                        })}

                        {hasMore && (
                            <button
                                type="button"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loadingMore && <Loader2 size={16} className="animate-spin" />}
                                {loadingMore ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
                            </button>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}




