"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Order, OrderStatus } from "@/types/order";
import { formatOrderId } from "@/lib/orderId";
import { BarChart3, CalendarDays, Download, Package, ReceiptText, ShoppingBag, TrendingUp } from "lucide-react";

type ReportOrder = Order & {
    paymentMethod?: string;
    paymentStatus?: string;
    subTotal?: number;
    totalDiscount?: number;
};

type ProductReportRow = {
    key: string;
    productName: string;
    variantInfo: string;
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

export default function AdminReportsPage() {
    const [orders, setOrders] = useState<ReportOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [startDate, setStartDate] = useState(toDateInputValue(getStartOfMonth()));
    const [endDate, setEndDate] = useState(toDateInputValue(new Date()));
    const [statusFilter, setStatusFilter] = useState<"revenue" | "all" | OrderStatus>("revenue");

    useEffect(() => {
        const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    ...data,
                    createdAt: toDate(data.createdAt),
                    updatedAt: toDate(data.updatedAt)
                } as ReportOrder;
            });
            setOrders(items);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

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
                const key = `${item.productId || item.productName}|${variantInfo}`;
                const quantity = Number(item.quantity || 0);
                const lineTotal = Number(item.finalPrice ?? item.price ?? 0) * quantity;
                const current = map.get(key) || {
                    key,
                    productName: item.productName || "สินค้า",
                    variantInfo,
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
        downloadCsv(`sales-orders-${startDate}-to-${endDate}.csv`, [
            ["Order ID", "Date", "Customer", "Phone", "Status", "Payment Method", "Items", "Subtotal", "Discount", "Delivery", "Total"],
            ...filteredOrders.map((order) => [
                formatOrderId(order, 12),
                toDate(order.createdAt).toLocaleString("th-TH"),
                order.customerName || "",
                order.customerPhone || "",
                order.status,
                order.paymentMethod || "",
                (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
                Number(order.subTotal || 0),
                Number(order.totalDiscount || 0),
                Number(order.deliveryFee || 0),
                Number(order.totalAmount || 0)
            ])
        ]);
    };

    const exportProductsCsv = () => {
        downloadCsv(`sales-products-${startDate}-to-${endDate}.csv`, [
            ["Product", "Variant", "Quantity Sold", "Order Lines", "Sales"],
            ...productRows.map((row) => [
                row.productName,
                row.variantInfo,
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
                        onClick={exportOrdersCsv}
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
                                    <th className="px-4 py-3 text-right font-semibold">จำนวนขาย</th>
                                    <th className="px-4 py-3 text-right font-semibold">ออเดอร์</th>
                                    <th className="px-4 py-3 text-right font-semibold">ยอดขาย</th>
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
                                <div key={order.id} className="flex items-start justify-between gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-900">{formatOrderId(order, 12)}</p>
                                        <p className="mt-0.5 truncate text-xs text-gray-500">{order.customerName || "-"} · {toDate(order.createdAt).toLocaleString("th-TH")}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-gray-900">{formatMoney(Number(order.totalAmount || 0))}</p>
                                        <p className="mt-0.5 text-xs text-gray-400">{order.status}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
