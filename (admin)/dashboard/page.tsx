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
    badgeTone = "blue"
}: {
    title: string;
    value: string | number;
    change?: number;
    icon: ReactNode;
    prefix?: string;
    suffix?: string;
    changeLabel?: string;
    badgeTone?: "emerald" | "blue" | "indigo" | "amber";
}) => {
    const toneStyles = {
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
        blue: "bg-blue-50 text-blue-700 border-blue-200",
        indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
        amber: "bg-amber-50 text-amber-700 border-amber-200"
    };

    return (
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 transition-colors hover:border-gray-300">
            <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-gray-600">{title}</span>
                <div className={`p-1.5 rounded-lg border ${toneStyles[badgeTone]}`}>{icon}</div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
            </p>
            {change !== undefined && (
                <div className={`flex items-center gap-1 mt-1.5 text-xs font-bold ${change >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {change >= 0 ? <ArrowUpRight size={14} className="shrink-0" /> : <ArrowDownRight size={14} className="shrink-0" />}
                    <span>{Math.abs(change).toFixed(1)}%</span>
                    <span className="text-[11px] font-normal text-gray-500">{changeLabel || 'จากช่วงก่อน'}</span>
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
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-gray-500" size={28} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Header & Date Range Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200">
                <div>
                    <h1 className="text-lg font-black text-gray-900 tracking-tight">ภาพรวมแดชบอร์ด</h1>
                    <p className="text-xs text-gray-500">สถิติและข้อมูลการดำเนินงานร้านค้า</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Preset Range Pills */}
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
                        {(['today', 'week', 'month'] as const).map(range => (
                            <button
                                key={range}
                                onClick={() => handlePresetRange(range)}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dateRange === range
                                    ? 'bg-gray-900 text-white'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                                    }`}
                            >
                                {range === 'today' ? 'วันนี้' : range === 'week' ? '7 วัน' : 'เดือนนี้'}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Picker */}
                    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${dateRange === "custom" ? "border-gray-400 bg-white" : "border-gray-200 bg-gray-50"}`}>
                        <span className="text-[11px] font-bold text-gray-600">ช่วงวันที่:</span>
                        <input
                            type="date"
                            value={customStartDate}
                            max={customEndDate}
                            onChange={(event) => {
                                setCustomStartDate(event.target.value);
                                setDateRange("custom");
                            }}
                            className="h-7 rounded border border-gray-200 bg-white px-1.5 text-xs font-semibold text-gray-800 outline-none focus:border-gray-400"
                        />
                        <span className="text-gray-400 text-xs">-</span>
                        <input
                            type="date"
                            value={customEndDate}
                            min={customStartDate}
                            onChange={(event) => {
                                setCustomEndDate(event.target.value);
                                setDateRange("custom");
                            }}
                            className="h-7 rounded border border-gray-200 bg-white px-1.5 text-xs font-semibold text-gray-800 outline-none focus:border-gray-400"
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
                    icon={<TrendingUp size={16} />}
                    prefix="฿"
                    badgeTone="emerald"
                />
                <StatCard
                    title="จำนวนคำสั่งซื้อ"
                    value={stats.currentOrderCount}
                    change={stats.orderChange}
                    icon={<ShoppingBag size={16} />}
                    suffix=" รายการ"
                    badgeTone="blue"
                />
                <StatCard
                    title="ยอดเฉลี่ย / ออเดอร์"
                    value={Math.round(stats.avgOrderValue)}
                    change={stats.avgChange}
                    icon={<CreditCard size={16} />}
                    prefix="฿"
                    badgeTone="indigo"
                />
                <StatCard
                    title="ฐานลูกค้าทั้งหมด"
                    value={stats.totalCustomers}
                    icon={<Users size={16} />}
                    suffix=" ราย"
                    badgeTone="amber"
                />
            </div>

            {/* Order Status Breakdown & Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Order Status Breakdown */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-3.5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-sm text-gray-900">สถานะคำสั่งซื้อในช่วงที่เลือก</h3>
                        <Link href="/orders" className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                            ดูคำสั่งซื้อ <ArrowRight size={13} />
                        </Link>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
                        <Link href="/orders?status=pending" className="text-center p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl hover:bg-amber-100/70 transition-colors block">
                            <Clock size={18} className="mx-auto text-amber-700 mb-1" />
                            <p className="text-lg font-black text-amber-900">{stats.statusBreakdown.pending}</p>
                            <p className="text-xs font-bold text-amber-700">รอชำระ</p>
                        </Link>
                        <Link href="/orders?status=paid" className="text-center p-2.5 bg-blue-50/80 border border-blue-200/80 rounded-xl hover:bg-blue-100/70 transition-colors block">
                            <CreditCard size={18} className="mx-auto text-blue-700 mb-1" />
                            <p className="text-lg font-black text-blue-900">{stats.statusBreakdown.paid}</p>
                            <p className="text-xs font-bold text-blue-700">ชำระแล้ว</p>
                        </Link>
                        <Link href="/orders?status=shipped" className="text-center p-2.5 bg-purple-50/80 border border-purple-200/80 rounded-xl hover:bg-purple-100/70 transition-colors block">
                            <Truck size={18} className="mx-auto text-purple-700 mb-1" />
                            <p className="text-lg font-black text-purple-900">{stats.statusBreakdown.shipped}</p>
                            <p className="text-xs font-bold text-purple-700">จัดส่งแล้ว</p>
                        </Link>
                        <Link href="/orders?status=completed" className="text-center p-2.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl hover:bg-emerald-100/70 transition-colors block">
                            <CheckCircle size={18} className="mx-auto text-emerald-700 mb-1" />
                            <p className="text-lg font-black text-emerald-900">{stats.statusBreakdown.completed}</p>
                            <p className="text-xs font-bold text-emerald-700">สำเร็จ</p>
                        </Link>
                        <Link href="/orders?status=cancelled" className="text-center p-2.5 bg-rose-50/80 border border-rose-200/80 rounded-xl hover:bg-rose-100/70 transition-colors block">
                            <XCircle size={18} className="mx-auto text-rose-700 mb-1" />
                            <p className="text-lg font-black text-rose-900">{stats.statusBreakdown.cancelled}</p>
                            <p className="text-xs font-bold text-rose-700">ยกเลิก</p>
                        </Link>
                        <Link href="/orders?status=returned" className="text-center p-2.5 bg-orange-50/80 border border-orange-200/80 rounded-xl hover:bg-orange-100/70 transition-colors block">
                            <RotateCcw size={18} className="mx-auto text-orange-700 mb-1" />
                            <p className="text-lg font-black text-orange-900">{stats.statusBreakdown.returned}</p>
                            <p className="text-xs font-bold text-orange-700">คืนสินค้า</p>
                        </Link>
                    </div>
                </div>

                {/* Conversion & Cancellation Performance */}
                <div className="bg-white rounded-xl border border-gray-200 p-3.5 space-y-3.5 flex flex-col justify-between">
                    <h3 className="font-bold text-sm text-gray-900">ประสิทธิภาพการขาย</h3>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-gray-600">อัตราสำเร็จ (Conversion)</span>
                            <span className="font-black text-emerald-700 text-sm">{stats.conversionRate.toFixed(1)}%</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200/60">
                            <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, stats.conversionRate)}%` }}
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-gray-600">อัตรายกเลิก (Cancellation)</span>
                            <span className="font-black text-rose-600 text-sm">{stats.cancellationRate.toFixed(1)}%</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200/60">
                            <div
                                className="h-full bg-gradient-to-r from-rose-500 to-red-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, stats.cancellationRate)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Inventory & Customer Highlights (4 Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-2 text-gray-700 text-xs font-bold mb-1">
                        <Package size={14} className="text-gray-500" /> สินค้าทั้งหมด
                    </div>
                    <p className="text-xl font-black text-gray-900">{stats.totalProducts}</p>
                    <p className="text-[11px] font-medium text-gray-500 mt-0.5">เปิดขาย {stats.activeProducts} รายการ</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-rose-200 bg-rose-50/20">
                    <div className="flex items-center gap-1.5 text-rose-700 text-xs font-bold mb-1">
                        <AlertTriangle size={14} className="text-rose-500" /> หมดสต็อก
                    </div>
                    <p className="text-xl font-black text-rose-700">{stats.outOfStock}</p>
                    <Link href="/products" className="text-[11px] font-bold text-rose-600 hover:underline mt-0.5 inline-block">จัดการสต็อก →</Link>
                </div>
                <div className="bg-white p-3 rounded-xl border border-amber-200 bg-amber-50/20">
                    <div className="flex items-center gap-1.5 text-amber-700 text-xs font-bold mb-1">
                        <AlertTriangle size={14} className="text-amber-500" /> ใกล้หมด (≤ 5)
                    </div>
                    <p className="text-xl font-black text-amber-700">{stats.lowStock}</p>
                    <Link href="/products" className="text-[11px] font-bold text-amber-600 hover:underline mt-0.5 inline-block">เติมสต็อก →</Link>
                </div>
                <div className="bg-white p-3 rounded-xl border border-blue-200 bg-blue-50/20">
                    <div className="flex items-center gap-1.5 text-blue-700 text-xs font-bold mb-1">
                        <Users size={14} className="text-blue-500" /> ลูกค้าใหม่
                    </div>
                    <p className="text-xl font-black text-blue-700">{stats.newCustomers}</p>
                    <Link href="/customers" className="text-[11px] font-bold text-blue-600 hover:underline mt-0.5 inline-block">ดูรายชื่อลูกค้า →</Link>
                </div>
            </div>

            {/* Top Products & Top Customers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Top Products */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex justify-between items-center">
                        <span className="font-bold text-xs text-gray-800 uppercase tracking-wide">สินค้าขายดี (ยอดขายสูงสุด)</span>
                        <Link href="/products" className="text-xs font-bold text-blue-600 hover:text-blue-700">ดูทั้งหมด →</Link>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {stats.topProducts.length === 0 ? (
                            <div className="p-4 text-center text-gray-400 text-xs">ยังไม่มีข้อมูลการขายในช่วงนี้</div>
                        ) : (
                            stats.topProducts.map((product, idx) => (
                                <div key={idx} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${idx === 0
                                            ? 'bg-amber-400 text-amber-950'
                                            : idx === 1
                                                ? 'bg-slate-300 text-slate-800'
                                                : idx === 2
                                                    ? 'bg-orange-300 text-orange-900'
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                            {idx + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-bold text-xs text-gray-900 truncate max-w-[200px] sm:max-w-xs">{product.name}</p>
                                            <p className="text-[11px] font-medium text-gray-500">ขายได้ {product.quantity} ชิ้น</p>
                                        </div>
                                    </div>
                                    <span className="font-black text-xs text-gray-900 shrink-0">฿{product.revenue.toLocaleString()}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Top Customers */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex justify-between items-center">
                        <span className="font-bold text-xs text-gray-800 uppercase tracking-wide">ลูกค้า VIP (ยอดซื้อสะสมสูงสุด)</span>
                        <Link href="/customers" className="text-xs font-bold text-blue-600 hover:text-blue-700">ดูทั้งหมด →</Link>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {stats.topCustomers.length === 0 ? (
                            <div className="p-4 text-center text-gray-400 text-xs">ยังไม่มีข้อมูลลูกค้า</div>
                        ) : (
                            stats.topCustomers.map((customer, idx) => (
                                <div key={idx} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${idx === 0
                                            ? 'bg-amber-400 text-amber-950'
                                            : idx === 1
                                                ? 'bg-slate-300 text-slate-800'
                                                : idx === 2
                                                    ? 'bg-orange-300 text-orange-900'
                                                    : 'bg-gray-100 text-gray-600'
                                            }`}>
                                            {idx + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-bold text-xs text-gray-900 truncate max-w-[200px] sm:max-w-xs">{customer.name}</p>
                                            <p className="text-[11px] font-medium text-gray-500">{customer.totalOrders || 0} คำสั่งซื้อ</p>
                                        </div>
                                    </div>
                                    <span className="font-black text-xs text-gray-900 shrink-0">฿{(customer.totalSpent || 0).toLocaleString()}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Recent Orders Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-200 flex justify-between items-center">
                    <span className="font-bold text-xs text-gray-800 uppercase tracking-wide">คำสั่งซื้อล่าสุด</span>
                    <Link href="/orders" className="text-xs font-bold text-blue-600 hover:text-blue-700">ดูคำสั่งซื้อทั้งหมด →</Link>
                </div>
                <div className="divide-y divide-gray-200">
                    {recentOrders.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-xs">ยังไม่มีคำสั่งซื้อในระบบ</div>
                    ) : (
                        recentOrders.map((order) => {
                            const statusConfig: Record<string, { label: string; color: string }> = {
                                pending: { label: "รอชำระ", color: "bg-amber-100 text-amber-800 border border-amber-300/50" },
                                paid: { label: "ชำระแล้ว", color: "bg-blue-100 text-blue-800 border border-blue-300/50" },
                                shipped: { label: "จัดส่งแล้ว", color: "bg-purple-100 text-purple-800 border border-purple-300/50" },
                                completed: { label: "สำเร็จ", color: "bg-emerald-100 text-emerald-800 border border-emerald-300/50" },
                                cancelled: { label: "ยกเลิก", color: "bg-rose-100 text-rose-800 border border-rose-300/50" },
                                returned: { label: "คืนสินค้า", color: "bg-orange-100 text-orange-800 border border-orange-300/50" },
                            };
                            const status = statusConfig[order.status] || { label: order.status, color: "bg-gray-100 text-gray-700 border border-gray-300/50" };
                            return (
                                <Link
                                    key={order.id}
                                    href={`/orders/${order.id}`}
                                    className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50/80 transition-colors group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-bold text-gray-500 group-hover:text-blue-600 transition-colors">
                                                    {formatOrderId(order, 8)}
                                                </span>
                                                <span className="text-gray-300">•</span>
                                                <span className="font-bold text-xs text-gray-900 truncate">
                                                    {order.customerName}
                                                </span>
                                            </div>
                                            <p className="text-[11px] font-medium text-gray-400 mt-0.5">
                                                {format(order.createdAt, 'd MMM yy HH:mm', { locale: th })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${status.color}`}>
                                            {status.label}
                                        </span>
                                        <div className="text-right min-w-[70px]">
                                            <p className="font-black text-xs text-gray-900">฿{order.totalAmount.toLocaleString()}</p>
                                        </div>
                                        <ArrowRight size={14} className="text-gray-400 group-hover:text-gray-700 transition-colors" />
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
