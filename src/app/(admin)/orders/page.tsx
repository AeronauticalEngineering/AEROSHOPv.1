"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, increment, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, OrderItemStatus, OrderStatus } from "@/types/order";
import { PickupOption, StoreSettings } from "@/types/store";
import { formatOrderId } from "@/lib/orderId";
import { Search, Eye, Truck, CheckCircle, XCircle, Clock, Package, Trash2, X, ChevronLeft, ChevronRight, ShoppingBag, Loader2, User, MapPin, CreditCard, RotateCcw, CircleAlert, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { th } from "date-fns/locale";

const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    pending: { label: "รอชำระ", color: "text-amber-700", bg: "bg-amber-50", icon: <Clock size={12} /> },
    paid: { label: "ชำระแล้ว", color: "text-blue-700", bg: "bg-blue-50", icon: <CreditCard size={12} /> },
    shipped: { label: "จัดส่งแล้ว", color: "text-purple-700", bg: "bg-purple-50", icon: <Truck size={12} /> },
    completed: { label: "สำเร็จ", color: "text-green-700", bg: "bg-green-50", icon: <CheckCircle size={12} /> },
    cancelled: { label: "ยกเลิก", color: "text-red-700", bg: "bg-red-50", icon: <XCircle size={12} /> },
    returned: { label: "คืนสินค้า", color: "text-orange-700", bg: "bg-orange-50", icon: <RotateCcw size={12} /> },
};

const itemStatusConfig: Record<OrderItemStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    processing: { label: "ดำเนินการ", color: "text-blue-700", bg: "bg-blue-50", icon: <Clock size={12} /> },
    ready: { label: "พร้อมรับ", color: "text-emerald-700", bg: "bg-emerald-50", icon: <Package size={12} /> },
    received: { label: "รับแล้ว", color: "text-green-700", bg: "bg-green-50", icon: <CheckCircle size={12} /> },
    shipped: { label: "จัดส่ง", color: "text-purple-700", bg: "bg-purple-50", icon: <Truck size={12} /> },
    completed: { label: "สำเร็จ", color: "text-green-700", bg: "bg-green-50", icon: <CheckCircle size={12} /> },
    cancelled: { label: "ยกเลิก", color: "text-red-700", bg: "bg-red-50", icon: <XCircle size={12} /> },
    returned: { label: "คืนสินค้า", color: "text-orange-700", bg: "bg-orange-50", icon: <RotateCcw size={12} /> },
};

const selectableItemStatuses: OrderItemStatus[] = [
    "processing",
    "ready",
    "received",
    "shipped",
    "completed",
    "cancelled",
    "returned"
];
const isSelectableItemStatus = (status?: OrderItemStatus) =>
    !!status && selectableItemStatuses.includes(status);

const defaultPickupOptions: PickupOption[] = [
    { id: "appointment", label: "รอนัดหมายวัน-เวลา", detail: "", isActive: true, sortOrder: 0 },
    { id: "locker-01", label: "locker ช่อง 01 รหัส 1234", detail: "", isActive: true, sortOrder: 1 },
    { id: "locker-02", label: "locker ช่อง 02 รหัส 5678", detail: "", isActive: true, sortOrder: 2 },
    { id: "locker-03", label: "locker ช่อง 03 รหัส 4321", detail: "", isActive: true, sortOrder: 3 },
];

const getActivePickupOptions = (settings: StoreSettings | null): PickupOption[] => (
    (settings?.pickupOptions?.length ? settings.pickupOptions : defaultPickupOptions)
        .filter(option => option.isActive !== false && option.label.trim())
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
);

const applyPickupOption = <T extends { pickupOptionId?: string | null; pickupLabel?: string | null; pickupDetail?: string | null }>(
    item: T,
    status: OrderItemStatus,
    pickupOptions: PickupOption[]
): T => {
    if (status !== "ready") {
        return { ...item, pickupOptionId: null, pickupLabel: null, pickupDetail: null };
    }

    const selectedOption = pickupOptions.find(option => option.id === item.pickupOptionId) || pickupOptions[0];
    if (!selectedOption) return item;

    return {
        ...item,
        pickupOptionId: selectedOption.id,
        pickupLabel: selectedOption.label,
        pickupDetail: selectedOption.detail || null
    };
};

type RefundSummaryItem = {
    name: string;
    detail?: string;
    item: { finalPrice?: number; price: number; quantity: number };
    status: RefundStatus;
    amount: number;
    unitPrice: number;
    quantity: number;
};

type RefundStatus = Extract<OrderItemStatus, "cancelled" | "returned">;

const getOrderItemAmount = (item: Order["items"][number]) => {
    return (item.finalPrice ?? item.price) * item.quantity;
};

const getBundleItemAmount = (item: Order["items"][number], bundleItem: NonNullable<Order["items"][number]["bundleItems"]>[number]) => {
    return (bundleItem.unitPrice || 0) * bundleItem.quantity * item.quantity;
};

const getRefundSummary = (order: Order): RefundSummaryItem[] => {
    return order.items.flatMap<RefundSummaryItem>((item) => {
        const fallbackStatus = order.status === "cancelled" || order.status === "returned" ? order.status : undefined;
        const refundStatus: RefundStatus | undefined =
            item.status === "cancelled" || item.status === "returned" ? item.status : fallbackStatus;

        if (refundStatus) {
            const unitPrice = item.finalPrice ?? item.price;
            return [{
                name: item.productName,
                detail: item.variantInfo || "",
                item,
                status: refundStatus,
                amount: getOrderItemAmount(item),
                unitPrice,
                quantity: item.quantity
            }];
        }

        const bundleRefunds = (item.bundleItems || []).flatMap((bundleItem) => {
            const bundleStatus: RefundStatus | undefined =
                bundleItem.status === "cancelled" || bundleItem.status === "returned" ? bundleItem.status : undefined;
            if (!bundleStatus) return [];

            return [{
                name: bundleItem.productName,
                detail: [item.productName, bundleItem.variantName].filter(Boolean).join(" / "),
                item: {
                    finalPrice: bundleItem.unitPrice || 0,
                    price: bundleItem.unitPrice || 0,
                    quantity: bundleItem.quantity * item.quantity
                },
                status: bundleStatus,
                amount: getBundleItemAmount(item, bundleItem),
                unitPrice: bundleItem.unitPrice || 0,
                quantity: bundleItem.quantity * item.quantity
            }];
        });

        return bundleRefunds;
    });
};

const getCustomerIssueCount = (order: Order) => {
    return order.items.filter(item => item.issueReportedByCustomer && item.issueReason).length;
};

const getOrderLineName = (order: Order) => order.lineDisplayName || order.linename || "";

import { useRouter } from "next/navigation";

export default function AdminOrdersPage() {
    const router = useRouter();
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [statusDraft, setStatusDraft] = useState<OrderStatus | null>(null);
    const [paymentDetailDraft, setPaymentDetailDraft] = useState("");
    const [shippingDetailDraft, setShippingDetailDraft] = useState("");
    const [trackingNumberDraft, setTrackingNumberDraft] = useState("");
    const [completionDetailDraft, setCompletionDetailDraft] = useState("");
    const [cancelReasonDraft, setCancelReasonDraft] = useState("");
    const [returnReasonDraft, setReturnReasonDraft] = useState("");
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
    const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
    const [updatingItemKey, setUpdatingItemKey] = useState<string | null>(null);
    const [expandedBundleKeys, setExpandedBundleKeys] = useState<Set<string>>(new Set());
    const [issueReplyTarget, setIssueReplyTarget] = useState<{ order: Order; itemIndex: number } | null>(null);
    const [issueReplyDraft, setIssueReplyDraft] = useState("");
    const [issueReplyError, setIssueReplyError] = useState("");
    const [savingIssueReply, setSavingIssueReply] = useState(false);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

    const handleCloseModal = () => {
        setSelectedOrder(null);
    };

    useEffect(() => {
        const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() || new Date(),
            })) as Order[];
            setOrders(items);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, "settings", "store"), (snapshot) => {
            setStoreSettings(snapshot.exists() ? snapshot.data() as StoreSettings : null);
        });

        return () => unsubscribe();
    }, []);

    const pickupOptions = useMemo(() => getActivePickupOptions(storeSettings), [storeSettings]);

    const handleStatusChange = async (
        orderId: string,
        newStatus: OrderStatus,
        details?: {
            paymentDetail?: string;
            shippingDetail?: string;
            trackingNumber?: string;
            completionDetail?: string;
            cancelReason?: string;
            returnReason?: string;
        }
    ) => {
        if (updatingOrderId === orderId) return;
        try {
            setUpdatingOrderId(orderId);
            console.log("order_status_update:start", {
                orderId,
                newStatus,
                at: new Date().toISOString(),
            });
            const res = await fetch("/api/orders/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId,
                    status: newStatus,
                    paymentDetail: details?.paymentDetail || null,
                    shippingDetail: details?.shippingDetail || null,
                    trackingNumber: details?.trackingNumber || null,
                    completionDetail: details?.completionDetail || null,
                    cancelReason: details?.cancelReason || null,
                    returnReason: details?.returnReason || null
                })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Update failed");
            }
            if (selectedOrder && selectedOrder.id === orderId) {
                setSelectedOrder(prev => prev ? {
                    ...prev,
                    status: newStatus,
                    paymentDetail: details?.paymentDetail ?? prev.paymentDetail,
                    shippingDetail: details?.shippingDetail ?? prev.shippingDetail,
                    trackingNumber: details?.trackingNumber ?? prev.trackingNumber,
                    completionDetail: details?.completionDetail ?? prev.completionDetail,
                    cancelReason: details?.cancelReason ?? prev.cancelReason,
                    returnReason: details?.returnReason ?? prev.returnReason
                } : null);
            }
            console.log("order_status_update:success", {
                orderId,
                newStatus,
                at: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Error updating status:", error);
            console.log("order_status_update:failed", {
                orderId,
                newStatus,
                at: new Date().toISOString(),
                error,
            });
            alert("เกิดข้อผิดพลาด");
        } finally {
            setUpdatingOrderId(null);
        }
    };

    const openStatusModal = (status: OrderStatus) => {
        if (!selectedOrder) return;
        setStatusDraft(status);
        setPaymentDetailDraft(selectedOrder.paymentDetail || "");
        setShippingDetailDraft(selectedOrder.shippingDetail || "");
        setTrackingNumberDraft(selectedOrder.trackingNumber || "");
        setCompletionDetailDraft(selectedOrder.completionDetail || "");
        setCancelReasonDraft(selectedOrder.cancelReason || "");
        setReturnReasonDraft(selectedOrder.returnReason || "");
        setIsStatusModalOpen(true);
    };

    const closeStatusModal = () => {
        if (updatingOrderId) return;
        setIsStatusModalOpen(false);
        setStatusDraft(null);
        setPaymentDetailDraft("");
        setShippingDetailDraft("");
        setTrackingNumberDraft("");
        setCompletionDetailDraft("");
        setCancelReasonDraft("");
        setReturnReasonDraft("");
    };

    const closeCancelConfirm = () => {
        if (updatingOrderId) return;
        setIsCancelConfirmOpen(false);
        setCancelTarget(null);
    };

    const confirmCancelOrder = async () => {
        if (!cancelTarget) return;
        await handleStatusChange(cancelTarget.id, "cancelled", {
            cancelReason: "ยกเลิกโดยผู้ดูแล"
        });
        closeCancelConfirm();
    };

    const confirmStatusUpdate = async () => {
        if (!selectedOrder || !statusDraft) return;
        await handleStatusChange(selectedOrder.id, statusDraft, {
            paymentDetail: paymentDetailDraft.trim(),
            shippingDetail: shippingDetailDraft.trim(),
            trackingNumber: trackingNumberDraft.trim(),
            completionDetail: completionDetailDraft.trim(),
            cancelReason: cancelReasonDraft.trim(),
            returnReason: returnReasonDraft.trim()
        });
        closeStatusModal();
    };

    const getBundleKey = (orderId: string, itemIndex: number) => `${orderId}-${itemIndex}`;

    const toggleBundleExpanded = (orderId: string, itemIndex: number) => {
        const key = getBundleKey(orderId, itemIndex);
        setExpandedBundleKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const handleItemStatusChange = async (order: Order, itemIndex: number, status: OrderItemStatus) => {
        const itemKey = `${order.id}-${itemIndex}`;
        if (updatingItemKey) return;

        const nextItems = order.items.map((item, index) => (
            index === itemIndex
                ? applyPickupOption({
                    ...item,
                    status,
                    bundleItems: item.bundleItems?.map(bundleItem => applyPickupOption({
                        ...bundleItem,
                        status
                    }, status, pickupOptions))
                }, status, pickupOptions)
                : item
        ));

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: nextItems,
                updatedAt: serverTimestamp()
            });

            setSelectedOrder(prev => prev && prev.id === order.id ? {
                ...prev,
                items: nextItems
            } : prev);
        } catch (error) {
            console.error("Error updating item status:", error);
            alert("เกิดข้อผิดพลาดในการอัปเดตสถานะสินค้า");
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const handleBundleItemStatusChange = async (
        order: Order,
        itemIndex: number,
        bundleItemIndex: number,
        status: OrderItemStatus
    ) => {
        const itemKey = `${order.id}-${itemIndex}-${bundleItemIndex}`;
        if (updatingItemKey) return;

        const nextItems = order.items.map((item, index) => {
            if (index !== itemIndex) return item;
            return {
                ...item,
                bundleItems: item.bundleItems?.map((bundleItem, bundleIndex) => (
                    bundleIndex === bundleItemIndex ? applyPickupOption({ ...bundleItem, status }, status, pickupOptions) : bundleItem
                ))
            };
        });

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: nextItems,
                updatedAt: serverTimestamp()
            });

            setSelectedOrder(prev => prev && prev.id === order.id ? {
                ...prev,
                items: nextItems
            } : prev);
        } catch (error) {
            console.error("Error updating bundle item status:", error);
            alert("เกิดข้อผิดพลาดในการอัปเดตสถานะสินค้าในเซต");
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const handleItemPickupChange = async (order: Order, itemIndex: number, pickupOptionId: string) => {
        const pickupOption = pickupOptions.find(option => option.id === pickupOptionId);
        if (!pickupOption || updatingItemKey) return;
        const itemKey = `${order.id}-${itemIndex}-pickup`;

        const nextItems = order.items.map((item, index) => (
            index === itemIndex
                ? {
                    ...item,
                    status: "ready" as OrderItemStatus,
                    pickupOptionId: pickupOption.id,
                    pickupLabel: pickupOption.label,
                    pickupDetail: pickupOption.detail || null,
                    bundleItems: item.bundleItems?.map(bundleItem => ({
                        ...bundleItem,
                        status: "ready" as OrderItemStatus,
                        pickupOptionId: pickupOption.id,
                        pickupLabel: pickupOption.label,
                        pickupDetail: pickupOption.detail || null
                    }))
                }
                : item
        ));

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: nextItems,
                updatedAt: serverTimestamp()
            });
            setSelectedOrder(prev => prev && prev.id === order.id ? { ...prev, items: nextItems } : prev);
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const handleBundleItemPickupChange = async (
        order: Order,
        itemIndex: number,
        bundleItemIndex: number,
        pickupOptionId: string
    ) => {
        const pickupOption = pickupOptions.find(option => option.id === pickupOptionId);
        if (!pickupOption || updatingItemKey) return;
        const itemKey = `${order.id}-${itemIndex}-${bundleItemIndex}-pickup`;

        const nextItems = order.items.map((item, index) => {
            if (index !== itemIndex) return item;
            return {
                ...item,
                bundleItems: item.bundleItems?.map((bundleItem, bundleIndex) => (
                    bundleIndex === bundleItemIndex
                        ? {
                            ...bundleItem,
                            status: "ready" as OrderItemStatus,
                            pickupOptionId: pickupOption.id,
                            pickupLabel: pickupOption.label,
                            pickupDetail: pickupOption.detail || null
                        }
                        : bundleItem
                ))
            };
        });

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: nextItems,
                updatedAt: serverTimestamp()
            });
            setSelectedOrder(prev => prev && prev.id === order.id ? { ...prev, items: nextItems } : prev);
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const openIssueReply = (order: Order, itemIndex: number) => {
        const item = order.items[itemIndex];
        if (!item?.issueReason) return;
        setIssueReplyTarget({ order, itemIndex });
        setIssueReplyDraft(item.issueAdminReply || "");
        setIssueReplyError("");
    };

    const closeIssueReply = () => {
        if (savingIssueReply) return;
        setIssueReplyTarget(null);
        setIssueReplyDraft("");
        setIssueReplyError("");
    };

    const handleSaveIssueReply = async () => {
        if (!issueReplyTarget) return;
        const reply = issueReplyDraft.trim();
        if (reply.length < 2) {
            setIssueReplyError("กรุณาระบุคำตอบกลับอย่างน้อย 2 ตัวอักษร");
            return;
        }

        const { order, itemIndex } = issueReplyTarget;
        const repliedAt = new Date().toISOString();
        const nextItems = order.items.map((item, index) => (
            index === itemIndex
                ? {
                    ...item,
                    issueAdminReply: reply,
                    issueAdminRepliedAt: repliedAt
                }
                : item
        ));

        try {
            setSavingIssueReply(true);
            await updateDoc(doc(db, "orders", order.id), {
                items: nextItems,
                updatedAt: serverTimestamp()
            });

            setOrders(prev => prev.map(item => (
                item.id === order.id ? { ...item, items: nextItems } : item
            )));
            setSelectedOrder(prev => prev && prev.id === order.id ? {
                ...prev,
                items: nextItems
            } : prev);
            setIssueReplyTarget(null);
            setIssueReplyDraft("");
            setIssueReplyError("");
        } catch (error) {
            console.error("Error saving issue reply:", error);
            setIssueReplyError("บันทึกคำตอบกลับไม่สำเร็จ");
        } finally {
            setSavingIssueReply(false);
        }
    };

    const openDeleteConfirm = (order: Order) => {
        if (updatingOrderId || deletingOrderId) return;
        setDeleteTarget(order);
        setIsDeleteConfirmOpen(true);
    };

    const closeDeleteConfirm = () => {
        if (deletingOrderId) return;
        setIsDeleteConfirmOpen(false);
        setDeleteTarget(null);
    };

    const handleDeleteOrder = async (order: Order) => {
        try {
            setDeletingOrderId(order.id);
            await deleteDoc(doc(db, "orders", order.id));

            // Update Customer Stats
            if (order.customerId) {
                const customerRef = doc(db, "customers", order.customerId);
                await updateDoc(customerRef, {
                    totalOrders: increment(-1),
                    totalSpent: increment(-order.totalAmount)
                });
            }

            setSelectedOrder(null);
        } catch (error) {
            console.error("Error deleting order:", error);
            alert("เกิดข้อผิดพลาดในการลบ");
        } finally {
            setDeletingOrderId(null);
        }
    };

    const confirmDeleteOrder = async () => {
        if (!deleteTarget) return;
        await handleDeleteOrder(deleteTarget);
        closeDeleteConfirm();
    };

    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            const matchSearch =
                order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                order.customerPhone.includes(searchTerm);
            const matchStatus = filterStatus === 'all' || order.status === filterStatus;
            return matchSearch && matchStatus;
        });
    }, [orders, searchTerm, filterStatus]);

    const stats = useMemo(() => ({
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        paid: orders.filter(o => o.status === 'paid').length,
        shipped: orders.filter(o => o.status === 'shipped').length,
        returned: orders.filter(o => o.status === 'returned').length,
    }), [orders]);

    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
    const pageStart = filteredOrders.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const pageEnd = Math.min(currentPage * itemsPerPage, filteredOrders.length);
    const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
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

    const statusEntries = Object.entries(statusConfig) as Array<[
        OrderStatus,
        (typeof statusConfig)[OrderStatus]
    ]>;
    const itemStatusEntries = selectableItemStatuses.map((status) => [
        status,
        itemStatusConfig[status]
    ] as [OrderItemStatus, (typeof itemStatusConfig)[OrderItemStatus]]);
    const refundSummary = selectedOrder ? getRefundSummary(selectedOrder) : [];
    const refundTotal = refundSummary.reduce((sum, entry) => sum + entry.amount, 0);

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">คำสั่งซื้อ</h1>
                    <p className="text-sm text-gray-500">{stats.total} รายการ</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <ShoppingBag size={14} /> ทั้งหมด
                    </div>
                    <p className="text-lg font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-amber-600 text-xs mb-1">
                        <Clock size={14} /> รอชำระ
                    </div>
                    <p className="text-lg font-bold text-amber-600">{stats.pending}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
                        <CreditCard size={14} /> ชำระแล้ว
                    </div>
                    <p className="text-lg font-bold text-blue-600">{stats.paid}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-purple-600 text-xs mb-1">
                        <Truck size={14} /> จัดส่งแล้ว
                    </div>
                    <p className="text-lg font-bold text-purple-600">{stats.shipped}</p>
                </div>
            </div>

            {/* Filter & Search */}
            <div className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex flex-col md:flex-row gap-3 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="ค้นหาเลขสั่งซื้อ, ชื่อ, เบอร์โทร..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    <div className="flex gap-1 flex-wrap">
                        <button
                            onClick={() => { setFilterStatus('all'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            ทั้งหมด
                        </button>
                        {Object.entries(statusConfig).map(([status, config]) => (
                            <button
                                key={status}
                                onClick={() => { setFilterStatus(status as OrderStatus); setCurrentPage(1); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === status ? `${config.bg} ${config.color}` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {config.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">
                        <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                        <p className="text-sm">กำลังโหลด...</p>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <ShoppingBag size={40} className="mx-auto mb-3 text-gray-300" />
                        <p>ไม่พบคำสั่งซื้อ</p>
                    </div>
                ) : (
                    <>
                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 border-b">
                            <div className="col-span-2">เลขที่</div>
                            <div className="col-span-3">ลูกค้า</div>
                            <div className="col-span-2">วันที่</div>
                            <div className="col-span-2 text-right">ยอดรวม</div>
                            <div className="col-span-1 text-center">สถานะ</div>
                            <div className="col-span-2 text-right">จัดการ</div>
                        </div>

                        {/* Table Body */}
                        <div className="divide-y divide-gray-50">
                            {paginatedOrders.map((order) => {
                                const status = statusConfig[order.status];
                                const customerIssueCount = getCustomerIssueCount(order);
                                return (
                                    <div
                                        key={order.id}
                                        className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50 cursor-pointer transition-colors"
                                        onClick={() => router.push(`/orders/${order.id}`)}
                                    >
                                        {/* Order ID */}
                                        <div className="col-span-6 md:col-span-2">
                                            <span className="font-mono text-xs text-gray-400">{formatOrderId(order, 8)}</span>
                                        </div>

                                        {/* Customer */}
                                        <div className="hidden md:block col-span-3">
                                            <p className="font-medium text-sm text-gray-900 truncate">{order.customerName}</p>
                                            <p className="text-xs text-gray-400">{order.customerPhone}</p>
                                        </div>

                                        {/* Date */}
                                        <div className="hidden md:block col-span-2">
                                            <span className="text-sm text-gray-600">
                                                {format(order.createdAt as Date, 'd MMM yy', { locale: th })}
                                            </span>
                                        </div>

                                        {/* Amount */}
                                        <div className="col-span-3 md:col-span-2 text-right">
                                            <span className="font-bold text-sm text-gray-900">฿{order.totalAmount.toLocaleString()}</span>
                                        </div>

                                        {/* Status */}
                                        <div className="hidden md:flex col-span-1 justify-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${status.bg} ${status.color}`}>
                                                    {status.icon}
                                                    {status.label}
                                                </span>
                                                {customerIssueCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                                                        <CircleAlert size={11} />
                                                        แจ้งปัญหา {customerIssueCount}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); router.push(`/orders/${order.id}`); }}
                                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                                            >
                                                <Eye size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); openDeleteConfirm(order); }}
                                                className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        {/* Mobile Info */}
                                        <div className="col-span-12 md:hidden flex items-center gap-3 text-xs text-gray-500">
                                            <span>{order.customerName}</span>
                                            <span className={`px-2 py-0.5 rounded-full font-semibold ${status.bg} ${status.color}`}>{status.label}</span>
                                            {customerIssueCount > 0 && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-orange-700">
                                                    <CircleAlert size={11} />
                                                    แจ้งปัญหา {customerIssueCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
                            <div className="flex flex-wrap items-center gap-3 text-gray-500">
                                <span>
                                    {pageStart}-{pageEnd} จาก {filteredOrders.length}
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
                                        {[10, 15, 25, 50].map((value) => (
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
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                                                ? 'bg-gray-900 text-white'
                                                : 'text-gray-600 hover:bg-gray-100'
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                                    aria-label="Next page"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Order Detail Modal */}
            {selectedOrder && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
                    <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-4">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="font-bold text-lg text-gray-900">คำสั่งซื้อ {formatOrderId(selectedOrder, 8)}</h2>
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusConfig[selectedOrder.status].bg} ${statusConfig[selectedOrder.status].color}`}>
                                        {statusConfig[selectedOrder.status].icon}
                                        {statusConfig[selectedOrder.status].label}
                                    </span>
                                    {getCustomerIssueCount(selectedOrder) > 0 && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 text-xs font-semibold text-orange-700">
                                            <CircleAlert size={12} />
                                            ลูกค้าแจ้งปัญหา {getCustomerIssueCount(selectedOrder)}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-gray-500">
                                    สร้างเมื่อ {format(selectedOrder.createdAt as Date, 'd MMMM yyyy HH:mm', { locale: th })}
                                </p>
                            </div>
                            <button onClick={handleCloseModal} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto bg-[#F8F9FA] p-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                                <div className="space-y-4">
                                    <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                                        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                                            <User size={16} className="text-gray-500" />
                                            <span className="font-semibold text-sm text-gray-900">ข้อมูลลูกค้า</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                                            {getOrderLineName(selectedOrder) && (
                                                <div className="sm:col-span-2">
                                                    <p className="mb-1 text-xs text-gray-400">LINE Name</p>
                                                    <p className="text-sm font-semibold text-gray-900">{getOrderLineName(selectedOrder)}</p>
                                                </div>
                                            )}
                                            <div>
                                                <p className="mb-1 text-xs text-gray-400">ชื่อ</p>
                                                <p className="text-sm font-semibold text-gray-900">{selectedOrder.customerName}</p>
                                            </div>
                                            <div>
                                                <p className="mb-1 text-xs text-gray-400">เบอร์โทร</p>
                                                <p className="text-sm font-semibold text-gray-900">{selectedOrder.customerPhone}</p>
                                            </div>
                                            {selectedOrder.customerCitizenId && (
                                                <div>
                                                    <p className="mb-1 text-xs text-gray-400">เลขบัตรประชาชน</p>
                                                    <p className="font-mono text-sm font-semibold text-gray-900">{selectedOrder.customerCitizenId}</p>
                                                </div>
                                            )}
                                            <div className="sm:col-span-2">
                                                <p className="mb-1 text-xs text-gray-400">Customer ID</p>
                                                <p className="break-all font-mono text-xs text-gray-600">{selectedOrder.customerId || selectedOrder.userId || "-"}</p>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                                        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                                            <MapPin size={16} className="text-gray-500" />
                                            <span className="font-semibold text-sm text-gray-900">ที่อยู่จัดส่ง</span>
                                        </div>
                                        <div className="p-4">
                                            <p className="whitespace-pre-line text-sm leading-6 text-gray-700">
                                                {selectedOrder.shippingAddress || "ไม่ระบุ (รับเอง)"}
                                            </p>
                                            {(selectedOrder.shippingOptionName || selectedOrder.deliveryFee != null) && (
                                                <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                                    <span className="font-semibold text-gray-900">{selectedOrder.shippingOptionName || "ค่าจัดส่ง"}</span>
                                                    <span className="ml-2">{selectedOrder.deliveryFee ? `฿${selectedOrder.deliveryFee.toLocaleString()}` : "ฟรี"}</span>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <section className="rounded-xl border border-gray-100 bg-white p-4">
                                        <p className="mb-3 text-sm font-semibold text-gray-900">รายละเอียดสถานะ</p>
                                        <div className="space-y-3 text-sm">
                                            <div className="flex justify-between gap-3">
                                                <span className="text-gray-400">ชำระเงิน</span>
                                                <span className="text-right text-gray-700">{selectedOrder.paymentDetail || "-"}</span>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <span className="text-gray-400">จัดส่ง</span>
                                                <span className="text-right text-gray-700">{selectedOrder.shippingDetail || "-"}</span>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <span className="text-gray-400">เลขพัสดุ</span>
                                                <span className="text-right font-mono text-gray-700">{selectedOrder.trackingNumber || "-"}</span>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <span className="text-gray-400">เสร็จสิ้น</span>
                                                <span className="text-right text-gray-700">{selectedOrder.completionDetail || "-"}</span>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <span className="text-gray-400">เหตุผลยกเลิก</span>
                                                <span className="text-right text-gray-700">{selectedOrder.cancelReason || "-"}</span>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <span className="text-gray-400">ช่องทางคืนเงิน</span>
                                                <span className="whitespace-pre-line text-right text-gray-700">{selectedOrder.refundChannel || "-"}</span>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <span className="text-gray-400">เหตุผลคืนสินค้า</span>
                                                <span className="text-right text-gray-700">{selectedOrder.returnReason || "-"}</span>
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                <div className="space-y-4">
                                    <section className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                                        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                                            <Package size={16} className="text-gray-500" />
                                            <span className="font-semibold text-sm text-gray-900">รายการสินค้า</span>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {selectedOrder.items.map((item, idx) => {
                                                const bundleKey = getBundleKey(selectedOrder.id, idx);
                                                const hasBundleItems = Boolean(item.bundleItems?.length);
                                                const isBundleExpanded = expandedBundleKeys.has(bundleKey);
                                                const completedBundleCount = item.bundleItems?.filter(bundleItem => bundleItem.status).length || 0;

                                                return (
                                                <div key={idx} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="text-sm font-semibold text-gray-900">{item.productName}</p>
                                                            {item.bundleItems && item.bundleItems.length > 0 && (
                                                                <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                                                    เซต {item.bundleItems.length} รายการ
                                                                </span>
                                                            )}
                                                            {item.status && (
                                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${itemStatusConfig[item.status].bg} ${itemStatusConfig[item.status].color}`}>
                                                                    {itemStatusConfig[item.status].icon}
                                                                    {itemStatusConfig[item.status].label}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 text-xs text-gray-400">฿{item.price.toLocaleString()} × {item.quantity}</p>
                                                        {item.addOns && item.addOns.length > 0 && (
                                                            <div className="mt-1 space-y-0.5">
                                                                {item.addOns.map(addOn => (
                                                                    <p key={addOn.id} className="text-[11px] text-gray-500">
                                                                        {addOn.name}{addOn.value ? `: ${addOn.value}` : ""} {addOn.price > 0 ? `(+฿${addOn.price.toLocaleString()})` : ""}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {hasBundleItems && item.bundleItems && (
                                                            <div className="mt-3 overflow-hidden rounded-xl border border-blue-100 bg-blue-50/60">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleBundleExpanded(selectedOrder.id, idx)}
                                                                    className="flex w-full items-center justify-between border-b border-blue-100 px-3 py-2 text-left transition-colors hover:bg-blue-100/50"
                                                                    aria-expanded={isBundleExpanded}
                                                                >
                                                                    <div>
                                                                        <span className="block text-[11px] font-semibold text-blue-900">รายการในเซต</span>
                                                                        <span className="text-[10px] text-blue-500">
                                                                            {isBundleExpanded ? "กดเพื่อพับรายการ" : `พับอยู่ แสดง ${completedBundleCount}/${item.bundleItems.length} รายการที่มีสถานะ`}
                                                                        </span>
                                                                    </div>
                                                                    <ChevronDown className={`h-4 w-4 text-blue-500 transition-transform ${isBundleExpanded ? "rotate-180" : ""}`} />
                                                                </button>
                                                                <div className="hidden">
                                                                    <span className="text-[11px] font-semibold text-blue-900">รายการในเซต</span>
                                                                    <span className="text-[10px] text-blue-500">ตั้งสถานะรายชิ้นได้</span>
                                                                </div>
                                                                {isBundleExpanded && (
                                                                <div className="divide-y divide-blue-100">
                                                                    {item.bundleItems.map((bundleItem, bundleIndex) => (
                                                                        <div key={`${bundleItem.id}-${bundleIndex}`} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
                                                                            <div className="min-w-0">
                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                    <p className="text-xs font-semibold text-gray-900">
                                                                                        {bundleItem.productName}
                                                                                        {bundleItem.variantName ? <span className="font-normal text-gray-500"> ({bundleItem.variantName})</span> : null}
                                                                                    </p>
                                                                                    {bundleItem.status && (
                                                                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${itemStatusConfig[bundleItem.status].bg} ${itemStatusConfig[bundleItem.status].color}`}>
                                                                                            {itemStatusConfig[bundleItem.status].icon}
                                                                                            {itemStatusConfig[bundleItem.status].label}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className="mt-0.5 text-[11px] text-gray-500">
                                                                                    ฿{(bundleItem.unitPrice || 0).toLocaleString()} × {bundleItem.quantity * item.quantity}
                                                                                </p>
                                                                                {bundleItem.selectedAddOns && bundleItem.selectedAddOns.length > 0 && (
                                                                                    <div className="mt-1 space-y-0.5">
                                                                                        {bundleItem.selectedAddOns.map(addOn => (
                                                                                            <p key={addOn.id} className="text-[10px] text-gray-500">
                                                                                                {addOn.name}{addOn.value ? `: ${addOn.value}` : ""} {addOn.price > 0 ? `(+฿${addOn.price.toLocaleString()})` : ""}
                                                                                            </p>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <select
                                                                                value={isSelectableItemStatus(bundleItem.status) ? bundleItem.status : ""}
                                                                                onChange={(e) => handleBundleItemStatusChange(selectedOrder, idx, bundleIndex, e.target.value as OrderItemStatus)}
                                                                                disabled={updatingItemKey === `${selectedOrder.id}-${idx}-${bundleIndex}`}
                                                                                className="h-8 w-full rounded-lg border border-blue-100 bg-white px-2 text-[11px] font-semibold text-gray-700 outline-none transition-colors focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-32"
                                                                                aria-label={`สถานะสินค้าในเซต ${bundleItem.productName}`}
                                                                            >
                                                                                <option value="" disabled>รายชิ้น</option>
                                                                                {itemStatusEntries.map(([status, config]) => (
                                                                                    <option key={status} value={status}>
                                                                                        {config.label}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                            {bundleItem.status === "ready" && pickupOptions.length > 0 && (
                                                                                <select
                                                                                    value={bundleItem.pickupOptionId || pickupOptions[0]?.id || ""}
                                                                                    onChange={(e) => handleBundleItemPickupChange(selectedOrder, idx, bundleIndex, e.target.value)}
                                                                                    disabled={updatingItemKey === `${selectedOrder.id}-${idx}-${bundleIndex}-pickup`}
                                                                                    className="h-8 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-44"
                                                                                    aria-label={`สถานที่รับสินค้าในเซต ${bundleItem.productName}`}
                                                                                >
                                                                                    {pickupOptions.map((option) => (
                                                                                        <option key={option.id} value={option.id}>
                                                                                            {option.label}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {item.issueReason && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openIssueReply(selectedOrder, idx)}
                                                                className="mt-2 w-full rounded-lg border border-orange-100 bg-orange-50 px-2 py-1.5 text-left text-[11px] text-orange-700 transition-colors hover:border-orange-200 hover:bg-orange-100"
                                                            >
                                                                <span className="font-semibold">
                                                                    {item.issueReportedByCustomer ? "ลูกค้าแจ้งปัญหา" : "เหตุผล"}:
                                                                </span>{" "}
                                                                {item.issueReason}
                                                                {item.issueAdminReply && (
                                                                    <span className="mt-1 block border-t border-orange-100 pt-1 text-orange-800">
                                                                        <span className="font-semibold">แอดมินตอบกลับ:</span>{" "}
                                                                        {item.issueAdminReply}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                                                        <p className="text-sm font-bold text-gray-900">฿{(item.price * item.quantity).toLocaleString()}</p>
                                                        {hasBundleItems && (
                                                            <span className="text-[10px] font-semibold text-blue-600">อัปเดตทั้งเซต</span>
                                                        )}
                                                        <select
                                                            value={isSelectableItemStatus(item.status) ? item.status : ""}
                                                            onChange={(e) => handleItemStatusChange(selectedOrder, idx, e.target.value as OrderItemStatus)}
                                                            disabled={updatingItemKey === `${selectedOrder.id}-${idx}`}
                                                            className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 outline-none transition-colors focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                                                            aria-label={`สถานะสินค้า ${item.productName}`}
                                                        >
                                                            <option value="" disabled>เลือกสถานะ</option>
                                                            {itemStatusEntries.map(([status, config]) => (
                                                                <option key={status} value={status}>
                                                                    {config.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {item.status === "ready" && pickupOptions.length > 0 && (
                                                            <select
                                                                value={item.pickupOptionId || pickupOptions[0]?.id || ""}
                                                                onChange={(e) => handleItemPickupChange(selectedOrder, idx, e.target.value)}
                                                                disabled={updatingItemKey === `${selectedOrder.id}-${idx}-pickup`}
                                                                className="h-9 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-48"
                                                                aria-label={`สถานที่รับ ${item.productName}`}
                                                            >
                                                                {pickupOptions.map((option) => (
                                                                    <option key={option.id} value={option.id}>
                                                                        {option.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                            )})}
                                        </div>
                                        <div className="compact-order-total flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2.5">
                                            <span className="text-sm font-semibold text-gray-700">รวมทั้งสิ้น</span>
                                            <span className="text-xl font-bold text-gray-900">฿{selectedOrder.totalAmount.toLocaleString()}</span>
                                        </div>
                                    </section>

                                    {refundSummary.length > 0 && (
                                        <section className="compact-refund-summary rounded-lg border border-orange-100 bg-white overflow-hidden">
                                            <div className="flex items-center justify-between gap-3 border-b border-orange-100 bg-orange-50 px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <RotateCcw size={16} className="text-orange-600" />
                                                    <span className="font-semibold text-sm text-orange-900">สรุปรายการคืนเงิน</span>
                                                </div>
                                                <span className="text-sm font-bold text-orange-700">฿{refundTotal.toLocaleString()}</span>
                                            </div>
                                            <div className="divide-y divide-orange-50">
                                                {refundSummary.map(({ name, detail, item, status, amount, unitPrice, quantity }, idx) => (
                                                    <div key={`${name}-${idx}`} className="flex items-start justify-between gap-3 px-4 py-3">
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <p className="text-sm font-semibold text-gray-900">{name}</p>
                                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${itemStatusConfig[status].bg} ${itemStatusConfig[status].color}`}>
                                                                    {itemStatusConfig[status].icon}
                                                                    {itemStatusConfig[status].label}
                                                                </span>
                                                            </div>
                                                            {detail && (
                                                                <p className="mt-1 text-xs text-gray-500">{detail}</p>
                                                            )}
                                                            <p className="mt-1 text-xs text-gray-400">
                                                                ฿{(item.finalPrice ?? item.price).toLocaleString()} × {item.quantity}
                                                            </p>
                                                        </div>
                                                        <p className="shrink-0 text-sm font-bold text-orange-700">฿{amount.toLocaleString()}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex items-center justify-between border-t border-orange-100 bg-orange-50 px-4 py-3">
                                                <span className="text-sm font-semibold text-orange-900">ยอดคืนเงินรวม</span>
                                                <span className="text-xl font-bold text-orange-700">฿{refundTotal.toLocaleString()}</span>
                                            </div>
                                        </section>
                                    )}

                                    <section className="rounded-xl border border-gray-100 bg-white p-4">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">เปลี่ยนสถานะ</p>
                                                <p className="text-xs text-gray-400">เลือกสถานะที่ต้องการอัปเดตได้โดยตรง</p>
                                            </div>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusConfig[selectedOrder.status].bg} ${statusConfig[selectedOrder.status].color}`}>
                                                {statusConfig[selectedOrder.status].icon}
                                                {statusConfig[selectedOrder.status].label}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                            {statusEntries.map(([status, config]) => (
                                                <button
                                                    key={status}
                                                    onClick={() => openStatusModal(status)}
                                                    disabled={selectedOrder.status === status || updatingOrderId === selectedOrder.id}
                                                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selectedOrder.status === status
                                                        ? `${config.bg} ${config.color} border-transparent`
                                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    {config.icon}
                                                    {config.label}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedOrder && isStatusModalOpen && statusDraft && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div>
                                <h3 className="font-semibold text-gray-900 text-sm">อัปเดทสถานะ</h3>
                                <p className="mt-1 text-xs text-gray-500">
                                    เปลี่ยนเป็น {statusConfig[statusDraft].label} สำหรับ {formatOrderId(selectedOrder, 8)}
                                </p>
                            </div>
                            <button onClick={closeStatusModal} className="p-1 hover:bg-gray-100 rounded">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 bg-[#F8F9FA]">
                            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${statusConfig[statusDraft].bg} ${statusConfig[statusDraft].color}`}>
                                {statusConfig[statusDraft].icon}
                                {statusConfig[statusDraft].label}
                            </div>
                            {statusDraft === "pending" && (
                                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
                                    ระบบจะเปลี่ยนคำสั่งซื้อกลับเป็นสถานะรอชำระ เหมาะสำหรับกรณีต้องตรวจสอบการชำระเงินใหม่
                                </div>
                            )}
                            {statusDraft === "paid" && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-700">รายละเอียดการชำระเงิน</label>
                                    <textarea
                                        rows={4}
                                        value={paymentDetailDraft}
                                        onChange={(e) => setPaymentDetailDraft(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                        placeholder="เช่น ช่องทางชำระ / เวลา / หมายเหตุ"
                                    />
                                </div>
                            )}
                            {statusDraft === "shipped" && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-700">รายละเอียดจัดส่ง</label>
                                        <textarea
                                            rows={4}
                                            value={shippingDetailDraft}
                                            onChange={(e) => setShippingDetailDraft(e.target.value)}
                                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                            placeholder="เช่น บริษัทขนส่ง / วันที่ส่ง / หมายเหตุ"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-700">เลขพัสดุ</label>
                                        <input
                                            value={trackingNumberDraft}
                                            onChange={(e) => setTrackingNumberDraft(e.target.value)}
                                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                            placeholder="กรอกเลขพัสดุ"
                                        />
                                    </div>
                                </>
                            )}
                            {statusDraft === "completed" && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-700">รายละเอียดเมื่อเสร็จสิ้น</label>
                                    <textarea
                                        rows={4}
                                        value={completionDetailDraft}
                                        onChange={(e) => setCompletionDetailDraft(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                        placeholder="เช่น รับสินค้าแล้ว / หมายเหตุ"
                                    />
                                </div>
                            )}
                            {statusDraft === "cancelled" && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-700">เหตุผลยกเลิก</label>
                                    <textarea
                                        rows={4}
                                        value={cancelReasonDraft}
                                        onChange={(e) => setCancelReasonDraft(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                        placeholder="เช่น ลูกค้าขอยกเลิก / ชำระเงินไม่สำเร็จ / สินค้าหมด"
                                    />
                                </div>
                            )}
                            {statusDraft === "returned" && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-700">เหตุผลคืนสินค้า</label>
                                    <textarea
                                        rows={4}
                                        value={returnReasonDraft}
                                        onChange={(e) => setReturnReasonDraft(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                        placeholder="เช่น ลูกค้าคืนสินค้า / สินค้ามีปัญหา / คืนเงินแล้ว"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
                            <button
                                onClick={closeStatusModal}
                                className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                disabled={updatingOrderId === selectedOrder.id}
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmStatusUpdate}
                                className="flex-1 px-4 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
                                disabled={updatingOrderId === selectedOrder.id}
                            >
                                บันทึก
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {issueReplyTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-gray-900 text-sm">ตอบกลับปัญหาสินค้า</h3>
                                <p className="mt-1 truncate text-xs text-gray-500">
                                    {issueReplyTarget.order.items[issueReplyTarget.itemIndex]?.productName}
                                </p>
                            </div>
                            <button
                                onClick={closeIssueReply}
                                disabled={savingIssueReply}
                                className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 bg-[#F8F9FA] space-y-4">
                            <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-700">
                                <p className="font-semibold">ลูกค้าแจ้งปัญหา</p>
                                <p className="mt-1 leading-5">
                                    {issueReplyTarget.order.items[issueReplyTarget.itemIndex]?.issueReason}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-700">คำตอบกลับ</label>
                                <textarea
                                    rows={4}
                                    value={issueReplyDraft}
                                    onChange={(e) => {
                                        setIssueReplyDraft(e.target.value);
                                        setIssueReplyError("");
                                    }}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                                    placeholder="เช่น รับทราบปัญหาแล้ว กำลังตรวจสอบและจะติดต่อกลับ"
                                />
                                {issueReplyError && <p className="text-xs text-red-500">{issueReplyError}</p>}
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
                            <button
                                onClick={closeIssueReply}
                                disabled={savingIssueReply}
                                className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={handleSaveIssueReply}
                                disabled={savingIssueReply}
                                className="flex-1 px-4 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
                            >
                                {savingIssueReply ? "กำลังบันทึก..." : "บันทึกคำตอบ"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isCancelConfirmOpen && cancelTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <h3 className="font-semibold text-gray-900 text-sm">ยืนยันการยกเลิก</h3>
                            <button onClick={closeCancelConfirm} className="p-1 hover:bg-gray-100 rounded">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 bg-[#F8F9FA] space-y-2">
                            <p className="text-sm text-gray-700">
                                ต้องการยกเลิกคำสั่งซื้อ {formatOrderId(cancelTarget, 8)} ใช่หรือไม่?
                            </p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
                            <button
                                onClick={closeCancelConfirm}
                                className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                disabled={updatingOrderId === cancelTarget.id}
                            >
                                ปิด
                            </button>
                            <button
                                onClick={confirmCancelOrder}
                                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                                disabled={updatingOrderId === cancelTarget.id}
                            >
                                ยืนยันยกเลิก
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteConfirmOpen && deleteTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <h3 className="font-semibold text-gray-900 text-sm">ลบคำสั่งซื้อ</h3>
                            <button onClick={closeDeleteConfirm} className="p-1 hover:bg-gray-100 rounded">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 bg-[#F8F9FA] space-y-2">
                            <p className="text-sm text-gray-700">
                                ต้องการลบคำสั่งซื้อ {formatOrderId(deleteTarget, 8)} ใช่หรือไม่?
                            </p>
                            <p className="text-xs text-red-600">ลบแล้วไม่สามารถกู้คืนได้</p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
                            <button
                                onClick={closeDeleteConfirm}
                                className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                disabled={deletingOrderId === deleteTarget.id}
                            >
                                ปิด
                            </button>
                            <button
                                onClick={confirmDeleteOrder}
                                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                                disabled={deletingOrderId === deleteTarget.id}
                            >
                                {deletingOrderId === deleteTarget.id ? "กำลังลบ..." : "ยืนยันลบ"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
