"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { CheckCircle, ChevronLeft, Clock, CreditCard, Loader2, MapPin, Package, RotateCcw, Truck, User, XCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { formatOrderId } from "@/lib/orderId";
import { Order, OrderItemStatus, OrderStatus } from "@/types/order";
import { PickupOption, StoreSettings } from "@/types/store";

type OrderItemsDraft = Order["items"];
type OrderAddOnDraft = NonNullable<OrderItemsDraft[number]["addOns"]>[number];

const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    pending: { label: "รอชำระ", color: "text-amber-700", bg: "bg-amber-50", icon: <Clock size={12} /> },
    paid: { label: "ชำระแล้ว", color: "text-blue-700", bg: "bg-blue-50", icon: <CreditCard size={12} /> },
    shipped: { label: "จัดส่งแล้ว", color: "text-purple-700", bg: "bg-purple-50", icon: <Truck size={12} /> },
    completed: { label: "สำเร็จ", color: "text-green-700", bg: "bg-green-50", icon: <CheckCircle size={12} /> },
    cancelled: { label: "ยกเลิก", color: "text-red-700", bg: "bg-red-50", icon: <XCircle size={12} /> },
    returned: { label: "คืนสินค้า", color: "text-orange-700", bg: "bg-orange-50", icon: <RotateCcw size={12} /> },
};

const statusOrder: OrderStatus[] = ["pending", "paid", "shipped", "completed", "cancelled", "returned"];

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
    Boolean(status && selectableItemStatuses.includes(status));

const toDate = (value: Order["createdAt"] | Order["updatedAt"]) => {
    if (value instanceof Date) return value;
    if (value && typeof value === "object" && "toDate" in value) return value.toDate();
    return new Date();
};

const getLineName = (order: Order) => order.lineDisplayName || order.linename || "";

const toNumber = (value: string | number | undefined) => Math.max(0, Number(value) || 0);

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

const calculateItemsTotal = (items: OrderItemsDraft) => {
    return items.reduce((sum, item) => sum + toNumber(item.finalPrice ?? item.price) * toNumber(item.quantity), 0);
};

export default function AdminOrderDetailPage() {
    const params = useParams<{ id: string }>();
    const orderId = params.id;
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState<OrderStatus | null>(null);
    const [updatingItemKey, setUpdatingItemKey] = useState<string | null>(null);
    const [itemDrafts, setItemDrafts] = useState<OrderItemsDraft>([]);
    const [isEditingItems, setIsEditingItems] = useState(false);
    const [savingItems, setSavingItems] = useState(false);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
    const [issueReplyDrafts, setIssueReplyDrafts] = useState<Record<string, string>>({});
    const [savingIssueReplyKey, setSavingIssueReplyKey] = useState<string | null>(null);

    useEffect(() => {
        if (!orderId) return;
        const unsubscribe = onSnapshot(doc(db, "orders", orderId), (snapshot) => {
            if (!snapshot.exists()) {
                setOrder(null);
                setLoading(false);
                return;
            }

            const data = snapshot.data();
            setOrder({
                id: snapshot.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || new Date(),
                updatedAt: data.updatedAt?.toDate?.() || new Date()
            } as Order);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [orderId]);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, "settings", "store"), (snapshot) => {
            setStoreSettings(snapshot.exists() ? snapshot.data() as StoreSettings : null);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (order) {
            setItemDrafts(order.items.map((item) => ({
                ...item,
                bundleItems: item.bundleItems?.map((bundleItem) => ({ ...bundleItem }))
            })));
            setIssueReplyDrafts(Object.fromEntries(
                order.items.flatMap((item, index) => [
                    [`${index}`, item.issueAdminReply || ""],
                    ...(item.bundleItems?.map((bundleItem, bundleIndex) => [
                        `${index}-${bundleIndex}`,
                        bundleItem.issueAdminReply || ""
                    ] as const) || [])
                ])
            ));
            setIsEditingItems(false);
        }
    }, [order]);

    const createdAt = useMemo(() => order ? toDate(order.createdAt) : new Date(), [order]);
    const pickupOptions = useMemo(() => getActivePickupOptions(storeSettings), [storeSettings]);

    const updateStatus = async (status: OrderStatus) => {
        if (!order || updatingStatus) return;
        try {
            setUpdatingStatus(status);
            await updateDoc(doc(db, "orders", order.id), {
                status,
                updatedAt: serverTimestamp()
            });
        } finally {
            setUpdatingStatus(null);
        }
    };

    const updateItemStatus = async (itemIndex: number, status: OrderItemStatus) => {
        if (!order || updatingItemKey) return;
        const itemKey = `${order.id}-${itemIndex}`;
        const nextItems = order.items.map((item, index) => (
            index === itemIndex
                ? applyPickupOption({
                    ...item,
                    status,
                    bundleItems: item.bundleItems?.map((bundleItem) => applyPickupOption({
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
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const updateBundleItemStatus = async (itemIndex: number, bundleItemIndex: number, status: OrderItemStatus) => {
        if (!order || updatingItemKey) return;
        const itemKey = `${order.id}-${itemIndex}-${bundleItemIndex}`;
        const nextItems = order.items.map((item, index) => {
            if (index !== itemIndex) return item;
            return {
                ...item,
                bundleItems: item.bundleItems?.map((bundleItem, index) => (
                    index === bundleItemIndex ? applyPickupOption({ ...bundleItem, status }, status, pickupOptions) : bundleItem
                ))
            };
        });

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: nextItems,
                updatedAt: serverTimestamp()
            });
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const updateItemPickup = async (itemIndex: number, pickupOptionId: string) => {
        if (!order || updatingItemKey) return;
        const pickupOption = pickupOptions.find(option => option.id === pickupOptionId);
        if (!pickupOption) return;

        const itemKey = `${order.id}-${itemIndex}-pickup`;
        const nextItems = order.items.map((item, index) => (
            index === itemIndex
                ? {
                    ...item,
                    status: "ready" as OrderItemStatus,
                    pickupOptionId: pickupOption.id,
                    pickupLabel: pickupOption.label,
                    pickupDetail: pickupOption.detail || null,
                    bundleItems: item.bundleItems?.map((bundleItem) => ({
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
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const updateBundleItemPickup = async (itemIndex: number, bundleItemIndex: number, pickupOptionId: string) => {
        if (!order || updatingItemKey) return;
        const pickupOption = pickupOptions.find(option => option.id === pickupOptionId);
        if (!pickupOption) return;

        const itemKey = `${order.id}-${itemIndex}-${bundleItemIndex}-pickup`;
        const nextItems = order.items.map((item, index) => {
            if (index !== itemIndex) return item;
            return {
                ...item,
                bundleItems: item.bundleItems?.map((bundleItem, index) => (
                    index === bundleItemIndex
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
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const updateItemDraft = (itemIndex: number, updates: Partial<OrderItemsDraft[number]>) => {
        setItemDrafts((prev) => prev.map((item, index) => (
            index === itemIndex ? { ...item, ...updates } : item
        )));
    };

    const updateBundleItemDraft = (
        itemIndex: number,
        bundleItemIndex: number,
        updates: Partial<NonNullable<OrderItemsDraft[number]["bundleItems"]>[number]>
    ) => {
        setItemDrafts((prev) => prev.map((item, index) => {
            if (index !== itemIndex) return item;
            return {
                ...item,
                bundleItems: item.bundleItems?.map((bundleItem, childIndex) => (
                    childIndex === bundleItemIndex ? { ...bundleItem, ...updates } : bundleItem
                ))
            };
        }));
    };

    const updateItemAddOnDraft = (
        itemIndex: number,
        addOnIndex: number,
        updates: Partial<NonNullable<OrderItemsDraft[number]["addOns"]>[number]>
    ) => {
        setItemDrafts((prev) => prev.map((item, index) => {
            if (index !== itemIndex) return item;
            return {
                ...item,
                addOns: item.addOns?.map((addOn, index) => (
                    index === addOnIndex ? { ...addOn, ...updates } : addOn
                ))
            };
        }));
    };

    const updateBundleAddOnDraft = (
        itemIndex: number,
        bundleItemIndex: number,
        addOnIndex: number,
        updates: Partial<NonNullable<NonNullable<OrderItemsDraft[number]["bundleItems"]>[number]["selectedAddOns"]>[number]>
    ) => {
        setItemDrafts((prev) => prev.map((item, index) => {
            if (index !== itemIndex) return item;
            return {
                ...item,
                bundleItems: item.bundleItems?.map((bundleItem, index) => {
                    if (index !== bundleItemIndex) return bundleItem;
                    return {
                        ...bundleItem,
                        selectedAddOns: bundleItem.selectedAddOns?.map((addOn, index) => (
                            index === addOnIndex ? { ...addOn, ...updates } : addOn
                        ))
                    };
                })
            };
        }));
    };

    const saveItemDrafts = async () => {
        if (!order || savingItems) return;
        const normalizedItems = itemDrafts.map((item) => {
            const price = toNumber(item.finalPrice ?? item.price);
            const quantity = Math.max(1, toNumber(item.quantity));
            return {
                ...item,
                productName: item.productName.trim() || "สินค้า",
                variantInfo: item.variantInfo?.trim() || null,
                price,
                finalPrice: price,
                quantity,
                addOns: item.addOns?.map((addOn) => ({
                    ...addOn,
                    name: addOn.name.trim() || "บริการเสริม",
                    value: addOn.value?.trim() || "",
                    price: toNumber(addOn.price)
                })),
                bundleItems: item.bundleItems?.map((bundleItem) => ({
                    ...bundleItem,
                    productName: bundleItem.productName.trim() || "สินค้าในเซต",
                    variantName: bundleItem.variantName?.trim() || "",
                    unitPrice: toNumber(bundleItem.unitPrice),
                    quantity: Math.max(1, toNumber(bundleItem.quantity)),
                    selectedAddOns: bundleItem.selectedAddOns?.map((addOn) => ({
                        ...addOn,
                        name: addOn.name.trim() || "บริการเสริม",
                        value: addOn.value?.trim() || "",
                        price: toNumber(addOn.price)
                    }))
                }))
            };
        });
        const totalAmount = calculateItemsTotal(normalizedItems) + toNumber(order.deliveryFee);

        try {
            setSavingItems(true);
            await updateDoc(doc(db, "orders", order.id), {
                items: normalizedItems,
                totalAmount,
                updatedAt: serverTimestamp()
            });
            setIsEditingItems(false);
        } finally {
            setSavingItems(false);
        }
    };

    const saveIssueReply = async (itemIndex: number, bundleItemIndex: number | null = null) => {
        if (!order || savingIssueReplyKey) return;
        const item = order.items[itemIndex];
        if (!item) return;

        const draftKey = bundleItemIndex === null ? `${itemIndex}` : `${itemIndex}-${bundleItemIndex}`;
        const reply = (issueReplyDrafts[draftKey] || "").trim();
        const nextItems = order.items.map((item, index) => {
            if (index !== itemIndex) return item;
            if (bundleItemIndex === null) {
                return {
                    ...item,
                    issueAdminReply: reply,
                    issueAdminRepliedAt: reply ? new Date().toISOString() : ""
                };
            }
            return {
                ...item,
                bundleItems: item.bundleItems?.map((bundleItem, index) => (
                    index === bundleItemIndex
                        ? {
                            ...bundleItem,
                            issueAdminReply: reply,
                            issueAdminRepliedAt: reply ? new Date().toISOString() : ""
                        }
                        : bundleItem
                ))
            };
        });

        try {
            setSavingIssueReplyKey(`${order.id}-${draftKey}`);
            await updateDoc(doc(db, "orders", order.id), {
                items: nextItems,
                updatedAt: serverTimestamp()
            });
        } finally {
            setSavingIssueReplyKey(null);
        }
    };

    const cancelItemEditing = () => {
        if (!order || savingItems) return;
        setItemDrafts(order.items.map((item) => ({
            ...item,
            bundleItems: item.bundleItems?.map((bundleItem) => ({ ...bundleItem }))
        })));
        setIsEditingItems(false);
    };

    if (loading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center text-gray-500">
                <Loader2 className="mr-2 animate-spin" size={20} />
                กำลังโหลดคำสั่งซื้อ...
            </div>
        );
    }

    if (!order) {
        return (
            <div className="mx-auto max-w-3xl rounded-xl border border-gray-100 bg-white p-8 text-center">
                <ShoppingBagFallback />
                <p className="mt-3 font-semibold text-gray-900">ไม่พบคำสั่งซื้อ</p>
                <Link href="/orders" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
                    <ChevronLeft size={16} />
                    กลับหน้าคำสั่งซื้อ
                </Link>
            </div>
        );
    }

    const status = statusConfig[order.status];

    return (
        <div className="mx-auto max-w-7xl space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900">
                        <ChevronLeft size={14} />
                        กลับหน้าคำสั่งซื้อ
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-xl font-bold text-gray-900">คำสั่งซื้อ {formatOrderId(order, 8)}</h1>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.bg} ${status.color}`}>
                            {status.icon}
                            {status.label}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">สร้างเมื่อ {format(createdAt, "d MMMM yyyy HH:mm", { locale: th })}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {statusOrder.map((nextStatus) => {
                        const config = statusConfig[nextStatus];
                        return (
                            <button
                                key={nextStatus}
                                type="button"
                                onClick={() => updateStatus(nextStatus)}
                                disabled={order.status === nextStatus || Boolean(updatingStatus)}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${order.status === nextStatus ? `${config.bg} ${config.color} border-transparent` : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                            >
                                {updatingStatus === nextStatus ? <Loader2 size={12} className="animate-spin" /> : config.icon}
                                {config.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                            <User size={16} className="text-gray-500" />
                            <span className="text-sm font-semibold text-gray-900">ข้อมูลลูกค้า</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                            {getLineName(order) && (
                                <InfoItem label="LINE Name" value={getLineName(order)} className="sm:col-span-2" />
                            )}
                            <InfoItem label="ชื่อ" value={order.customerName} />
                            <InfoItem label="เบอร์โทร" value={order.customerPhone} />
                            {order.customerCitizenId && <InfoItem label="เลขบัตรประชาชน" value={order.customerCitizenId} />}
                            <InfoItem label="Customer ID" value={order.customerId || order.userId || "-"} className="sm:col-span-2 break-all font-mono text-xs" />
                        </div>
                    </section>

                    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                        <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                            <MapPin size={16} className="text-gray-500" />
                            <span className="text-sm font-semibold text-gray-900">ที่อยู่จัดส่ง</span>
                        </div>
                        <div className="p-4">
                            <p className="whitespace-pre-line text-sm leading-6 text-gray-700">{order.shippingAddress || "ไม่ระบุ (รับเอง)"}</p>
                            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                <span className="font-semibold text-gray-900">{order.shippingOptionName || "ค่าจัดส่ง"}</span>
                                <span className="ml-2">{order.deliveryFee ? `฿${order.deliveryFee.toLocaleString()}` : "ฟรี"}</span>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-xl border border-gray-100 bg-white p-4">
                        <p className="mb-3 text-sm font-semibold text-gray-900">รายละเอียดสถานะ</p>
                        <div className="space-y-3 text-sm">
                            <DetailRow label="ชำระเงิน" value={order.paymentDetail || "-"} />
                            <DetailRow label="จัดส่ง" value={order.shippingDetail || "-"} />
                            <DetailRow label="เลขพัสดุ" value={order.trackingNumber || "-"} />
                            <DetailRow label="เสร็จสิ้น" value={order.completionDetail || "-"} />
                            <DetailRow label="เหตุผลยกเลิก" value={order.cancelReason || "-"} />
                            <DetailRow label="ช่องทางคืนเงิน" value={order.refundChannel || "-"} />
                            <DetailRow label="เหตุผลคืนสินค้า" value={order.returnReason || "-"} />
                        </div>
                    </section>
                </div>

                <div className="space-y-4">
                    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                        <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <Package size={16} className="text-gray-500" />
                                <span className="text-sm font-semibold text-gray-900">รายการสินค้า</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {isEditingItems ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={cancelItemEditing}
                                            disabled={savingItems}
                                            className="inline-flex h-8 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveItemDrafts}
                                            disabled={savingItems}
                                            className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-gray-900 px-3 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {savingItems && <Loader2 size={12} className="animate-spin" />}
                                            บันทึกรายการสินค้า
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingItems(true)}
                                        className="inline-flex h-8 items-center justify-center rounded-md bg-gray-900 px-3 text-xs font-semibold text-white transition hover:bg-gray-800"
                                    >
                                        แก้ไขรายการ
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="space-y-2 bg-gray-50/40 p-3">
                            {itemDrafts.map((item, index) => (
                                <div key={`${item.productId}-${index}`} className="rounded-lg border border-gray-200 bg-white p-3">
                                    <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_112px_84px_88px] xl:items-end">
                                        <div className="min-w-0 space-y-1.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <input
                                                    value={item.productName}
                                                    onChange={(event) => updateItemDraft(index, { productName: event.target.value })}
                                                    disabled={!isEditingItems}
                                                    className="h-8 min-w-[160px] flex-1 rounded-md border border-gray-200 bg-white px-2.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-gray-200 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-900"
                                                    aria-label="ชื่อสินค้า"
                                                />
                                                {item.status && (
                                                    <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${itemStatusConfig[item.status].bg} ${itemStatusConfig[item.status].color}`}>
                                                        {itemStatusConfig[item.status].icon}
                                                        {itemStatusConfig[item.status].label}
                                                    </span>
                                                )}
                                                <select
                                                    value={isSelectableItemStatus(item.status) ? item.status : ""}
                                                    onChange={(event) => updateItemStatus(index, event.target.value as OrderItemStatus)}
                                                    disabled={updatingItemKey === `${order.id}-${index}`}
                                                    className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 outline-none transition-colors focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                                                    aria-label={`สถานะสินค้า ${item.productName}`}
                                                >
                                                    <option value="" disabled>เลือกสถานะ</option>
                                                    {selectableItemStatuses.map((status) => (
                                                        <option key={status} value={status}>
                                                            {itemStatusConfig[status].label}
                                                        </option>
                                                    ))}
                                                </select>
                                                {item.status === "ready" && pickupOptions.length > 0 && (
                                                    <select
                                                        value={item.pickupOptionId || pickupOptions[0]?.id || ""}
                                                        onChange={(event) => updateItemPickup(index, event.target.value)}
                                                        disabled={updatingItemKey === `${order.id}-${index}-pickup`}
                                                        className="h-8 min-w-[190px] rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                                            <input
                                                value={item.variantInfo || ""}
                                                onChange={(event) => updateItemDraft(index, { variantInfo: event.target.value })}
                                                placeholder="ตัวเลือกสินค้า"
                                                disabled={!isEditingItems}
                                                className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-gray-200 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-700"
                                                aria-label="ตัวเลือกสินค้า"
                                            />
                                        </div>
                                        <NumberField
                                            label="ราคา"
                                            value={toNumber(item.finalPrice ?? item.price)}
                                            onChange={(value) => updateItemDraft(index, { price: value, finalPrice: value })}
                                            disabled={!isEditingItems}
                                        />
                                        <NumberField
                                            label="จำนวน"
                                            value={toNumber(item.quantity)}
                                            onChange={(value) => updateItemDraft(index, { quantity: Math.max(1, value) })}
                                            disabled={!isEditingItems}
                                        />
                                        <div className="rounded-md bg-gray-50 px-2 py-1.5 text-right">
                                            <p className="text-[10px] font-semibold text-gray-400">รวม</p>
                                            <p className="text-right text-sm font-bold text-gray-900">
                                                ฿{(toNumber(item.finalPrice ?? item.price) * toNumber(item.quantity)).toLocaleString()}
                                            </p>
                                        </div>
                                        {item.addOns?.length ? (
                                            <div className="space-y-1.5 xl:col-span-4">
                                                {item.addOns.map((addOn, addOnIndex) => (
                                                    <AddOnEditor
                                                        key={addOn.id}
                                                        addOn={addOn}
                                                        disabled={!isEditingItems}
                                                        onChange={(updates) => updateItemAddOnDraft(index, addOnIndex, updates)}
                                                    />
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                    {item.bundleItems?.length ? (
                                        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                                            <div className="border-b border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700">รายการในเซต</div>
                                            <div className="space-y-1.5 p-2">
                                                {item.bundleItems.map((bundleItem, bundleIndex) => (
                                                    <div key={`${bundleItem.id}-${bundleIndex}`} className="grid grid-cols-1 gap-1.5 rounded-md border border-gray-200 bg-white p-2 text-xs xl:grid-cols-[minmax(0,1fr)_92px_74px_82px] xl:items-end">
                                                        <div className="space-y-1.5">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <input
                                                                    value={bundleItem.productName}
                                                                    onChange={(event) => updateBundleItemDraft(index, bundleIndex, { productName: event.target.value })}
                                                                    disabled={!isEditingItems}
                                                                    className="h-7 min-w-[130px] flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-gray-200 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-900"
                                                                    aria-label="ชื่อสินค้าในเซต"
                                                                />
                                                                {bundleItem.status && (
                                                                    <span className={`inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold ${itemStatusConfig[bundleItem.status].bg} ${itemStatusConfig[bundleItem.status].color}`}>
                                                                        {itemStatusConfig[bundleItem.status].icon}
                                                                        {itemStatusConfig[bundleItem.status].label}
                                                                    </span>
                                                                )}
                                                                <select
                                                                    value={isSelectableItemStatus(bundleItem.status) ? bundleItem.status : ""}
                                                                    onChange={(event) => updateBundleItemStatus(index, bundleIndex, event.target.value as OrderItemStatus)}
                                                                    disabled={updatingItemKey === `${order.id}-${index}-${bundleIndex}`}
                                                                    className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-700 outline-none transition-colors focus:ring-2 focus:ring-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    aria-label={`สถานะสินค้าในเซต ${bundleItem.productName}`}
                                                                >
                                                                    <option value="" disabled>รายชิ้น</option>
                                                                    {selectableItemStatuses.map((status) => (
                                                                        <option key={status} value={status}>
                                                                            {itemStatusConfig[status].label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {bundleItem.status === "ready" && pickupOptions.length > 0 && (
                                                                    <select
                                                                        value={bundleItem.pickupOptionId || pickupOptions[0]?.id || ""}
                                                                        onChange={(event) => updateBundleItemPickup(index, bundleIndex, event.target.value)}
                                                                        disabled={updatingItemKey === `${order.id}-${index}-${bundleIndex}-pickup`}
                                                                        className="h-7 min-w-[170px] rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                                                            <input
                                                                value={bundleItem.variantName || ""}
                                                                onChange={(event) => updateBundleItemDraft(index, bundleIndex, { variantName: event.target.value })}
                                                                placeholder="ตัวเลือก"
                                                                disabled={!isEditingItems}
                                                                className="h-7 w-full rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700 outline-none focus:ring-2 focus:ring-gray-200 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-700"
                                                                aria-label="ตัวเลือกสินค้าในเซต"
                                                            />
                                                            {bundleItem.selectedAddOns?.length ? (
                                                                <div className="space-y-1">
                                                                    {bundleItem.selectedAddOns.map((addOn, addOnIndex) => (
                                                                        <AddOnEditor
                                                                            key={addOn.id}
                                                                            addOn={addOn}
                                                                            disabled={!isEditingItems}
                                                                            compact
                                                                            onChange={(updates) => updateBundleAddOnDraft(index, bundleIndex, addOnIndex, updates)}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        <NumberField
                                                            label="ราคา"
                                                            value={toNumber(bundleItem.unitPrice)}
                                                            onChange={(value) => updateBundleItemDraft(index, bundleIndex, { unitPrice: value })}
                                                            compact
                                                            disabled={!isEditingItems}
                                                        />
                                                        <NumberField
                                                            label="จำนวน"
                                                            value={toNumber(bundleItem.quantity)}
                                                            onChange={(value) => updateBundleItemDraft(index, bundleIndex, { quantity: Math.max(1, value) })}
                                                            compact
                                                            disabled={!isEditingItems}
                                                        />
                                                        <div className="rounded-md bg-gray-50 px-2 py-1 text-right">
                                                            <p className="text-[10px] font-semibold text-gray-400">รวม</p>
                                                            <p className="text-right font-semibold text-gray-700">
                                                                ฿{(toNumber(bundleItem.unitPrice) * toNumber(bundleItem.quantity) * toNumber(item.quantity)).toLocaleString()}
                                                            </p>
                                                        </div>
                                                        {(bundleItem.issueReason || bundleItem.issueAdminReply || bundleItem.status === "cancelled" || bundleItem.status === "returned") && (
                                                            <div className="xl:col-span-4">
                                                                <IssueReplyBox
                                                                    compact
                                                                    reason={bundleItem.issueReason}
                                                                    reportedAt={bundleItem.issueReportedAt}
                                                                    reply={bundleItem.issueAdminReply}
                                                                    repliedAt={bundleItem.issueAdminRepliedAt}
                                                                    draftValue={issueReplyDrafts[`${index}-${bundleIndex}`] || ""}
                                                                    onDraftChange={(value) => setIssueReplyDrafts((prev) => ({ ...prev, [`${index}-${bundleIndex}`]: value }))}
                                                                    onSave={() => saveIssueReply(index, bundleIndex)}
                                                                    isSaving={savingIssueReplyKey === `${order.id}-${index}-${bundleIndex}`}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    {(item.issueReason || item.issueAdminReply || item.status === "cancelled" || item.status === "returned") && (
                                        <IssueReplyBox
                                            reason={item.issueReason}
                                            reportedAt={item.issueReportedAt}
                                            reply={item.issueAdminReply}
                                            repliedAt={item.issueAdminRepliedAt}
                                            draftValue={issueReplyDrafts[`${index}`] || ""}
                                            onDraftChange={(value) => setIssueReplyDrafts((prev) => ({ ...prev, [`${index}`]: value }))}
                                            onSave={() => saveIssueReply(index)}
                                            isSaving={savingIssueReplyKey === `${order.id}-${index}`}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2.5">
                            <span className="text-sm font-semibold text-gray-700">รวมทั้งหมด</span>
                            <span className="text-xl font-bold text-gray-900">
                                ฿{(calculateItemsTotal(itemDrafts) + toNumber(order.deliveryFee)).toLocaleString()}
                            </span>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

function InfoItem({ label, value, className = "" }: { label: string; value: string; className?: string }) {
    return (
        <div className={className}>
            <p className="mb-1 text-xs text-gray-400">{label}</p>
            <p className="text-sm font-semibold text-gray-900">{value}</p>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-gray-400">{label}</span>
            <span className="whitespace-pre-line text-right text-gray-700">{value}</span>
        </div>
    );
}

function NumberField({
    label,
    value,
    onChange,
    compact = false,
    disabled = false
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    compact?: boolean;
    disabled?: boolean;
}) {
    return (
        <label className="block">
            <span className="mb-0.5 block text-[10px] font-semibold text-gray-400">{label}</span>
            <input
                type="number"
                min={0}
                value={value}
                onChange={(event) => onChange(toNumber(event.target.value))}
                disabled={disabled}
                className={`${compact ? "h-7 text-xs" : "h-8 text-sm"} w-full rounded-md border border-gray-200 bg-white px-2 text-right font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-gray-200 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-900`}
            />
        </label>
    );
}

function AddOnEditor({
    addOn,
    onChange,
    disabled,
    compact = false
}: {
    addOn: OrderAddOnDraft;
    onChange: (updates: Partial<OrderAddOnDraft>) => void;
    disabled: boolean;
    compact?: boolean;
}) {
    return (
        <div className={`grid grid-cols-1 gap-1.5 rounded-md border border-gray-100 bg-gray-50 p-1.5 ${compact ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_70px]" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_84px]"}`}>
            <input
                value={addOn.name}
                onChange={(event) => onChange({ name: event.target.value })}
                disabled={disabled}
                className="h-7 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-gray-200 disabled:border-gray-100 disabled:bg-white disabled:text-gray-700"
                aria-label="ชื่อบริการเสริม"
            />
            <input
                value={addOn.value || ""}
                onChange={(event) => onChange({ value: event.target.value })}
                disabled={disabled}
                className="h-7 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700 outline-none focus:ring-2 focus:ring-gray-200 disabled:border-gray-100 disabled:bg-white disabled:text-gray-600"
                aria-label="ค่าบริการเสริม"
            />
            <input
                type="number"
                min={0}
                value={toNumber(addOn.price)}
                onChange={(event) => onChange({ price: toNumber(event.target.value) })}
                disabled={disabled}
                className="h-7 rounded-md border border-gray-200 bg-white px-2 text-right text-[11px] font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-gray-200 disabled:border-gray-100 disabled:bg-white disabled:text-gray-800"
                aria-label="ราคาบริการเสริม"
            />
        </div>
    );
}

function IssueReplyBox({
    reason,
    reportedAt,
    reply,
    repliedAt,
    draftValue,
    onDraftChange,
    onSave,
    isSaving,
    compact = false
}: {
    reason?: string;
    reportedAt?: string;
    reply?: string;
    repliedAt?: string;
    draftValue: string;
    onDraftChange: (value: string) => void;
    onSave: () => void;
    isSaving: boolean;
    compact?: boolean;
}) {
    return (
        <div className={`mt-2 rounded-md border border-amber-100 bg-amber-50/60 ${compact ? "p-2" : "p-2.5"}`}>
            <div className={`grid gap-2 ${compact ? "lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]"}`}>
                <div className="min-w-0 text-[11px]">
                    <p className="font-bold text-amber-900">แจ้งปัญหา</p>
                    <p className="mt-0.5 whitespace-pre-line leading-4 text-amber-800">{reason || "ไม่มีข้อความจากลูกค้า"}</p>
                    {reportedAt && (
                        <p className="mt-0.5 text-[10px] text-amber-600">
                            {new Date(reportedAt).toLocaleString("th-TH")}
                        </p>
                    )}
                </div>
                <div className="min-w-0">
                    <textarea
                        value={draftValue}
                        onChange={(event) => onDraftChange(event.target.value)}
                        rows={compact ? 2 : 3}
                        className="w-full resize-y rounded-md border border-amber-200 bg-white px-2 py-1.5 text-[11px] text-gray-800 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                        placeholder="ตอบกลับลูกค้า"
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] text-gray-500">
                            {repliedAt ? `ตอบล่าสุด ${new Date(repliedAt).toLocaleString("th-TH")}` : reply ? "มีข้อความตอบกลับแล้ว" : "ยังไม่ได้ตอบ"}
                        </span>
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={isSaving}
                            className="inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-amber-700 px-2.5 text-[11px] font-bold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving && <Loader2 size={11} className="animate-spin" />}
                            บันทึก
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ShoppingBagFallback() {
    return <Package size={40} className="mx-auto text-gray-300" />;
}
