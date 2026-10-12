"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    TrendingUp, ShoppingBag, Users, Package,
    CreditCard, Clock, Truck, CheckCircle, XCircle, RotateCcw,
    AlertTriangle, ArrowUpRight, ArrowDownRight, Loader2, ArrowRight
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { th } from "date-fns/locale";
import Link from "next/link";
import { formatOrderId } from "@/lib/orderId";

interface Order {
    id: string;
    orderNo?: string;
    status: string;
    totalAmount: number;
    items: { productName: string; quantity: number; price: number }[];
    customerName: string;
    createdAt: Date;
}

interface Product {
    id: string;
    name: string;
    price: number;
    stock: number;
    category: string;
    isActive: boolean;
}

interface Customer {
    id: string;
    name: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderAt: Date | null;
}

type DateRange = 'today' | 'week' | 'month' | 'custom';

const formatDateInput = (date: Date) => format(date, "yyyy-MM-dd");

const getDateRange = (dateRange: DateRange, customStartDate: string, customEndDate: string) => {
    const now = new Date();
    if (dateRange === "custom") {
        if (!customStartDate || !customEndDate) {
            return { start: startOfDay(now), end: endOfDay(now) };
        }
        const firstDate = customStartDate <= customEndDate ? customStartDate : customEndDate;
        const lastDate = customStartDate <= customEndDate ? customEndDate : customStartDate;
        return {
            start: startOfDay(new Date(`${firstDate}T00:00:00`)),
            end: endOfDay(new Date(`${lastDate}T00:00:00`))
        };
    }

    switch (dateRange) {
        case 'today':
            return { start: startOfDay(now), end: endOfDay(now) };
        case 'week':
            return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
        case 'month':
            return { start: startOfMonth(now), end: endOfMonth(now) };
    }
};

const StatCard = ({
    title,
    value,
    change,
    icon,
    prefix = "",
    suffix = "",
    changeLabel = "",
}: {
    title: string;
    value: string | number;
    change?: number;
    icon: ReactNode;
    prefix?: string;
    suffix?: string;
    changeLabel?: string;
}) => {
    return (
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-colors">
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</span>
                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200/60 text-slate-500">{icon}</div>
            </div>
            <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-900">
                {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
            </p>
            {change !== undefined && (
                <div className="flex items-center gap-1 mt-1.5 text-[11px]">
                    <span className={`inline-flex items-center gap-0.5 font-mono font-semibold px-1.5 py-0.2 rounded ${
                        change >= 0 ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60' : 'text-rose-700 bg-rose-50 border border-rose-200/60'
                    }`}>
                        {change >= 0 ? <ArrowUpRight size={12} className="shrink-0 stroke-[2.5]" /> : <ArrowDownRight size={12} className="shrink-0 stroke-[2.5]" />}
                        <span>{Math.abs(change).toFixed(1)}%</span>
                    </span>
                    <span className="text-slate-400 text-[10px]">{changeLabel || 'จากช่วงก่อน'}</span>
                </div>
            )}
        </div>
    );
};

export default function AdminDashboard() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateRange, setDateRange] = useState<DateRange>('today');
    const [customStartDate, setCustomStartDate] = useState(() => formatDateInput(new Date()));
    const [customEndDate, setCustomEndDate] = useState(() => formatDateInput(new Date()));

    // Fetch all data
    useEffect(() => {
        const unsubOrders = onSnapshot(
            query(collection(db, "orders"), orderBy("createdAt", "desc")),
            (snapshot) => {
                const items = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    createdAt: doc.data().createdAt?.toDate() || new Date()
                })) as Order[];
                setOrders(items);
            }
        );

        const unsubProducts = onSnapshot(
            query(collection(db, "products")),
            (snapshot) => {
                const items = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Product[];
                setProducts(items);
            }
        );

        const unsubCustomers = onSnapshot(
            query(collection(db, "customers")),
            (snapshot) => {
                const items = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    lastOrderAt: doc.data().lastOrderAt?.toDate() || null
                })) as Customer[];
                setCustomers(items);
                setIsLoading(false);
            }
        );

        return () => {
            unsubOrders();
            unsubProducts();
            unsubCustomers();
        };
    }, []);

    const selectedDateRange = useMemo(
        () => getDateRange(dateRange, customStartDate, customEndDate),
        [dateRange, customStartDate, customEndDate]
    );

    const handlePresetRange = (range: Exclude<DateRange, "custom">) => {
        const nextRange = getDateRange(range, customStartDate, customEndDate);
        setDateRange(range);
        setCustomStartDate(formatDateInput(nextRange.start));
        setCustomEndDate(formatDateInput(nextRange.end));
    };

    // Filtered orders by date range
    const filteredOrders = useMemo(() => {
        const { start, end } = selectedDateRange;
        return orders.filter(order =>
            isWithinInterval(order.createdAt, { start, end })
        );
    }, [orders, selectedDateRange]);

    // Previous period orders for comparison
    const previousOrders = useMemo(() => {
        const { start, end } = selectedDateRange;
        const duration = end.getTime() - start.getTime();
        const prevStart = new Date(start.getTime() - duration);
        const prevEnd = new Date(end.getTime() - duration);
        return orders.filter(order =>
            isWithinInterval(order.createdAt, { start: prevStart, end: prevEnd })
        );
    }, [orders, selectedDateRange]);

    // Analytics calculations
    const stats = useMemo(() => {
        // Revenue
        const currentRevenue = filteredOrders
            .filter(o => o.status !== 'cancelled' && o.status !== 'returned')
            .reduce((sum, o) => sum + o.totalAmount, 0);
        const prevRevenue = previousOrders
            .filter(o => o.status !== 'cancelled' && o.status !== 'returned')
            .reduce((sum, o) => sum + o.totalAmount, 0);
        const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        // Orders count
        const currentOrderCount = filteredOrders.length;
        const prevOrderCount = previousOrders.length;
        const orderChange = prevOrderCount > 0 ? ((currentOrderCount - prevOrderCount) / prevOrderCount) * 100 : 0;

        // Average order value
        const avgOrderValue = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0;
        const prevAvgOrder = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;
        const avgChange = prevAvgOrder > 0 ? ((avgOrderValue - prevAvgOrder) / prevAvgOrder) * 100 : 0;

        // Order status breakdown
        const statusBreakdown = {
            pending: filteredOrders.filter(o => o.status === 'pending').length,
            paid: filteredOrders.filter(o => o.status === 'paid').length,
            shipped: filteredOrders.filter(o => o.status === 'shipped').length,
            completed: filteredOrders.filter(o => o.status === 'completed').length,
            cancelled: filteredOrders.filter(o => o.status === 'cancelled').length,
            returned: filteredOrders.filter(o => o.status === 'returned').length,
        };

        // Products
        const totalProducts = products.length;
        const activeProducts = products.filter(p => p.isActive).length;
        const outOfStock = products.filter(p => p.stock === 0 && p.isActive).length;
        const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5 && p.isActive).length;

        // Customers
        const totalCustomers = customers.length;
        const newCustomers = customers.filter(c => {
            const { start, end } = selectedDateRange;
            return c.lastOrderAt && isWithinInterval(c.lastOrderAt, { start, end });
        }).length;

        // Top products (by quantity sold)
        const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
        filteredOrders
            .filter(o => o.status !== 'cancelled' && o.status !== 'returned')
            .forEach(order => {
                order.items.forEach(item => {
                    if (!productSales[item.productName]) {
                        productSales[item.productName] = { name: item.productName, quantity: 0, revenue: 0 };
                    }
                    productSales[item.productName].quantity += item.quantity;
                    productSales[item.productName].revenue += item.price * item.quantity;
                });
            });
        const topProducts = Object.values(productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        // Top customers
        const topCustomers = [...customers]
            .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
            .slice(0, 5);

        // Conversion rate (completed / total)
        const completedOrders = filteredOrders.filter(o => o.status === 'completed').length;
        const conversionRate = currentOrderCount > 0 ? (completedOrders / currentOrderCount) * 100 : 0;

        // Cancellation rate
        const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;
        const cancellationRate = currentOrderCount > 0 ? (cancelledOrders / currentOrderCount) * 100 : 0;

        return {
            currentRevenue,
            revenueChange,
            currentOrderCount,
            orderChange,
            avgOrderValue,
            avgChange,
            statusBreakdown,
            totalProducts,
            activeProducts,
            outOfStock,
            lowStock,
            totalCustomers,
            newCustomers,
            topProducts,
            topCustomers,
            conversionRate,
            cancellationRate
        };
    }, [filteredOrders, previousOrders, products, customers, selectedDateRange]);

    // Recent orders
    const recentOrders = orders.slice(0, 5);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[380px] text-slate-400 gap-3">
                <Loader2 className="animate-spin text-slate-500" size={28} />
                <span className="text-xs font-medium">กำลังโหลดแดชบอร์ด...</span>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-3.5 pb-10 font-sans antialiased text-slate-800">
            {/* Header & Date Range Toolbar: Clean, Compact & Zero-Noise */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-1 border-b border-slate-200/60">
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-slate-900">ภาพรวมแดชบอร์ด</h1>
                    <p className="text-xs text-slate-500 mt-0.5">สถิติและข้อมูลการดำเนินงานร้านค้าแบบเรียลไทม์</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {/* Preset Range Segmented Control */}
                    <div className="flex gap-0.5 bg-slate-100/90 p-1 rounded-lg border border-slate-200/60 text-xs font-medium">
                        {(['today', 'week', 'month'] as const).map(range => (
                            <button
                                key={range}
                                onClick={() => handlePresetRange(range)}
                                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer select-none ${dateRange === range
                                    ? 'bg-white text-slate-900 font-semibold shadow-2xs ring-1 ring-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900'
                                    }`}
                            >
                                {range === 'today' ? 'วันนี้' : range === 'week' ? '7 วัน' : 'เดือนนี้'}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Picker */}
                    <div className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${dateRange === "custom" ? "border-slate-800 bg-white shadow-2xs" : "border-slate-200/80 bg-slate-50/70"}`}>
                        <span className="text-[11px] text-slate-400">ช่วงวันที่:</span>
                        <input
                            type="date"
                            value={customStartDate}
                            max={customEndDate}
                            onChange={(event) => {
                                setCustomStartDate(event.target.value);
                                setDateRange("custom");
                            }}
                            className="bg-transparent text-xs font-medium text-slate-800 outline-none cursor-pointer"
                        />
                        <span className="text-slate-400 text-xs">-</span>
                        <input
                            type="date"
                            value={customEndDate}
                            min={customStartDate}
                            onChange={(event) => {
                                setCustomEndDate(event.target.value);
                                setDateRange("custom");
                            }}
                            className="bg-transparent text-xs font-medium text-slate-800 outline-none cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* Main KPI Stats (4 Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                    title="ยอดขายรวม"
                    value={stats.currentRevenue}
                    change={stats.revenueChange}
                    icon={<TrendingUp size={15} />}
                    prefix="฿"
                />
                <StatCard
                    title="จำนวนคำสั่งซื้อ"
                    value={stats.currentOrderCount}
                    change={stats.orderChange}
                    icon={<ShoppingBag size={15} />}
                    suffix=" รายการ"
                />
                <StatCard
                    title="ยอดเฉลี่ย / ออเดอร์"
                    value={Math.round(stats.avgOrderValue)}
                    change={stats.avgChange}
                    icon={<CreditCard size={15} />}
                    prefix="฿"
                />
                <StatCard
                    title="ฐานลูกค้าทั้งหมด"
                    value={stats.totalCustomers}
                    icon={<Users size={15} />}
                    suffix=" ราย"
                />
            </div>

            {/* Order Status Breakdown & Performance (Zero-Noise Neutral Cards) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Order Status Breakdown */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800">สถานะคำสั่งซื้อในช่วงที่เลือก</span>
                            <span className="text-[10px] text-slate-400 font-mono">({filteredOrders.length} ออเดอร์)</span>
                        </div>
                        <Link href="/orders" className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 transition-colors">
                            <span>ไปหน้ารายการ</span>
                            <ArrowRight size={12} />
                        </Link>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                        {[
                            { href: "/orders?status=pending", label: "รอชำระ", count: stats.statusBreakdown.pending, icon: Clock, dot: "bg-amber-400" },
                            { href: "/orders?status=paid", label: "ชำระแล้ว", count: stats.statusBreakdown.paid, icon: CreditCard, dot: "bg-blue-500" },
                            { href: "/orders?status=shipped", label: "จัดส่งแล้ว", count: stats.statusBreakdown.shipped, icon: Truck, dot: "bg-indigo-500" },
                            { href: "/orders?status=completed", label: "สำเร็จ", count: stats.statusBreakdown.completed, icon: CheckCircle, dot: "bg-emerald-500" },
                            { href: "/orders?status=cancelled", label: "ยกเลิก", count: stats.statusBreakdown.cancelled, icon: XCircle, dot: "bg-rose-400" },
                            { href: "/orders?status=returned", label: "คืนสินค้า", count: stats.statusBreakdown.returned, icon: RotateCcw, dot: "bg-orange-400" },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className="p-2.5 bg-slate-50/70 border border-slate-200/70 rounded-lg hover:bg-white hover:border-slate-300 transition-all text-center block group shadow-2xs"
                                >
                                    <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 mb-1">
                                        <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
                                        <span>{item.label}</span>
                                    </div>
                                    <p className="text-base sm:text-lg font-bold font-mono text-slate-900">{item.count}</p>
                                    <Icon size={13} className="mx-auto text-slate-400 group-hover:text-slate-600 mt-1 transition-colors" />
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* Conversion & Cancellation Performance */}
                <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-800">ประสิทธิภาพการขาย</span>
                        <span className="text-[10px] text-slate-400">อัตราเฉลี่ย</span>
                    </div>

                    <div className="space-y-3 py-1">
                        <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-600 font-medium">อัตราสำเร็จ (Conversion)</span>
                                <span className="font-bold font-mono text-emerald-700">{stats.conversionRate.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(100, stats.conversionRate)}%` }}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-600 font-medium">อัตรายกเลิก (Cancellation)</span>
                                <span className="font-bold font-mono text-rose-600">{stats.cancellationRate.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-rose-500 rounded-full transition-all duration-300"
                                    style={{ width: `${Math.min(100, stats.cancellationRate)}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <p className="text-[10px] text-slate-400 text-center pt-1 border-t border-slate-100">
                        คำนวณจากยอดคำสั่งซื้อทั้งหมดในช่วงเวลาที่เลือก
                    </p>
                </div>
            </div>

            {/* Inventory & Customer Highlights (4 Clean Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-semibold mb-1">
                        <Package size={13} className="text-slate-400" />
                        <span>สินค้าทั้งหมด</span>
                    </div>
                    <p className="text-lg font-bold font-mono text-slate-900">{stats.totalProducts}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">เปิดขาย {stats.activeProducts} รายการ</p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-semibold">
                            <AlertTriangle size={13} className="text-rose-500" />
                            <span>สินค้าหมดสต็อก</span>
                        </div>
                        {stats.outOfStock > 0 && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200/60 rounded">
                                ต้องเติม
                            </span>
                        )}
                    </div>
                    <p className="text-lg font-bold font-mono text-rose-600">{stats.outOfStock}</p>
                    <Link href="/products" className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline mt-0.5 inline-block">
                        จัดการสต็อก →
                    </Link>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-semibold">
                            <AlertTriangle size={13} className="text-amber-500" />
                            <span>ใกล้หมด (≤ 5)</span>
                        </div>
                        {stats.lowStock > 0 && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200/60 rounded">
                                เตือน
                            </span>
                        )}
                    </div>
                    <p className="text-lg font-bold font-mono text-amber-700">{stats.lowStock}</p>
                    <Link href="/products" className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline mt-0.5 inline-block">
                        ดูรายการ →
                    </Link>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-semibold mb-1">
                        <Users size={13} className="text-slate-400" />
                        <span>ลูกค้าใหม่ช่วงนี้</span>
                    </div>
                    <p className="text-lg font-bold font-mono text-slate-900">{stats.newCustomers}</p>
                    <Link href="/customers" className="text-[11px] text-slate-500 hover:text-slate-900 hover:underline mt-0.5 inline-block">
                        ดูรายชื่อลูกค้า →
                    </Link>
                </div>
            </div>

            {/* Top Products & Top Customers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Top Products */}
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                    <div className="px-3.5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex justify-between items-center">
                        <span className="font-bold text-xs text-slate-800">สินค้าขายดี (ยอดขายสูงสุด)</span>
                        <Link href="/products" className="text-xs font-medium text-slate-500 hover:text-slate-900">ดูทั้งหมด →</Link>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {stats.topProducts.length === 0 ? (
                            <div className="p-4 text-center text-slate-400 text-xs">ยังไม่มีข้อมูลการขายในช่วงนี้</div>
                        ) : (
                            stats.topProducts.map((product, idx) => (
                                <div key={idx} className="px-3.5 py-2 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-xs">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="w-4 text-center font-mono font-bold text-slate-400 text-[11px] shrink-0">
                                            {idx + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-medium text-slate-900 truncate max-w-[200px] sm:max-w-xs">{product.name}</p>
                                            <p className="text-[10px] text-slate-400">ขายได้ {product.quantity} ชิ้น</p>
                                        </div>
                                    </div>
                                    <span className="font-semibold font-mono text-slate-900 shrink-0">฿{product.revenue.toLocaleString()}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Top Customers */}
                <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                    <div className="px-3.5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex justify-between items-center">
                        <span className="font-bold text-xs text-slate-800">ลูกค้า VIP (ยอดซื้อสะสมสูงสุด)</span>
                        <Link href="/customers" className="text-xs font-medium text-slate-500 hover:text-slate-900">ดูทั้งหมด →</Link>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {stats.topCustomers.length === 0 ? (
                            <div className="p-4 text-center text-slate-400 text-xs">ยังไม่มีข้อมูลลูกค้า</div>
                        ) : (
                            stats.topCustomers.map((customer, idx) => (
                                <div key={idx} className="px-3.5 py-2 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-xs">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="w-4 text-center font-mono font-bold text-slate-400 text-[11px] shrink-0">
                                            {idx + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-medium text-slate-900 truncate max-w-[200px] sm:max-w-xs">{customer.name}</p>
                                            <p className="text-[10px] text-slate-400">{customer.totalOrders || 0} คำสั่งซื้อ</p>
                                        </div>
                                    </div>
                                    <span className="font-semibold font-mono text-slate-900 shrink-0">฿{(customer.totalSpent || 0).toLocaleString()}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Recent Orders Table (Clean & Compact) */}
            <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                <div className="px-3.5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex justify-between items-center">
                    <span className="font-bold text-xs text-slate-800">คำสั่งซื้อล่าสุด</span>
                    <Link href="/orders" className="text-xs font-medium text-slate-500 hover:text-slate-900">ดูทั้งหมด →</Link>
                </div>
                <div className="divide-y divide-slate-100">
                    {recentOrders.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs">ยังไม่มีคำสั่งซื้อในระบบ</div>
                    ) : (
                        recentOrders.map((order) => {
                            const statusConfig: Record<string, { label: string; badge: string }> = {
                                pending: { label: "รอชำระ", badge: "bg-amber-50 text-amber-700 border-amber-200/60" },
                                paid: { label: "ชำระแล้ว", badge: "bg-blue-50 text-blue-700 border-blue-200/60" },
                                shipped: { label: "จัดส่งแล้ว", badge: "bg-indigo-50 text-indigo-700 border-indigo-200/60" },
                                completed: { label: "สำเร็จ", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60" },
                                cancelled: { label: "ยกเลิก", badge: "bg-rose-50 text-rose-700 border-rose-200/60" },
                                returned: { label: "คืนสินค้า", badge: "bg-orange-50 text-orange-700 border-orange-200/60" },
                            };
                            const status = statusConfig[order.status] || { label: order.status, badge: "bg-slate-50 text-slate-700 border-slate-200" };
                            return (
                                <Link
                                    key={order.id}
                                    href={`/orders/${order.id}`}
                                    className="px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors group text-xs"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                                                    {formatOrderId(order, 8)}
                                                </span>
                                                <span className="text-slate-300">•</span>
                                                <span className="font-medium text-slate-900 truncate">
                                                    {order.customerName}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                {format(order.createdAt, 'd MMM yy HH:mm', { locale: th })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${status.badge}`}>
                                            {status.label}
                                        </span>
                                        <div className="text-right min-w-[70px]">
                                            <p className="font-semibold font-mono text-slate-900">฿{order.totalAmount.toLocaleString()}</p>
                                        </div>
                                        <ArrowRight size={13} className="text-slate-400 group-hover:text-slate-700 transition-colors" />
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
