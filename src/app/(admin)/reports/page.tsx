"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, OrderStatus } from "@/types/order";
import { formatOrderId } from "@/lib/orderId";
import { BarChart3, CalendarDays, Download, Package, ReceiptText, ShoppingBag, TrendingUp, X } from "lucide-react";

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
        getValue: (order: ReportOrder, slipsMap?: Map<string, any>) => {
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
        getValue: (order: ReportOrder, slipsMap?: Map<string, any>) => {
            const rawPaidAt = order.paidAt || order.paymentVerifiedAt;
            if (rawPaidAt) return toDate(rawPaidAt).toLocaleString("th-TH");
            const slip = slipsMap?.get(order.id);
            if (slip?.verifiedAt) return toDate(slip.verifiedAt).toLocaleString("th-TH");
            if (slip?.createdAt) return toDate(slip.createdAt).toLocaleString("th-TH");
            return "";
        } 
    },
    { key: "slipUrl", label: "ลิงก์รูปสลิป (Slip URL)", getValue: (order: ReportOrder) => order.slipUrl || "" },
    { key: "itemsCount", label: "จำนวนรายการสินค้า (Items)", getValue: (order: ReportOrder) => (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0) },
    { key: "addOns", label: "รายละเอียดสินค้าและท็อปปิ้ง (Add-ons)", getValue: (order: ReportOrder) => formatOrderAddOns(order) },
    { key: "subTotal", label: "ยอดเงินรวมสินค้า (Subtotal)", getValue: (order: ReportOrder) => Number(order.subTotal || 0) },
    { key: "totalDiscount", label: "ส่วนลดรวม (Discount)", getValue: (order: ReportOrder) => Number(order.totalDiscount || 0) },
    { key: "deliveryFee", label: "ค่าจัดส่ง (Delivery)", getValue: (order: ReportOrder) => Number(order.deliveryFee || 0) },
    { key: "totalAmount", label: "ยอดรวมสุทธิ (Total)", getValue: (order: ReportOrder) => Number(order.totalAmount || 0) },
];

export default function AdminReportsPage() {
    const [orders, setOrders] = useState<ReportOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(toDateInputValue(getStartOfMonth()));
    const [endDate, setEndDate] = useState(toDateInputValue(new Date()));
    const [statusFilter, setStatusFilter] = useState<"revenue" | "all" | OrderStatus>("revenue");
    const [selectedColumns, setSelectedColumns] = useState<string[]>(ORDER_COLUMNS.map(c => c.key));
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [slips, setSlips] = useState<any[]>([]);

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
            }));
            setSlips(items);
        });
        return () => unsubscribe();
    }, []);

    const slipsMap = useMemo(() => {
        const map = new Map<string, any>();
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

    const exportOrdersCsv = () => {
        const activeColumns = ORDER_COLUMNS.filter(c => selectedColumns.includes(c.key));
        if (activeColumns.length === 0) {
            alert("กรุณาเลือกอย่างน้อย 1 คอลัมน์");
            return;
        }

        downloadCsv(`sales-orders-${startDate}-to-${endDate}.csv`, [
            activeColumns.map(c => c.label),
            ...filteredOrders.map((order) => activeColumns.map(c => c.getValue(order, slipsMap)))
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
        <div className="mx-auto max-w-7xl space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">รายงาน</h1>
                    <p className="mt-1 text-sm text-gray-500">สรุปยอดขายและสินค้าขายดีจากคำสั่งซื้อ</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setIsExportModalOpen(true)}
                        disabled={filteredOrders.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Download size={16} />
                        Export คำสั่งซื้อ
                    </button>
                    <button
                        type="button"
                        onClick={exportProductsCsv}
                        disabled={productRows.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                    >
                        <Download size={16} />
                        Export สินค้า
                    </button>
                </div>
            </div>

            <section className="rounded-xl border border-gray-100 bg-white p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_220px]">
                    <label className="text-xs font-semibold text-gray-500">
                        วันที่เริ่มต้น
                        <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <CalendarDays size={16} className="text-gray-400" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(event) => setStartDate(event.target.value)}
                                className="w-full bg-transparent text-sm text-gray-900 outline-none"
                            />
                        </div>
                    </label>
                    <label className="text-xs font-semibold text-gray-500">
                        วันที่สิ้นสุด
                        <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <CalendarDays size={16} className="text-gray-400" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(event) => setEndDate(event.target.value)}
                                className="w-full bg-transparent text-sm text-gray-900 outline-none"
                            />
                        </div>
                    </label>
                    <label className="text-xs font-semibold text-gray-500">
                        สถานะ
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value as "revenue" | "all" | OrderStatus)}
                            className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none"
                        >
                            <option value="revenue">นับยอดขาย</option>
                            <option value="all">ทุกสถานะ</option>
                            <option value="pending">รอชำระ</option>
                            <option value="paid">ชำระแล้ว</option>
                            <option value="shipped">จัดส่งแล้ว</option>
                            <option value="completed">สำเร็จ</option>
                            <option value="cancelled">ยกเลิก</option>
                            <option value="returned">คืนสินค้า</option>
                        </select>
                    </label>
                </div>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-500">
                        <TrendingUp size={15} />
                        ยอดขาย
                    </div>
                    <p className="text-xl font-bold text-gray-900">{formatMoney(stats.totalSales)}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-500">
                        <ReceiptText size={15} />
                        ออเดอร์
                    </div>
                    <p className="text-xl font-bold text-gray-900">{stats.orderCount.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-500">
                        <Package size={15} />
                        จำนวนสินค้า
                    </div>
                    <p className="text-xl font-bold text-gray-900">{stats.totalItems.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-500">
                        <BarChart3 size={15} />
                        เฉลี่ย/ออเดอร์
                    </div>
                    <p className="text-xl font-bold text-gray-900">{formatMoney(Math.round(stats.averageOrderValue))}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-500">
                        <ShoppingBag size={15} />
                        ส่วนลด
                    </div>
                    <p className="text-xl font-bold text-red-600">{formatMoney(stats.totalDiscount)}</p>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <section className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3">
                        <h2 className="text-sm font-bold text-gray-900">รายงานสินค้า</h2>
                        <p className="mt-0.5 text-xs text-gray-500">เรียงตามยอดขายสูงสุด</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-[680px] w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold">สินค้า</th>
                                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">จำนวนขาย</th>
                                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">ออเดอร์</th>
                                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">ยอดขาย</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">กำลังโหลด...</td></tr>
                                ) : productRows.length === 0 ? (
                                    <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">ไม่พบข้อมูลสินค้า</td></tr>
                                ) : (
                                    productRows.map((row) => (
                                        <tr key={row.key} className="hover:bg-gray-50/60">
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-gray-900">{row.productName}</p>
                                                {row.variantInfo && <p className="mt-0.5 text-xs text-gray-400">{row.variantInfo}</p>}
                                                {row.addOns && <p className="mt-0.5 text-[11px] text-gray-500">{row.addOns}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-gray-900">{row.quantity.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-gray-600">{row.orderCount.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900">{formatMoney(row.grossSales)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                    <div className="border-b border-gray-100 px-4 py-3">
                        <h2 className="text-sm font-bold text-gray-900">คำสั่งซื้อล่าสุด</h2>
                        <p className="mt-0.5 text-xs text-gray-500">ตามตัวกรองที่เลือก</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {loading ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-400">กำลังโหลด...</div>
                        ) : filteredOrders.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-gray-400">ไม่พบคำสั่งซื้อ</div>
                        ) : (
                            filteredOrders.slice(0, 12).map((order) => (
                                <div key={order.id} className="flex items-start justify-between gap-3 px-4 py-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{formatOrderId(order, 12)}</p>
                                        <p className="mt-0.5 truncate text-[11px] text-gray-500">{order.customerName || "-"} · {toDate(order.createdAt).toLocaleString("th-TH")}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-gray-900">{formatMoney(Number(order.totalAmount || 0))}</p>
                                        <p className="mt-0.5 text-[11px] text-gray-400">{order.status}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>

            {isExportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-lg md:max-w-3xl rounded-2xl border border-gray-100 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="flex justify-between items-center px-5 py-3.5 border-b border-gray-100">
                            <div>
                                <h3 className="text-base font-bold text-gray-900">เลือกคอลัมน์สำหรับการ Export</h3>
                                <p className="text-xs text-gray-500 mt-0.5">เลือกคอลัมน์ข้อมูลคำสั่งซื้อที่ต้องการนำออกเป็นไฟล์ CSV</p>
                            </div>
                            <button 
                                onClick={() => setIsExportModalOpen(false)}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 overflow-y-auto space-y-4">
                            {/* Actions */}
                            <div className="flex gap-2 text-xs font-semibold">
                                <button
                                    onClick={() => setSelectedColumns(ORDER_COLUMNS.map(c => c.key))}
                                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                >
                                    เลือกทั้งหมด
                                </button>
                                <button
                                    onClick={() => setSelectedColumns([])}
                                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                >
                                    ล้างทั้งหมด
                                </button>
                            </div>

                            {/* Checkbox grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                                {ORDER_COLUMNS.map((col) => {
                                    const isChecked = selectedColumns.includes(col.key);
                                    return (
                                        <label 
                                            key={col.key}
                                            className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer text-xs font-medium transition-all select-none ${
                                                isChecked 
                                                    ? 'border-gray-900 bg-gray-50/50 text-gray-900' 
                                                    : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
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
                                                className="w-4 h-4 rounded border-gray-300 text-gray-950 focus:ring-gray-900 accent-black cursor-pointer"
                                            />
                                            {col.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-2 justify-end px-5 py-3.5 bg-gray-50 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(false)}
                                className="px-4 py-2 border border-gray-200 bg-white text-sm font-semibold rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={exportOrdersCsv}
                                className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors inline-flex items-center gap-2"
                            >
                                <Download size={16} />
                                ดาวน์โหลด CSV
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
