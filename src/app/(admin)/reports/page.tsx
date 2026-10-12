"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, OrderStatus } from "@/types/order";
import { formatOrderId } from "@/lib/orderId";
import {
    BarChart3,
    CalendarDays,
    Download,
    Package,
    ReceiptText,
    ShoppingBag,
    TrendingUp,
    X,
    Filter
} from "lucide-react";

type ReportOrder = Order & {
    paymentMethod?: string;
    paymentStatus?: string;
    subTotal?: number;
    totalDiscount?: number;
    paidAt?: Date | null;
    paymentVerifiedAt?: Date | null;
};

type ProductReportRow = {
    key: string;
    productName: string;
    variantInfo: string;
    addOns: string;
    quantity: number;
    grossSales: number;
    orderCount: number;
};

type SlipDoc = {
    id: string;
    orderId?: string;
    verifyStatus?: string;
    verifyMessage?: string;
    verifiedAt?: unknown;
    createdAt?: unknown;
    imageUrl?: string;
    base64?: string;
};

const revenueStatuses: OrderStatus[] = ["paid", "shipped", "completed"];

const toDateInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const getStartOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
};

const toDate = (value: unknown) => {
    if (value instanceof Date) return value;
    if (value instanceof Timestamp) return value.toDate();
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
        return (value as { toDate: () => Date }).toDate();
    }
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date(0);
};

const formatMoney = (value: number) => `฿${value.toLocaleString("th-TH")}`;

const csvEscape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = (filename: string, rows: Array<Array<unknown>>) => {
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

type ReportAddOn = {
    name?: string;
    value?: string;
    price?: number;
};

const formatAddOns = (addOns?: ReportAddOn[]) => {
    if (!addOns?.length) return "";
    return addOns
        .map((addOn) => {
            const name = addOn.name || "Add-on";
            const value = addOn.value ? `: ${addOn.value}` : "";
            const price = Number(addOn.price || 0);
            const priceText = price > 0 ? ` (+THB ${price.toLocaleString("th-TH")})` : "";
            return `${name}${value}${priceText}`;
        })
        .join(" | ");
};

const formatItemAddOns = (item: Order["items"][number]) => {
    const parts: string[] = [];
    const itemAddOns = formatAddOns(item.addOns);
    if (itemAddOns) parts.push(itemAddOns);

    (item.bundleItems || []).forEach((bundleItem) => {
        let text = bundleItem.productName || "Bundle item";
        if (bundleItem.variantName) {
            text += ` (${bundleItem.variantName})`;
        }
        text += ` x${bundleItem.quantity || 1}`;

        const bundleAddOns = formatAddOns(bundleItem.selectedAddOns);
        if (bundleAddOns) {
            text += ` + [${bundleAddOns}]`;
        }
        parts.push(text);
    });

    return parts.join(" || ");
};

const formatOrderAddOns = (order: Order) => {
    return (order.items || [])
        .map((item) => {
            const addOns = formatItemAddOns(item);
            return addOns ? `${item.productName || "Product"} - ${addOns}` : "";
        })
        .filter(Boolean)
        .join(" || ");
};

const ORDER_COLUMNS = [
    { key: "id", label: "เลขคำสั่งซื้อ (Order ID)", getValue: (order: ReportOrder) => formatOrderId(order, 12) },
    { key: "createdAt", label: "วันที่สั่งซื้อ (Date)", getValue: (order: ReportOrder) => toDate(order.createdAt).toLocaleString("th-TH") },
    { key: "customerName", label: "ชื่อลูกค้า (Customer)", getValue: (order: ReportOrder) => order.customerName || "" },
    { key: "customerPhone", label: "เบอร์โทรศัพท์ (Phone)", getValue: (order: ReportOrder) => order.customerPhone || "" },
    { key: "status", label: "สถานะคำสั่งซื้อ (Status)", getValue: (order: ReportOrder) => order.status },
    { key: "paymentMethod", label: "ช่องทางการชำระเงิน (Payment Method)", getValue: (order: ReportOrder) => order.paymentMethod || "" },
    { key: "paymentStatus", label: "สถานะชำระเงิน (Payment Status)", getValue: (order: ReportOrder) => order.paymentStatus || "" },
    {
        key: "paymentDetail",
        label: "รายละเอียดการชำระเงิน (Payment Detail)",
        getValue: (order: ReportOrder, slipsMap?: Map<string, SlipDoc>) => {
            if (order.paymentDetail) return order.paymentDetail;
            const slip = slipsMap?.get(order.id);
            if (slip?.verifyMessage) return slip.verifyMessage;
            if (order.paymentStatus === "verified") return "ตรวจสอบผ่าน SlipOK";
            return "";
        }
    },
    {
        key: "paidAt",
        label: "เวลาชำระเงิน (Payment Time)",
        getValue: (order: ReportOrder, slipsMap?: Map<string, SlipDoc>) => {
            const rawPaidAt = order.paidAt || order.paymentVerifiedAt;
            if (rawPaidAt) return toDate(rawPaidAt).toLocaleString("th-TH");
            const slip = slipsMap?.get(order.id);
            if (slip?.verifiedAt) return toDate(slip.verifiedAt).toLocaleString("th-TH");
            if (slip?.createdAt) return toDate(slip.createdAt).toLocaleString("th-TH");
            return "";
        }
    },
    {
        key: "slipUrl",
        label: "ลิงก์รูปสลิป (Slip URL)",
        getValue: (order: ReportOrder, slipsMap?: Map<string, SlipDoc>) => {
            if (order.slipUrl) return order.slipUrl;
            const slip = slipsMap?.get(order.id);
            return slip?.imageUrl || slip?.base64 || "";
        }
    },
    { key: "itemsCount", label: "จำนวนรายการสินค้า (Items)", getValue: (order: ReportOrder) => (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0) },
    { key: "addOns", label: "รายละเอียดสินค้าและท็อปปิ้ง (Add-ons)", getValue: (order: ReportOrder) => formatOrderAddOns(order) },
    { key: "subTotal", label: "ยอดเงินรวมสินค้า (Subtotal)", getValue: (order: ReportOrder) => Number(order.subTotal || 0) },
    { key: "totalDiscount", label: "ส่วนลดรวม (Discount)", getValue: (order: ReportOrder) => Number(order.totalDiscount || 0) },
    { key: "deliveryFee", label: "ค่าจัดส่ง (Delivery)", getValue: (order: ReportOrder) => Number(order.deliveryFee || 0) },
    { key: "totalAmount", label: "ยอดรวมสุทธิ (Total)", getValue: (order: ReportOrder) => Number(order.totalAmount || 0) },
    {
        key: "selectedProductQty",
        label: "จำนวนสินค้านี้ในออเดอร์ (Selected Item Qty)",
        getValue: (order: ReportOrder, _slipsMap?: Map<string, SlipDoc>, selectedKey?: string | null) => {
            if (!selectedKey) return "-";
            const items = (order.items || []).filter((item) => {
                const variantInfo = typeof item.variantInfo === "string" ? item.variantInfo : "";
                const addOns = formatItemAddOns(item);
                const key = `${item.productId || item.productName}|${variantInfo}|${addOns}`;
                return key === selectedKey;
            });
            return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        }
    },
];

export default function AdminReportsPage() {
    const [orders, setOrders] = useState<ReportOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(toDateInputValue(getStartOfMonth()));
    const [endDate, setEndDate] = useState(toDateInputValue(new Date()));
    const [statusFilter, setStatusFilter] = useState<"revenue" | "all" | OrderStatus>("revenue");
    const [selectedColumns, setSelectedColumns] = useState<string[]>(ORDER_COLUMNS.map(c => c.key));
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [slips, setSlips] = useState<SlipDoc[]>([]);
    const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null);
    const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');

    useEffect(() => {
        const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    ...data,
                    createdAt: toDate(data.createdAt),
                    updatedAt: toDate(data.updatedAt),
                    paidAt: data.paidAt ? toDate(data.paidAt) : null,
                    paymentVerifiedAt: data.paymentVerifiedAt ? toDate(data.paymentVerifiedAt) : null
                } as ReportOrder;
            });
            setOrders(items);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "payment_slips"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data()
            })) as SlipDoc[];
            setSlips(items);
        });
        return () => unsubscribe();
    }, []);

    const slipsMap = useMemo(() => {
        const map = new Map<string, SlipDoc>();
        slips.forEach(slip => {
            if (slip.orderId) {
                if (!map.has(slip.orderId) || slip.verifyStatus === "verified") {
                    map.set(slip.orderId, slip);
                }
            }
        });
        return map;
    }, [slips]);

    const filteredOrders = useMemo(() => {
        const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
        const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;

        return orders.filter((order) => {
            const createdAt = toDate(order.createdAt);
            const matchesStart = !start || createdAt >= start;
            const matchesEnd = !end || createdAt <= end;
            const matchesStatus =
                statusFilter === "all" ||
                (statusFilter === "revenue" ? revenueStatuses.includes(order.status) : order.status === statusFilter);
            return matchesStart && matchesEnd && matchesStatus;
        });
    }, [endDate, orders, startDate, statusFilter]);

    const stats = useMemo(() => {
        const totalSales = filteredOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
        const totalDiscount = filteredOrders.reduce((sum, order) => sum + Number(order.totalDiscount || 0), 0);
        const totalDelivery = filteredOrders.reduce((sum, order) => sum + Number(order.deliveryFee || 0), 0);
        const totalItems = filteredOrders.reduce(
            (sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0),
            0
        );

        return {
            totalSales,
            totalDiscount,
            totalDelivery,
            totalItems,
            orderCount: filteredOrders.length,
            averageOrderValue: filteredOrders.length ? totalSales / filteredOrders.length : 0
        };
    }, [filteredOrders]);

    const productRows = useMemo(() => {
        const map = new Map<string, ProductReportRow>();

        filteredOrders.forEach((order) => {
            (order.items || []).forEach((item) => {
                const variantInfo = typeof item.variantInfo === "string" ? item.variantInfo : "";
                const addOns = formatItemAddOns(item);
                const key = `${item.productId || item.productName}|${variantInfo}|${addOns}`;
                const quantity = Number(item.quantity || 0);
                const lineTotal = Number(item.finalPrice ?? item.price ?? 0) * quantity;
                const current = map.get(key) || {
                    key,
                    productName: item.productName || "สินค้า",
                    variantInfo,
                    addOns,
                    quantity: 0,
                    grossSales: 0,
                    orderCount: 0
                };

                current.quantity += quantity;
                current.grossSales += lineTotal;
                current.orderCount += 1;
                map.set(key, current);
            });
        });

        return Array.from(map.values()).sort((a, b) => b.grossSales - a.grossSales);
    }, [filteredOrders]);

    const selectedProduct = useMemo(() => {
        if (!selectedProductKey) return null;
        return productRows.find((p) => p.key === selectedProductKey) || null;
    }, [productRows, selectedProductKey]);

    const displayedOrders = useMemo(() => {
        if (!selectedProduct) return filteredOrders;
        return filteredOrders.filter((order) =>
            (order.items || []).some((item) => {
                const variantInfo = typeof item.variantInfo === "string" ? item.variantInfo : "";
                const addOns = formatItemAddOns(item);
                const key = `${item.productId || item.productName}|${variantInfo}|${addOns}`;
                return key === selectedProduct.key;
            })
        );
    }, [filteredOrders, selectedProduct]);

    const exportOrdersCsv = () => {
        const activeColumns = ORDER_COLUMNS.filter(c => selectedColumns.includes(c.key));
        if (activeColumns.length === 0) {
            alert("กรุณาเลือกอย่างน้อย 1 คอลัมน์");
            return;
        }

        const isSelected = exportScope === 'selected' && Boolean(selectedProduct);
        const ordersToExport = isSelected ? displayedOrders : filteredOrders;
        const safeName = (selectedProduct?.productName || "product").replace(/[^a-zA-Z0-9ก-๙_-]/g, "_");
        const filename = isSelected
            ? `orders-${safeName}-${startDate}-to-${endDate}.csv`
            : `sales-orders-${startDate}-to-${endDate}.csv`;

        downloadCsv(filename, [
            activeColumns.map(c => c.label),
            ...ordersToExport.map((order) => activeColumns.map(c => c.getValue(order, slipsMap, selectedProductKey)))
        ]);
        setIsExportModalOpen(false);
    };

    const exportProductsCsv = () => {
        downloadCsv(`sales-products-${startDate}-to-${endDate}.csv`, [
            ["Product", "Variant", "Add-ons", "Quantity Sold", "Order Lines", "Sales"],
            ...productRows.map((row) => [
                row.productName,
                row.variantInfo,
                row.addOns,
                row.quantity,
                row.orderCount,
                row.grossSales
            ])
        ]);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-3.5 pb-10 font-sans antialiased text-slate-800">
            {/* Header & Export Actions: Clean & Zero-Noise */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-1 border-b border-slate-200/60">
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-slate-900">รายงานยอดขาย & สินค้า</h1>
                    <p className="text-xs text-slate-500 mt-0.5">วิเคราะห์ยอดขาย สินค้าขายดี และส่งออกข้อมูลเป็น CSV</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => {
                            setExportScope(selectedProduct ? 'selected' : 'all');
                            setIsExportModalOpen(true);
                        }}
                        disabled={filteredOrders.length === 0}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 cursor-pointer shadow-2xs transition-colors"
                    >
                        <Download size={13} />
                        <span>Export ออเดอร์</span>
                    </button>
                    <button
                        type="button"
                        onClick={exportProductsCsv}
                        disabled={productRows.length === 0}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer shadow-2xs transition-colors"
                    >
                        <Download size={13} />
                        <span>Export สินค้า</span>
                    </button>
                </div>
            </div>

            {/* Filter Toolbar (Clean Horizontal Strip) */}
            <section className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-2xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                        <span className="block text-[11px] font-medium text-slate-500 mb-1">วันที่เริ่มต้น</span>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50/70 border border-slate-200/80 rounded-lg">
                            <CalendarDays size={14} className="text-slate-400 shrink-0" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full bg-transparent text-xs font-medium text-slate-800 outline-none cursor-pointer"
                            />
                        </div>
                    </div>
                    <div>
                        <span className="block text-[11px] font-medium text-slate-500 mb-1">วันที่สิ้นสุด</span>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50/70 border border-slate-200/80 rounded-lg">
                            <CalendarDays size={14} className="text-slate-400 shrink-0" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full bg-transparent text-xs font-medium text-slate-800 outline-none cursor-pointer"
                            />
                        </div>
                    </div>
                    <div>
                        <span className="block text-[11px] font-medium text-slate-500 mb-1">สถานะคำสั่งซื้อ</span>
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50/70 border border-slate-200/80 rounded-lg">
                            <Filter size={14} className="text-slate-400 shrink-0" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as "revenue" | "all" | OrderStatus)}
                                className="w-full bg-transparent text-xs font-medium text-slate-800 outline-none cursor-pointer"
                            >
                                <option value="revenue">นับยอดขาย (สำเร็จ/ชำระแล้ว/จัดส่ง)</option>
                                <option value="all">ทุกสถานะทั้งหมด</option>
                                <option value="pending">รอชำระ (Pending)</option>
                                <option value="paid">ชำระแล้ว (Paid)</option>
                                <option value="shipped">จัดส่งแล้ว (Shipped)</option>
                                <option value="completed">สำเร็จ (Completed)</option>
                                <option value="cancelled">ยกเลิก (Cancelled)</option>
                                <option value="returned">คืนสินค้า (Returned)</option>
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            {/* KPI Stat Cards (5 Compact Cards) */}
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1">
                        <span>ยอดขายสุทธิ</span>
                        <TrendingUp size={13} className="text-slate-400" />
                    </div>
                    <p className="text-base sm:text-lg font-bold font-mono tracking-tight text-slate-900">{formatMoney(stats.totalSales)}</p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1">
                        <span>จำนวนออเดอร์</span>
                        <ReceiptText size={13} className="text-slate-400" />
                    </div>
                    <p className="text-base sm:text-lg font-bold font-mono tracking-tight text-slate-900">{stats.orderCount.toLocaleString()} <span className="text-xs font-normal text-slate-400">รายการ</span></p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1">
                        <span>สินค้าที่ขายได้</span>
                        <Package size={13} className="text-slate-400" />
                    </div>
                    <p className="text-base sm:text-lg font-bold font-mono tracking-tight text-slate-900">{stats.totalItems.toLocaleString()} <span className="text-xs font-normal text-slate-400">ชิ้น</span></p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1">
                        <span>ยอดเฉลี่ย / ออเดอร์</span>
                        <BarChart3 size={13} className="text-slate-400" />
                    </div>
                    <p className="text-base sm:text-lg font-bold font-mono tracking-tight text-slate-900">{formatMoney(Math.round(stats.averageOrderValue))}</p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold mb-1">
                        <span>ส่วนลดที่ให้</span>
                        <ShoppingBag size={13} className="text-slate-400" />
                    </div>
                    <p className="text-base sm:text-lg font-bold font-mono tracking-tight text-rose-600">{formatMoney(stats.totalDiscount)}</p>
                </div>
            </section>

            {/* Split Data View: Product Performance (Left) & Filtered Orders (Right) */}
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.3fr_0.9fr]">
                {/* Product Performance Table */}
                <section className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
                    <div className="px-3.5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex justify-between items-center gap-2">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h2 className="text-xs font-bold text-slate-800">รายงานสินค้า</h2>
                                <span className="text-[10px] text-slate-400 font-normal">({productRows.length} รายการ)</span>
                            </div>
                            <p className="text-[10px] text-slate-400">คลิกที่สินค้าเพื่อดูรายการออเดอร์ของสินค้านั้น</p>
                        </div>
                        {selectedProduct && (
                            <button
                                type="button"
                                onClick={() => setSelectedProductKey(null)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 transition-colors cursor-pointer"
                            >
                                <X size={11} />
                                <span>ยกเลิกการเลือก</span>
                            </button>
                        )}
                    </div>
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50/80 text-[11px] text-slate-500 border-b border-slate-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3.5 py-2 text-left font-semibold">สินค้า</th>
                                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">จำนวนขาย</th>
                                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">ออเดอร์</th>
                                    <th className="px-3.5 py-2 text-right font-semibold whitespace-nowrap">ยอดขายรวม</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
                                ) : productRows.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">ไม่พบข้อมูลสินค้าในช่วงนี้</td></tr>
                                ) : (
                                    productRows.map((row) => {
                                        const isSelected = selectedProductKey === row.key;
                                        return (
                                            <tr
                                                key={row.key}
                                                onClick={() => setSelectedProductKey((prev) => (prev === row.key ? null : row.key))}
                                                className={`cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? "bg-blue-50/80 border-l-3 border-l-blue-600 font-medium"
                                                        : "hover:bg-slate-50/60"
                                                }`}
                                                title="คลิกเพื่อดูออเดอร์ของสินค้านี้"
                                            >
                                                <td className="px-3.5 py-2 min-w-[180px]">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <p className={`text-xs ${isSelected ? "font-semibold text-blue-900" : "font-medium text-slate-900"}`}>
                                                            {row.productName}
                                                        </p>
                                                        {isSelected && (
                                                            <span className="shrink-0 text-[9px] px-1.5 py-0.2 rounded-full font-semibold bg-blue-600 text-white">
                                                                เลือกอยู่
                                                            </span>
                                                        )}
                                                    </div>
                                                    {row.variantInfo && <p className="text-[10px] text-slate-400">{row.variantInfo}</p>}
                                                    {row.addOns && <p className="text-[10px] text-slate-400 truncate max-w-xs">{row.addOns}</p>}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-medium text-slate-800">{row.quantity.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-500">{row.orderCount.toLocaleString()}</td>
                                                <td className="px-3.5 py-2 text-right font-mono font-semibold text-slate-900">{formatMoney(row.grossSales)}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Filtered Orders List */}
                <section className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden flex flex-col">
                    <div className="px-3.5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex justify-between items-center gap-2">
                        <div className="min-w-0">
                            {selectedProduct ? (
                                <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <h2 className="text-xs font-bold text-slate-800">ออเดอร์ของ:</h2>
                                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/60 max-w-[200px] truncate" title={selectedProduct.productName}>
                                            {selectedProduct.productName}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                        พบ <span className="font-semibold text-slate-800">{displayedOrders.length}</span> ออเดอร์ (ขายได้ {selectedProduct.quantity} ชิ้น)
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <h2 className="text-xs font-bold text-slate-800">คำสั่งซื้อในช่วงที่เลือก</h2>
                                    <p className="text-[10px] text-slate-400">แสดงรายการล่าสุด ({displayedOrders.length} รายการ)</p>
                                </div>
                            )}
                        </div>
                        {selectedProduct && (
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExportScope('selected');
                                        if (!selectedColumns.includes('selectedProductQty')) {
                                            setSelectedColumns(prev => [...prev, 'selectedProductQty']);
                                        }
                                        setIsExportModalOpen(true);
                                    }}
                                    disabled={displayedOrders.length === 0}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer shadow-2xs"
                                    title="Export เฉพาะออเดอร์ที่มีสินค้านี้"
                                >
                                    <Download size={11} />
                                    <span>Export ออเดอร์สินค้านี้ ({displayedOrders.length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedProductKey(null)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
                                >
                                    <X size={11} />
                                    <span>แสดงทั้งหมด</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                        {loading ? (
                            <div className="px-4 py-8 text-center text-xs text-slate-400">กำลังโหลด...</div>
                        ) : displayedOrders.length === 0 ? (
                            <div className="px-4 py-8 text-center text-xs text-slate-400">
                                {selectedProduct
                                    ? "ไม่พบคำสั่งซื้อที่มีสินค้านี้ในช่วงสถานะที่เลือก"
                                    : "ไม่พบคำสั่งซื้อตามตัวกรอง"}
                            </div>
                        ) : (
                            displayedOrders.slice(0, 50).map((order) => {
                                const statusConfig: Record<string, { label: string; badge: string }> = {
                                    pending: { label: "รอชำระ", badge: "bg-amber-50 text-amber-700 border-amber-200/60" },
                                    paid: { label: "ชำระแล้ว", badge: "bg-blue-50 text-blue-700 border-blue-200/60" },
                                    shipped: { label: "จัดส่งแล้ว", badge: "bg-indigo-50 text-indigo-700 border-indigo-200/60" },
                                    completed: { label: "สำเร็จ", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60" },
                                    cancelled: { label: "ยกเลิก", badge: "bg-rose-50 text-rose-700 border-rose-200/60" },
                                    returned: { label: "คืนสินค้า", badge: "bg-orange-50 text-orange-700 border-orange-200/60" },
                                };
                                const status = statusConfig[order.status] || { label: order.status, badge: "bg-slate-50 text-slate-700 border-slate-200" };

                                const matchingItems = selectedProduct
                                    ? (order.items || []).filter((item) => {
                                        const variantInfo = typeof item.variantInfo === "string" ? item.variantInfo : "";
                                        const addOns = formatItemAddOns(item);
                                        const key = `${item.productId || item.productName}|${variantInfo}|${addOns}`;
                                        return key === selectedProduct.key;
                                    })
                                    : [];
                                const matchedQty = matchingItems.reduce((s, it) => s + Number(it.quantity || 1), 0);

                                return (
                                    <Link
                                        key={order.id}
                                        href={`/orders/${order.id}`}
                                        className="p-2.5 flex items-start justify-between gap-2.5 hover:bg-slate-50/70 transition-colors text-xs group block"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-mono font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                                                    {formatOrderId(order, 10)}
                                                </span>
                                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-medium border ${status.badge}`}>
                                                    {status.label}
                                                </span>
                                                {selectedProduct && matchedQty > 0 && (
                                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                                                        สินค้านี้ {matchedQty} ชิ้น
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                                {order.customerName || "-"} · {toDate(order.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="font-mono font-bold text-slate-900">{formatMoney(Number(order.totalAmount || 0))}</p>
                                            <span className="text-[10px] text-slate-400">
                                                รวม {(order.items || []).reduce((s, it) => s + (it.quantity || 1), 0)} ชิ้น
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })
                        )}
                    </div>
                </section>
            </div>

            {/* Export Column Customization Modal */}
            {isExportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
                    <div className="bg-white w-full max-w-lg md:max-w-2xl rounded-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in duration-150">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-4.5 py-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900">เลือกคอลัมน์ข้อมูลสำหรับ Export CSV</h3>
                                <p className="text-[11px] text-slate-400 mt-0.5">เลือกฟิลด์คำสั่งซื้อที่ต้องการนำออกเป็นไฟล์สเปรดชีต</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(false)}
                                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto space-y-3">
                            {/* Scope Selector if a product is selected */}
                            {selectedProduct && (
                                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1.5">
                                    <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                        ขอบเขตออเดอร์ที่ต้องการ Export
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setExportScope('selected')}
                                            className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium border text-left transition cursor-pointer ${
                                                exportScope === 'selected'
                                                    ? 'bg-white border-slate-900 text-slate-900 shadow-2xs'
                                                    : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                                            }`}
                                        >
                                            <div className="min-w-0 pr-2">
                                                <span className="font-semibold block truncate">เฉพาะสินค้านี้: {selectedProduct.productName}</span>
                                                <span className="text-[10px] text-slate-400">ออเดอร์ที่มีสินค้านี้</span>
                                            </div>
                                            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-50 text-blue-700 shrink-0">
                                                {displayedOrders.length} ออเดอร์
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setExportScope('all')}
                                            className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium border text-left transition cursor-pointer ${
                                                exportScope === 'all'
                                                    ? 'bg-white border-slate-900 text-slate-900 shadow-2xs'
                                                    : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                                            }`}
                                        >
                                            <div>
                                                <span className="font-semibold block">ออเดอร์ทั้งหมด</span>
                                                <span className="text-[10px] text-slate-400">ทุกสินค้าตามตัวกรอง</span>
                                            </div>
                                            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700 shrink-0">
                                                {filteredOrders.length} ออเดอร์
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setSelectedColumns(ORDER_COLUMNS.map(c => c.key))}
                                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer transition-colors"
                                >
                                    เลือกทั้งหมด ({ORDER_COLUMNS.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedColumns([])}
                                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer transition-colors"
                                >
                                    ล้างทั้งหมด
                                </button>
                                <span className="text-[11px] text-slate-400 ml-auto font-mono">
                                    เลือกแล้ว {selectedColumns.length} คอลัมน์
                                </span>
                            </div>

                            {/* Checkbox Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                {ORDER_COLUMNS.map((col) => {
                                    const isChecked = selectedColumns.includes(col.key);
                                    return (
                                        <label
                                            key={col.key}
                                            className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer text-xs font-medium transition-all select-none ${
                                                isChecked
                                                    ? 'border-slate-800 bg-slate-50/70 text-slate-900'
                                                    : 'border-slate-200/80 bg-white hover:bg-slate-50/50 text-slate-600'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => {
                                                    setSelectedColumns(prev =>
                                                        prev.includes(col.key)
                                                            ? prev.filter(k => k !== col.key)
                                                            : [...prev, col.key]
                                                    );
                                                }}
                                                className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                                            />
                                            <span className="truncate">{col.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex gap-2 justify-end px-4.5 py-3 bg-slate-50/60 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(false)}
                                className="px-3 py-1.5 border border-slate-200 bg-white text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={exportOrdersCsv}
                                className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1.5 transition-colors shadow-2xs"
                            >
                                <Download size={13} />
                                <span>ดาวน์โหลด CSV (${exportScope === 'selected' && selectedProduct ? displayedOrders.length : filteredOrders.length} ออเดอร์)</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
