"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { CheckCircle, ChevronLeft, Clock, CreditCard, Loader2, MapPin, Package, Pencil, Plus, RotateCcw, Trash2, Truck, User, XCircle } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { formatOrderId } from "@/lib/orderId";
import { Order, OrderItem, OrderItemStatus, OrderStatus } from "@/types/order";
import { PickupOption, StoreSettings } from "@/types/store";

type OrderItemsDraft = Order["items"];
type OrderAddOnDraft = NonNullable<OrderItemsDraft[number]["addOns"]>[number];

const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string; badge: string; icon: React.ReactNode }> = {
    pending: { label: "รอชำระ", color: "text-amber-700", bg: "bg-amber-50", badge: "bg-amber-50 text-amber-700 border-amber-200/60", icon: <Clock size={11} className="text-amber-600" /> },
    paid: { label: "ชำระแล้ว", color: "text-blue-700", bg: "bg-blue-50", badge: "bg-blue-50 text-blue-700 border-blue-200/60", icon: <CreditCard size={11} className="text-blue-600" /> },
    shipped: { label: "จัดส่งแล้ว", color: "text-purple-700", bg: "bg-purple-50", badge: "bg-purple-50 text-purple-700 border-purple-200/60", icon: <Truck size={11} className="text-purple-600" /> },
    completed: { label: "สำเร็จ", color: "text-emerald-700", bg: "bg-emerald-50", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60", icon: <CheckCircle size={11} className="text-emerald-600" /> },
    cancelled: { label: "ยกเลิก", color: "text-rose-700", bg: "bg-rose-50", badge: "bg-rose-50 text-rose-700 border-rose-200/60", icon: <XCircle size={11} className="text-rose-600" /> },
    returned: { label: "คืนสินค้า", color: "text-orange-700", bg: "bg-orange-50", badge: "bg-orange-50 text-orange-700 border-orange-200/60", icon: <RotateCcw size={11} className="text-orange-600" /> },
};

const statusOrder: OrderStatus[] = ["pending", "paid", "shipped", "completed", "cancelled", "returned"];

const itemStatusConfig: Record<OrderItemStatus, { label: string; color: string; bg: string; badge: string; icon: React.ReactNode }> = {
    processing: { label: "ดำเนินการ", color: "text-blue-700", bg: "bg-blue-50", badge: "bg-blue-50 text-blue-700 border-blue-200/60", icon: <Clock size={10} /> },
    ready: { label: "พร้อมรับ", color: "text-emerald-700", bg: "bg-emerald-50", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60", icon: <Package size={10} /> },
    received: { label: "รับแล้ว", color: "text-green-700", bg: "bg-green-50", badge: "bg-green-50 text-green-700 border-green-200/60", icon: <CheckCircle size={10} /> },
    shipped: { label: "จัดส่ง", color: "text-purple-700", bg: "bg-purple-50", badge: "bg-purple-50 text-purple-700 border-purple-200/60", icon: <Truck size={10} /> },
    completed: { label: "สำเร็จ", color: "text-emerald-700", bg: "bg-emerald-50", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60", icon: <CheckCircle size={10} /> },
    cancelled: { label: "ยกเลิก", color: "text-rose-700", bg: "bg-rose-50", badge: "bg-rose-50 text-rose-700 border-rose-200/60", icon: <XCircle size={10} /> },
    returned: { label: "คืนสินค้า", color: "text-orange-700", bg: "bg-orange-50", badge: "bg-orange-50 text-orange-700 border-orange-200/60", icon: <RotateCcw size={10} /> },
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

function cleanForFirestore<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return null as unknown as T;
    }
    if (Array.isArray(obj)) {
        return obj
            .filter(item => item !== undefined)
            .map(item => cleanForFirestore(item)) as unknown as T;
    }
    if (typeof obj === "object" && !(obj instanceof Date)) {
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                cleaned[key] = cleanForFirestore(value);
            }
        }
        return cleaned as T;
    }
    return obj;
}

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

    // Order Edit Request (Add-ons / Items) & Customer info edit
    const [pendingOrderRequest, setPendingOrderRequest] = useState<{ id: string; details: string; reason: string; itemName?: string } | null>(null);
    const [processingOrderRequest, setProcessingOrderRequest] = useState(false);
    const [isEditingCustomerInfo, setIsEditingCustomerInfo] = useState(false);
    const [editCustomerName, setEditCustomerName] = useState("");
    const [editCustomerPhone, setEditCustomerPhone] = useState("");
    const [editShippingAddress, setEditShippingAddress] = useState("");
    const [savingCustomerInfo, setSavingCustomerInfo] = useState(false);

    useEffect(() => {
        if (!orderId) return;
        const q = query(
            collection(db, "order_edit_requests"),
            where("orderId", "==", orderId),
            where("status", "==", "pending")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const docData = snapshot.docs[0].data();
                setPendingOrderRequest({
                    id: snapshot.docs[0].id,
                    details: docData.details || "",
                    reason: docData.reason || "",
                    itemName: docData.itemName || undefined
                });
            } else {
                setPendingOrderRequest(null);
            }
        }, (err) => console.warn("Error listening to order requests:", err));

        return () => unsubscribe();
    }, [orderId]);

    const handleResolveOrderRequest = async (requestId: string) => {
        if (!confirm("ยืนยันว่าได้ดำเนินการแก้ไขออเดอร์/บริการเสริมเรียบร้อยแล้ว?")) return;
        try {
            setProcessingOrderRequest(true);
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};
            const res = await fetch("/api/order-requests/resolve", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ requestId, action: "complete", adminNote: "ดำเนินการเรียบร้อยแล้ว" })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to resolve");
            alert("บันทึกดำเนินการเรียบร้อยแล้ว");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(msg || "เกิดข้อผิดพลาด");
        } finally {
            setProcessingOrderRequest(false);
        }
    };

    const handleRejectOrderRequest = async (requestId: string) => {
        const reason = prompt("ระบุเหตุผลการปฏิเสธคำขอ:");
        if (reason === null) return;
        try {
            setProcessingOrderRequest(true);
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};
            const res = await fetch("/api/order-requests/resolve", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ requestId, action: "reject", adminNote: reason })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to reject");
            alert("ปฏิเสธคำขอเรียบร้อยแล้ว");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(msg || "เกิดข้อผิดพลาด");
        } finally {
            setProcessingOrderRequest(false);
        }
    };

    // Add-on management helpers
    const addItemAddOn = (itemIndex: number) => {
        setItemDrafts((prev) => prev.map((item, index) => {
            if (index !== itemIndex) return item;
            const currentAddOns = item.addOns || [];
            const newAddOn: OrderAddOnDraft = {
                id: `addon-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                name: "บริการเสริมใหม่",
                value: "",
                price: 0
            };
            return { ...item, addOns: [...currentAddOns, newAddOn] };
        }));
    };

    const removeItemAddOn = (itemIndex: number, addOnIndex: number) => {
        setItemDrafts((prev) => prev.map((item, index) => {
            if (index !== itemIndex) return item;
            return {
                ...item,
                addOns: (item.addOns || []).filter((_, aIdx) => aIdx !== addOnIndex)
            };
        }));
    };

    const addBundleAddOn = (itemIndex: number, bundleIndex: number) => {
        setItemDrafts((prev) => prev.map((item, iIdx) => {
            if (iIdx !== itemIndex) return item;
            return {
                ...item,
                bundleItems: (item.bundleItems || []).map((bundleItem, bIdx) => {
                    if (bIdx !== bundleIndex) return bundleItem;
                    const currentAddOns = bundleItem.selectedAddOns || [];
                    const newAddOn: OrderAddOnDraft = {
                        id: `addon-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        name: "บริการเสริมใหม่",
                        value: "",
                        price: 0
                    };
                    return { ...bundleItem, selectedAddOns: [...currentAddOns, newAddOn] };
                })
            };
        }));
    };

    const removeBundleAddOn = (itemIndex: number, bundleIndex: number, addOnIndex: number) => {
        setItemDrafts((prev) => prev.map((item, iIdx) => {
            if (iIdx !== itemIndex) return item;
            return {
                ...item,
                bundleItems: (item.bundleItems || []).map((bundleItem, bIdx) => {
                    if (bIdx !== bundleIndex) return bundleItem;
                    return {
                        ...bundleItem,
                        selectedAddOns: (bundleItem.selectedAddOns || []).filter((_, aIdx) => aIdx !== addOnIndex)
                    };
                })
            };
        }));
    };

    const handleSaveCustomerInfo = async () => {
        if (!order || savingCustomerInfo) return;
        const trimmedName = editCustomerName.trim();
        if (!trimmedName) {
            alert("ชื่อผู้รับไม่สามารถเว้นว่างได้");
            return;
        }
        try {
            setSavingCustomerInfo(true);
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};
            const res = await fetch("/api/admin/orders/update-customer-info", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({
                    orderId: order.id,
                    customerName: trimmedName,
                    customerPhone: editCustomerPhone.trim(),
                    shippingAddress: editShippingAddress.trim()
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update info");
            setIsEditingCustomerInfo(false);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(msg || "เกิดข้อผิดพลาด");
        } finally {
            setSavingCustomerInfo(false);
        }
    };

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
            if (!isEditingItems) {
                setItemDrafts(order.items.map((item) => ({
                    ...item,
                    addOns: item.addOns?.map((addOn) => ({ ...addOn })),
                    bundleItems: item.bundleItems?.map((bundleItem) => ({
                        ...bundleItem,
                        selectedAddOns: bundleItem.selectedAddOns?.map((addOn) => ({ ...addOn }))
                    }))
                })));
            }
            setIssueReplyDrafts(Object.fromEntries(
                order.items.flatMap((item, index) => [
                    [`${index}`, item.issueAdminReply || ""],
                    ...(item.bundleItems?.map((bundleItem, bundleIndex) => [
                        `${index}-${bundleIndex}`,
                        bundleItem.issueAdminReply || ""
                    ] as const) || [])
                ])
            ));
        }
    }, [order, isEditingItems]);

    const createdAt = useMemo(() => order ? toDate(order.createdAt) : new Date(), [order]);
    const pickupOptions = useMemo(() => getActivePickupOptions(storeSettings), [storeSettings]);

    const updateStatus = async (status: OrderStatus) => {
        if (!order || updatingStatus) return;
        try {
            setUpdatingStatus(status);
            const idToken = await auth?.currentUser?.getIdToken();
            const authHeaders: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};

            const res = await fetch("/api/orders/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({
                    orderId: order.id,
                    status,
                    paymentDetail: order.paymentDetail || null,
                    shippingDetail: order.shippingDetail || null,
                    trackingNumber: order.trackingNumber || null,
                    completionDetail: order.completionDetail || null,
                    cancelReason: order.cancelReason || null,
                    returnReason: order.returnReason || null
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Update failed");
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("Error updating status:", error);
            alert(`เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ${msg}`);
        } finally {
            setUpdatingStatus(null);
        }
    };

    const updateItemStatus = async (itemIndex: number, status: OrderItemStatus) => {
        if (!order || updatingItemKey) return;
        const itemKey = `${order.id}-${itemIndex}`;
        const nextItems = order.items.map((item, index) => {
            if (index !== itemIndex) return item;
            const updatedItem: OrderItem = {
                ...item,
                status
            };
            if (item.bundleItems && Array.isArray(item.bundleItems)) {
                updatedItem.bundleItems = item.bundleItems.map((bundleItem) => applyPickupOption({
                    ...bundleItem,
                    status
                }, status, pickupOptions));
            } else {
                delete updatedItem.bundleItems;
            }
            return applyPickupOption(updatedItem, status, pickupOptions);
        });

        const safeItems = cleanForFirestore(nextItems);

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: safeItems,
                updatedAt: serverTimestamp()
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("Error updating item status:", error);
            alert(`เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ${msg}`);
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const updateBundleItemStatus = async (itemIndex: number, bundleItemIndex: number, status: OrderItemStatus) => {
        if (!order || updatingItemKey) return;
        const itemKey = `${order.id}-${itemIndex}-${bundleItemIndex}`;
        const nextItems = order.items.map((item, index) => {
            if (index !== itemIndex) return item;
            const updatedItem: OrderItem = { ...item };
            if (item.bundleItems && Array.isArray(item.bundleItems)) {
                updatedItem.bundleItems = item.bundleItems.map((bundleItem, idx) => (
                    idx === bundleItemIndex ? applyPickupOption({ ...bundleItem, status }, status, pickupOptions) : bundleItem
                ));
            } else {
                delete updatedItem.bundleItems;
            }
            return updatedItem;
        });

        const safeItems = cleanForFirestore(nextItems);

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: safeItems,
                updatedAt: serverTimestamp()
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("Error updating bundle item status:", error);
            alert(`เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ${msg}`);
        } finally {
            setUpdatingItemKey(null);
        }
    };

    const updateItemPickup = async (itemIndex: number, pickupOptionId: string) => {
        if (!order || updatingItemKey) return;
        const pickupOption = pickupOptions.find(option => option.id === pickupOptionId);
        if (!pickupOption) return;

        const itemKey = `${order.id}-${itemIndex}-pickup`;
        const nextItems = order.items.map((item, index) => {
            if (index !== itemIndex) return item;
            const updatedItem: OrderItem = {
                ...item,
                status: "ready" as OrderItemStatus,
                pickupOptionId: pickupOption.id,
                pickupLabel: pickupOption.label,
                pickupDetail: pickupOption.detail || null
            };
            if (item.bundleItems && Array.isArray(item.bundleItems)) {
                updatedItem.bundleItems = item.bundleItems.map((bundleItem) => ({
                    ...bundleItem,
                    status: "ready" as OrderItemStatus,
                    pickupOptionId: pickupOption.id,
                    pickupLabel: pickupOption.label,
                    pickupDetail: pickupOption.detail || null
                }));
            } else {
                delete updatedItem.bundleItems;
            }
            return updatedItem;
        });

        const safeItems = cleanForFirestore(nextItems);

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: safeItems,
                updatedAt: serverTimestamp()
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("Error updating item pickup:", error);
            alert(`เกิดข้อผิดพลาด: ${msg}`);
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
            const updatedItem: OrderItem = { ...item };
            if (item.bundleItems && Array.isArray(item.bundleItems)) {
                updatedItem.bundleItems = item.bundleItems.map((bundleItem, bIdx) => (
                    bIdx === bundleItemIndex
                        ? {
                            ...bundleItem,
                            status: "ready" as OrderItemStatus,
                            pickupOptionId: pickupOption.id,
                            pickupLabel: pickupOption.label,
                            pickupDetail: pickupOption.detail || null
                        }
                        : bundleItem
                ));
            } else {
                delete updatedItem.bundleItems;
            }
            return updatedItem;
        });

        const safeItems = cleanForFirestore(nextItems);

        try {
            setUpdatingItemKey(itemKey);
            await updateDoc(doc(db, "orders", order.id), {
                items: safeItems,
                updatedAt: serverTimestamp()
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("Error updating bundle pickup:", error);
            alert(`เกิดข้อผิดพลาด: ${msg}`);
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
                bundleItems: (item.bundleItems || []).map((bundleItem, childIndex) => (
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
        setItemDrafts((prev) => prev.map((item, iIdx) => {
            if (iIdx !== itemIndex) return item;
            return {
                ...item,
                addOns: (item.addOns || []).map((addOn, aIdx) => (
                    aIdx === addOnIndex ? { ...addOn, ...updates } : addOn
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
        setItemDrafts((prev) => prev.map((item, iIdx) => {
            if (iIdx !== itemIndex) return item;
            return {
                ...item,
                bundleItems: (item.bundleItems || []).map((bundleItem, bIdx) => {
                    if (bIdx !== bundleItemIndex) return bundleItem;
                    return {
                        ...bundleItem,
                        selectedAddOns: (bundleItem.selectedAddOns || []).map((addOn, aIdx) => (
                            aIdx === addOnIndex ? { ...addOn, ...updates } : addOn
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
            const cleanedItem: Record<string, unknown> = {
                productId: item.productId || "",
                productName: item.productName.trim() || "สินค้า",
                price,
                finalPrice: price,
                quantity,
            };

            if (item.variantInfo?.trim()) cleanedItem.variantInfo = item.variantInfo.trim();
            if (item.imageUrl) cleanedItem.imageUrl = item.imageUrl;
            if (item.status) cleanedItem.status = item.status;
            if (item.pickupOptionId) cleanedItem.pickupOptionId = item.pickupOptionId;
            if (item.pickupLabel) cleanedItem.pickupLabel = item.pickupLabel;
            if (item.pickupDetail) cleanedItem.pickupDetail = item.pickupDetail;
            if (item.issueReason) cleanedItem.issueReason = item.issueReason;
            if (item.issueReportedAt) cleanedItem.issueReportedAt = item.issueReportedAt;
            if (item.issueReportedByCustomer !== undefined) cleanedItem.issueReportedByCustomer = item.issueReportedByCustomer;
            if (item.issueAdminReply) cleanedItem.issueAdminReply = item.issueAdminReply;
            if (item.issueAdminRepliedAt) cleanedItem.issueAdminRepliedAt = item.issueAdminRepliedAt;

            if (item.addOns && item.addOns.length > 0) {
                cleanedItem.addOns = item.addOns.map((addOn) => ({
                    id: addOn.id || "",
                    name: addOn.name.trim() || "บริการเสริม",
                    value: addOn.value?.trim() || "",
                    price: toNumber(addOn.price)
                }));
            }

            if (item.bundleItems && item.bundleItems.length > 0) {
                cleanedItem.bundleItems = item.bundleItems.map((bundleItem) => {
                    const cleanedBundle: Record<string, unknown> = {
                        id: bundleItem.id || "",
                        productId: bundleItem.productId || "",
                        productName: bundleItem.productName.trim() || "สินค้าในเซต",
                        variantName: bundleItem.variantName?.trim() || "",
                        unitPrice: toNumber(bundleItem.unitPrice),
                        quantity: Math.max(1, toNumber(bundleItem.quantity))
                    };
                    if (bundleItem.variantId) cleanedBundle.variantId = bundleItem.variantId;
                    if (bundleItem.status) cleanedBundle.status = bundleItem.status;
                    if (bundleItem.pickupOptionId) cleanedBundle.pickupOptionId = bundleItem.pickupOptionId;
                    if (bundleItem.pickupLabel) cleanedBundle.pickupLabel = bundleItem.pickupLabel;
                    if (bundleItem.pickupDetail) cleanedBundle.pickupDetail = bundleItem.pickupDetail;
                    if (bundleItem.issueReason) cleanedBundle.issueReason = bundleItem.issueReason;
                    if (bundleItem.issueReportedAt) cleanedBundle.issueReportedAt = bundleItem.issueReportedAt;
                    if (bundleItem.issueReportedByCustomer !== undefined) cleanedBundle.issueReportedByCustomer = bundleItem.issueReportedByCustomer;
                    if (bundleItem.issueAdminReply) cleanedBundle.issueAdminReply = bundleItem.issueAdminReply;
                    if (bundleItem.issueAdminRepliedAt) cleanedBundle.issueAdminRepliedAt = bundleItem.issueAdminRepliedAt;

                    if (bundleItem.selectedAddOns && bundleItem.selectedAddOns.length > 0) {
                        cleanedBundle.selectedAddOns = bundleItem.selectedAddOns.map((addOn) => ({
                            id: addOn.id || "",
                            name: addOn.name.trim() || "บริการเสริม",
                            value: addOn.value?.trim() || "",
                            price: toNumber(addOn.price)
                        }));
                    }
                    return cleanedBundle;
                });
            }

            return cleanedItem as unknown as OrderItem;
        });

        const totalAmount = calculateItemsTotal(normalizedItems) + toNumber(order.deliveryFee);
        const safeItems = cleanForFirestore(normalizedItems);

        try {
            setSavingItems(true);
            await updateDoc(doc(db, "orders", order.id), {
                items: safeItems,
                totalAmount,
                updatedAt: serverTimestamp()
            });
            setIsEditingItems(false);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("Failed to save items:", error);
            alert(`บันทึกรายการสินค้าไม่สำเร็จ: ${msg}`);
        } finally {
            setSavingItems(false);
        }
    };

    const cancelItemEditing = () => {
        if (!order) return;
        setItemDrafts(order.items.map((item) => ({
            ...item,
            addOns: item.addOns?.map((addOn) => ({ ...addOn })),
            bundleItems: item.bundleItems?.map((bundleItem) => ({
                ...bundleItem,
                selectedAddOns: bundleItem.selectedAddOns?.map((addOn) => ({ ...addOn }))
            }))
        })));
        setIsEditingItems(false);
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

        const safeItems = cleanForFirestore(nextItems);

        try {
            setSavingIssueReplyKey(`${order.id}-${draftKey}`);
            await updateDoc(doc(db, "orders", order.id), {
                items: safeItems,
                updatedAt: serverTimestamp()
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("Error saving issue reply:", error);
            alert(`บันทึกคำตอบกลับไม่สำเร็จ: ${msg}`);
        } finally {
            setSavingIssueReplyKey(null);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="animate-spin text-slate-500" size={24} />
                <p className="text-xs font-medium text-slate-500">กำลังโหลดคำสั่งซื้อ...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="mx-auto max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-xs">
                <ShoppingBagFallback />
                <p className="mt-3 text-sm font-semibold text-slate-800">ไม่พบคำสั่งซื้อ</p>
                <p className="mt-1 text-xs text-slate-400">คำสั่งซื้อนี้อาจถูกลบหรือไม่มีอยู่ในระบบ</p>
                <Link
                    href="/orders"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
                >
                    <ChevronLeft size={14} />
                    กลับหน้ารายการคำสั่งซื้อ
                </Link>
            </div>
        );
    }

    const status = statusConfig[order.status];

    return (
        <div className="mx-auto max-w-7xl space-y-4">
            {/* Top Bar: Navigation, Monospace Order ID & Status Transitions */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href="/orders"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-800"
                        >
                            <ChevronLeft size={14} />
                            คำสั่งซื้อ
                        </Link>
                        <span className="text-slate-300">/</span>
                        <span className="rounded-md border border-slate-200/80 bg-slate-100/80 px-2 py-0.5 font-mono text-xs font-bold text-slate-800">
                            #{formatOrderId(order, 8)}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.badge}`}>
                            {status.icon}
                            {status.label}
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                        สร้างเมื่อ {format(createdAt, "d MMMM yyyy HH:mm น.", { locale: th })}
                    </p>
                </div>

                {/* Status Segmented Control */}
                <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/60 bg-slate-100/70 p-1">
                    {statusOrder.map((nextStatus) => {
                        const config = statusConfig[nextStatus];
                        const isActive = order.status === nextStatus;
                        return (
                            <button
                                key={nextStatus}
                                type="button"
                                onClick={() => updateStatus(nextStatus)}
                                disabled={isActive || Boolean(updatingStatus)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all disabled:cursor-not-allowed ${
                                    isActive
                                        ? `border border-slate-200/80 bg-white shadow-xs font-semibold ${config.color}`
                                        : "border border-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900"
                                }`}
                            >
                                {updatingStatus === nextStatus ? <Loader2 size={11} className="animate-spin" /> : config.icon}
                                {config.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Pending Order Edit Request Banner */}
            {pendingOrderRequest && (
                <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 p-3 sm:p-3.5 backdrop-blur-xs shadow-xs">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-2.5">
                            <div className="mt-0.5 shrink-0 rounded-lg bg-blue-100/80 p-1.5 text-blue-700">
                                <Package size={15} />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-semibold text-blue-800">คำขอแก้ไขออเดอร์ / บริการเสริมจากลูกค้า</span>
                                    <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-medium text-blue-700">รอตรวจสอบ</span>
                                </div>
                                <p className="mt-0.5 text-xs text-slate-800">
                                    {pendingOrderRequest.itemName && <span className="text-slate-500">สินค้า: {pendingOrderRequest.itemName} — </span>}
                                    สิ่งที่ขอแก้ไข: <span className="font-semibold text-blue-900">{pendingOrderRequest.details}</span>
                                </p>
                                {pendingOrderRequest.reason && (
                                    <p className="mt-0.5 text-[11px] text-slate-500">เหตุผล: {pendingOrderRequest.reason}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
                            <button
                                type="button"
                                disabled={processingOrderRequest}
                                onClick={() => handleRejectOrderRequest(pendingOrderRequest.id)}
                                className="h-7 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                                ปฏิเสธ
                            </button>
                            <button
                                type="button"
                                disabled={processingOrderRequest}
                                onClick={() => handleResolveOrderRequest(pendingOrderRequest.id)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                            >
                                {processingOrderRequest ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={12} />}
                                บันทึกเรียบร้อย
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content: 2 Columns */}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                {/* Left Column: Customer, Shipping & Status Info */}
                <div className="space-y-4">
                    {/* Customer Information Card */}
                    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                            <div className="flex items-center gap-2">
                                <User size={14} className="text-slate-500" />
                                <span className="text-xs font-semibold text-slate-700">ข้อมูลลูกค้า</span>
                            </div>
                            {!isEditingCustomerInfo ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditCustomerName(order.customerName || "");
                                        setEditCustomerPhone(order.customerPhone || "");
                                        setEditShippingAddress(order.shippingAddress || "");
                                        setIsEditingCustomerInfo(true);
                                    }}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
                                >
                                    <Pencil size={11} />
                                    แก้ไขข้อมูล
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        disabled={savingCustomerInfo}
                                        onClick={() => setIsEditingCustomerInfo(false)}
                                        className="h-6.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="button"
                                        disabled={savingCustomerInfo}
                                        onClick={handleSaveCustomerInfo}
                                        className="inline-flex h-6.5 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                    >
                                        {savingCustomerInfo && <Loader2 size={10} className="animate-spin" />}
                                        บันทึก
                                    </button>
                                </div>
                            )}
                        </div>

                        {isEditingCustomerInfo ? (
                            <div className="space-y-3 p-3.5">
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium text-slate-600">
                                        ชื่อผู้รับ <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editCustomerName}
                                        onChange={(e) => setEditCustomerName(e.target.value)}
                                        className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                                        placeholder="ชื่อ-นามสกุล"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium text-slate-600">เบอร์โทร</label>
                                    <input
                                        type="tel"
                                        value={editCustomerPhone}
                                        onChange={(e) => setEditCustomerPhone(e.target.value)}
                                        className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                                        placeholder="08xxxxxxxx"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium text-slate-600">ที่อยู่จัดส่ง</label>
                                    <textarea
                                        rows={3}
                                        value={editShippingAddress}
                                        onChange={(e) => setEditShippingAddress(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 p-2 text-xs text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
                                        placeholder="รายละเอียดที่อยู่จัดส่ง"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 p-3.5">
                                {getLineName(order) && (
                                    <div>
                                        <p className="text-[11px] font-medium text-slate-400">LINE Name</p>
                                        <div className="mt-0.5 inline-flex items-center gap-1 rounded-md border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                            {getLineName(order)}
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <InfoItem label="ชื่อผู้รับ" value={order.customerName} />
                                    <InfoItem label="เบอร์โทร" value={order.customerPhone} />
                                </div>
                                {order.customerCitizenId && (
                                    <InfoItem label="เลขบัตรประชาชน" value={order.customerCitizenId} />
                                )}
                                <div>
                                    <p className="text-[11px] font-medium text-slate-400">Customer ID</p>
                                    <p className="mt-0.5 truncate rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1 font-mono text-[11px] text-slate-500">
                                        {order.customerId || order.userId || "-"}
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Shipping Address Card */}
                    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
                        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                            <MapPin size={14} className="text-slate-500" />
                            <span className="text-xs font-semibold text-slate-700">ที่อยู่จัดส่ง</span>
                        </div>
                        <div className="p-3.5">
                            <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700">
                                {order.shippingAddress || "ไม่ระบุ (รับเอง)"}
                            </p>
                            <div className="mt-2.5 flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50/70 p-2.5 text-xs">
                                <span className="font-medium text-slate-600">{order.shippingOptionName || "ค่าจัดส่ง"}</span>
                                <span className="font-mono font-semibold text-slate-900">
                                    {order.deliveryFee ? `฿${order.deliveryFee.toLocaleString()}` : "ฟรี"}
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Status Details Card */}
                    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
                        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
                            <Clock size={14} className="text-slate-500" />
                            <span className="text-xs font-semibold text-slate-700">รายละเอียดสถานะ</span>
                        </div>
                        <div className="divide-y divide-slate-100/80">
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

                {/* Right Column: Order Items, Draft Editor & Totals */}
                <div className="space-y-4">
                    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
                        <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <Package size={15} className="text-slate-500" />
                                <span className="text-xs font-semibold text-slate-800">รายการสินค้า</span>
                                <span className="rounded-full border border-slate-200/70 bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-600">
                                    {itemDrafts.length} รายการ
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {isEditingItems ? (
                                    <>
                                        <button
                                            type="button"
                                            onClick={cancelItemEditing}
                                            disabled={savingItems}
                                            className="h-7 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveItemDrafts}
                                            disabled={savingItems}
                                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                                        >
                                            {savingItems && <Loader2 size={11} className="animate-spin" />}
                                            บันทึกรายการสินค้า
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingItems(true)}
                                        className="h-7 rounded-lg bg-slate-900 px-2.5 text-xs font-medium text-white transition hover:bg-slate-800"
                                    >
                                        แก้ไขรายการ
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2.5 bg-slate-50/40 p-3">
                            {itemDrafts.map((item, index) => (
                                <div key={`${item.productId}-${index}`} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs transition hover:border-slate-300/70">
                                    <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_112px_84px_96px] xl:items-end">
                                        <div className="min-w-0 space-y-1.5">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <input
                                                    value={item.productName}
                                                    onChange={(event) => updateItemDraft(index, { productName: event.target.value })}
                                                    disabled={!isEditingItems}
                                                    className="h-7.5 min-w-[150px] max-w-[260px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:border-slate-100 disabled:bg-slate-50/60 disabled:text-slate-900"
                                                    aria-label="ชื่อสินค้า"
                                                />
                                                {item.status && (
                                                    <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-medium ${itemStatusConfig[item.status].badge}`}>
                                                        {itemStatusConfig[item.status].icon}
                                                        {itemStatusConfig[item.status].label}
                                                    </span>
                                                )}
                                                <select
                                                    value={isSelectableItemStatus(item.status) ? item.status : ""}
                                                    onChange={(event) => updateItemStatus(index, event.target.value as OrderItemStatus)}
                                                    disabled={updatingItemKey === `${order.id}-${index}`}
                                                    className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                                                    aria-label={`สถานะสินค้า ${item.productName}`}
                                                >
                                                    <option value="" disabled>เลือกสถานะ</option>
                                                    {selectableItemStatuses.map((st) => (
                                                        <option key={st} value={st}>
                                                            {itemStatusConfig[st].label}
                                                        </option>
                                                    ))}
                                                </select>
                                                {item.status === "ready" && pickupOptions.length > 0 && (
                                                    <select
                                                        value={item.pickupOptionId || pickupOptions[0]?.id || ""}
                                                        onChange={(event) => updateItemPickup(index, event.target.value)}
                                                        disabled={updatingItemKey === `${order.id}-${index}-pickup`}
                                                        className="h-7 min-w-[180px] rounded-md border border-emerald-200 bg-emerald-50/70 px-2 text-[11px] font-semibold text-emerald-800 outline-none transition focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                                                placeholder="ตัวเลือกสินค้า (ถ้ามี)"
                                                disabled={!isEditingItems}
                                                className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:border-slate-100 disabled:bg-slate-50/60 disabled:text-slate-500"
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
                                        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-right">
                                            <p className="text-[10px] font-medium text-slate-400">รวม</p>
                                            <p className="font-mono text-xs font-bold text-slate-900">
                                                ฿{(toNumber(item.finalPrice ?? item.price) * toNumber(item.quantity)).toLocaleString()}
                                            </p>
                                        </div>

                                        {/* Add-ons List */}
                                        <div className="space-y-1.5 xl:col-span-4">
                                            {item.addOns && item.addOns.length > 0 ? (
                                                <div className="space-y-1.5">
                                                    {item.addOns.map((addOn, addOnIndex) => (
                                                        <AddOnEditor
                                                            key={addOn.id || `item-${index}-addon-${addOnIndex}`}
                                                            addOn={addOn}
                                                            disabled={!isEditingItems}
                                                            onDelete={() => removeItemAddOn(index, addOnIndex)}
                                                            onChange={(updates) => updateItemAddOnDraft(index, addOnIndex, updates)}
                                                        />
                                                    ))}
                                                </div>
                                            ) : null}
                                            {isEditingItems && (
                                                <button
                                                    type="button"
                                                    onClick={() => addItemAddOn(index)}
                                                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50/70 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-100"
                                                >
                                                    <Plus size={11} />
                                                    เพิ่มบริการเสริม
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bundle Items Sub-section */}
                                    {item.bundleItems?.length ? (
                                        <div className="mt-2.5 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/60">
                                            <div className="border-b border-slate-200/70 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
                                                รายการในเซต
                                            </div>
                                            <div className="space-y-1.5 p-2">
                                                {item.bundleItems.map((bundleItem, bundleIndex) => (
                                                    <div key={`${bundleItem.id}-${bundleIndex}`} className="grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200/70 bg-white p-2 text-xs xl:grid-cols-[minmax(0,1fr)_92px_74px_88px] xl:items-end">
                                                        <div className="space-y-1">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <input
                                                                    value={bundleItem.productName}
                                                                    onChange={(event) => updateBundleItemDraft(index, bundleIndex, { productName: event.target.value })}
                                                                    disabled={!isEditingItems}
                                                                    className="h-6.5 min-w-[110px] max-w-[170px] flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:border-slate-100 disabled:bg-slate-50/60 disabled:text-slate-900"
                                                                    aria-label="ชื่อสินค้าในเซต"
                                                                />
                                                                {bundleItem.status && (
                                                                    <span className={`inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium ${itemStatusConfig[bundleItem.status].badge}`}>
                                                                        {itemStatusConfig[bundleItem.status].icon}
                                                                        {itemStatusConfig[bundleItem.status].label}
                                                                    </span>
                                                                )}
                                                                <select
                                                                    value={isSelectableItemStatus(bundleItem.status) ? bundleItem.status : ""}
                                                                    onChange={(event) => updateBundleItemStatus(index, bundleIndex, event.target.value as OrderItemStatus)}
                                                                    disabled={updatingItemKey === `${order.id}-${index}-${bundleIndex}`}
                                                                    className="h-6.5 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    aria-label={`สถานะสินค้าในเซต ${bundleItem.productName}`}
                                                                >
                                                                    <option value="" disabled>รายชิ้น</option>
                                                                    {selectableItemStatuses.map((st) => (
                                                                        <option key={st} value={st}>
                                                                            {itemStatusConfig[st].label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                {bundleItem.status === "ready" && pickupOptions.length > 0 && (
                                                                    <select
                                                                        value={bundleItem.pickupOptionId || pickupOptions[0]?.id || ""}
                                                                        onChange={(event) => updateBundleItemPickup(index, bundleIndex, event.target.value)}
                                                                        disabled={updatingItemKey === `${order.id}-${index}-${bundleIndex}-pickup`}
                                                                        className="h-6.5 min-w-[160px] rounded-md border border-emerald-200 bg-emerald-50/70 px-2 text-[10px] font-semibold text-emerald-800 outline-none transition focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                                                                className="h-6.5 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:border-slate-100 disabled:bg-slate-50/60 disabled:text-slate-500"
                                                                aria-label="ตัวเลือกสินค้าในเซต"
                                                            />
                                                            <div className="mt-1 space-y-1">
                                                                {bundleItem.selectedAddOns && bundleItem.selectedAddOns.length > 0 ? (
                                                                    <div className="space-y-1">
                                                                        {bundleItem.selectedAddOns.map((addOn, addOnIndex) => (
                                                                            <AddOnEditor
                                                                                key={addOn.id || `bundle-${index}-${bundleIndex}-addon-${addOnIndex}`}
                                                                                addOn={addOn}
                                                                                disabled={!isEditingItems}
                                                                                compact
                                                                                onDelete={() => removeBundleAddOn(index, bundleIndex, addOnIndex)}
                                                                                onChange={(updates) => updateBundleAddOnDraft(index, bundleIndex, addOnIndex, updates)}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                ) : null}
                                                                {isEditingItems && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => addBundleAddOn(index, bundleIndex)}
                                                                        className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
                                                                    >
                                                                        <Plus size={10} />
                                                                        เพิ่มบริการเสริมในเซต
                                                                    </button>
                                                                )}
                                                            </div>
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
                                                        <div className="rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1 text-right">
                                                            <p className="text-[10px] font-medium text-slate-400">รวม</p>
                                                            <p className="font-mono text-xs font-semibold text-slate-700">
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

                                    {/* Parent Item Issue Reply */}
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

                        {/* Grand Total Footer */}
                        <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/70 px-4 py-3">
                            <div>
                                <span className="text-xs font-semibold text-slate-700">ยอดรวมทั้งสิ้น</span>
                                <span className="ml-2 text-[11px] text-slate-400">
                                    (สินค้า ฿{calculateItemsTotal(itemDrafts).toLocaleString()} + จัดส่ง {order.deliveryFee ? `฿${toNumber(order.deliveryFee).toLocaleString()}` : "฿0"})
                                </span>
                            </div>
                            <span className="font-mono text-lg font-bold text-slate-900">
                                ฿{(calculateItemsTotal(itemDrafts) + toNumber(order.deliveryFee)).toLocaleString()}
                            </span>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

function InfoItem({ label, value, className = "" }: { label: string; value?: string | null; className?: string }) {
    return (
        <div className={className}>
            <p className="text-[11px] font-medium text-slate-400">{label}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-800">{value || "-"}</p>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3 px-3.5 py-2">
            <span className="shrink-0 text-[11px] font-medium text-slate-400">{label}</span>
            <span className="whitespace-pre-line text-right font-mono text-xs font-medium text-slate-700">{value}</span>
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
            <span className="mb-0.5 block text-[10px] font-medium text-slate-400">{label}</span>
            <input
                type="number"
                min={0}
                value={value}
                onChange={(event) => onChange(toNumber(event.target.value))}
                disabled={disabled}
                className={`${compact ? "h-6.5 text-[11px]" : "h-7.5 text-xs"} w-full rounded-lg border border-slate-200 bg-white px-2 text-right font-mono font-semibold text-slate-800 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:border-slate-100 disabled:bg-slate-50/70 disabled:text-slate-800`}
            />
        </label>
    );
}

function AddOnEditor({
    addOn,
    onChange,
    onDelete,
    disabled,
    compact = false
}: {
    addOn: OrderAddOnDraft;
    onChange: (updates: Partial<OrderAddOnDraft>) => void;
    onDelete?: () => void;
    disabled: boolean;
    compact?: boolean;
}) {
    return (
        <div className={`grid grid-cols-1 items-center gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50/60 p-1.5 ${
            !disabled && onDelete
                ? (compact ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_65px_26px]" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_75px_28px]")
                : (compact ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_70px]" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_84px]")
        }`}>
            <input
                value={addOn.name}
                onChange={(event) => onChange({ name: event.target.value })}
                disabled={disabled}
                placeholder="ชื่อบริการเสริม"
                className="h-6.5 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:border-slate-100 disabled:bg-white disabled:text-slate-700"
                aria-label="ชื่อบริการเสริม"
            />
            <input
                value={addOn.value || ""}
                onChange={(event) => onChange({ value: event.target.value })}
                disabled={disabled}
                placeholder="รายละเอียด/ค่า"
                className="h-6.5 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:border-slate-100 disabled:bg-white disabled:text-slate-600"
                aria-label="ค่าบริการเสริม"
            />
            <input
                type="number"
                min={0}
                value={toNumber(addOn.price)}
                onChange={(event) => onChange({ price: toNumber(event.target.value) })}
                disabled={disabled}
                placeholder="ราคา"
                className="h-6.5 rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-[11px] font-semibold text-slate-800 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-300 disabled:border-slate-100 disabled:bg-white disabled:text-slate-800"
                aria-label="ราคาบริการเสริม"
            />
            {!disabled && onDelete && (
                <button
                    type="button"
                    onClick={onDelete}
                    title="ลบบริการเสริม"
                    className="flex h-6.5 w-6.5 items-center justify-center rounded-md border border-rose-200/80 bg-white text-rose-500 transition hover:bg-rose-50 hover:text-rose-700"
                >
                    <Trash2 size={12} />
                </button>
            )}
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
        <div className={`mt-2 rounded-xl border border-amber-200/80 bg-amber-50/40 ${compact ? "p-2" : "p-2.5"}`}>
            <div className={`grid gap-2 ${compact ? "lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)]"}`}>
                <div className="min-w-0 text-[11px]">
                    <p className="font-semibold text-amber-900">แจ้งปัญหาจากลูกค้า</p>
                    <p className="mt-0.5 whitespace-pre-line leading-relaxed text-amber-800">{reason || "ไม่มีข้อความจากลูกค้า"}</p>
                    {reportedAt && (
                        <p className="mt-1 text-[10px] text-amber-600">
                            {new Date(reportedAt).toLocaleString("th-TH")}
                        </p>
                    )}
                </div>
                <div className="min-w-0">
                    <textarea
                        value={draftValue}
                        onChange={(event) => onDraftChange(event.target.value)}
                        rows={compact ? 2 : 3}
                        className="w-full resize-y rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                        placeholder="ตอบกลับลูกค้า..."
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] text-slate-400">
                            {repliedAt ? `ตอบล่าสุด ${new Date(repliedAt).toLocaleString("th-TH")}` : reply ? "มีข้อความตอบกลับแล้ว" : "ยังไม่ได้ตอบ"}
                        </span>
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={isSaving}
                            className="inline-flex h-6.5 shrink-0 items-center justify-center gap-1 rounded-md bg-amber-700 px-2.5 text-[11px] font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving && <Loader2 size={10} className="animate-spin" />}
                            บันทึก
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ShoppingBagFallback() {
    return (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Package size={22} />
        </div>
    );
}
