"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
    TrendingUp, ShoppingBag, Users, Package,
    CreditCard, Clock, Truck, CheckCircle, XCircle, RotateCcw,
    AlertTriangle, ArrowUpRight, ArrowDownRight, Loader2
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

const StatCard = ({ title, value, change, icon, prefix = "", suffix = "", changeLabel = "" }: {
    title: string;
    value: string | number;
    change?: number;
    icon: ReactNode;
    prefix?: string;
    suffix?: string;
    changeLabel?: string;
}) => (
    <div className="bg-white p-4 rounded-xl border border-gray-100">
        <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500">{title}</span>
            <div className="p-2 bg-gray-50 rounded-lg text-gray-500">{icon}</div>
        </div>
        <p className="text-2xl font-bold text-gray-900">{prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</p>
        {change !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                <span>{Math.abs(change).toFixed(1)}%</span>
                <span className="text-gray-400">{changeLabel || 'จากช่วงก่อน'}</span>
            </div>
        )}
    </div>
);

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
                <Loader2 className="animate-spin text-gray-400" size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">ภาพรวม</h1>
                    <p className="text-sm text-gray-500">วิเคราะห์ข้อมูลร้านค้า</p>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                        {(['today', 'week', 'month'] as const).map(range => (
                            <button
                                key={range}
                                onClick={() => handlePresetRange(range)}
                                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${dateRange === range ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                {range === 'today' ? 'วันนี้' : range === 'week' ? '7 วัน' : 'เดือนนี้'}
                            </button>
                        ))}
                    </div>
                    <div className={`flex flex-wrap items-center gap-2 rounded-lg border p-1.5 ${dateRange === "custom" ? "border-gray-300 bg-white shadow-sm" : "border-gray-100 bg-white/70"}`}>
                        <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                            จากวันที่
                            <input
                                type="date"
                                value={customStartDate}
                                max={customEndDate}
                                onChange={(event) => {
                                    setCustomStartDate(event.target.value);
                                    setDateRange("custom");
                                }}
                                className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-800 outline-none focus:border-gray-400"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                            ถึงวันที่
                            <input
                                type="date"
                                value={customEndDate}
                                min={customStartDate}
                                onChange={(event) => {
                                    setCustomEndDate(event.target.value);
                                    setDateRange("custom");
                                }}
                                className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-800 outline-none focus:border-gray-400"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="รายได้"
                    value={stats.currentRevenue}
                    change={stats.revenueChange}
                    icon={<TrendingUp size={16} />}
                    prefix="฿"
                />
                <StatCard
                    title="คำสั่งซื้อ"
                    value={stats.currentOrderCount}
                    change={stats.orderChange}
                    icon={<ShoppingBag size={16} />}
                    suffix=" รายการ"
                />
                <StatCard
                    title="ค่าเฉลี่ย/ออเดอร์"
                    value={Math.round(stats.avgOrderValue)}
                    change={stats.avgChange}
                    icon={<CreditCard size={16} />}
                    prefix="฿"
                />
                <StatCard
                    title="ลูกค้าทั้งหมด"
                    value={stats.totalCustomers}
                    icon={<Users size={16} />}
                    suffix=" ราย"
                />
            </div>

            {/* Order Status + Conversion */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Order Status Breakdown */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4">
                    <h3 className="font-semibold text-sm text-gray-900 mb-4">สถานะคำสั่งซื้อในช่วงที่เลือก</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                        <div className="text-center p-3 bg-amber-50 rounded-lg">
                            <Clock size={20} className="mx-auto text-amber-600 mb-1" />
                            <p className="text-lg font-bold text-amber-700">{stats.statusBreakdown.pending}</p>
                            <p className="text-xs text-amber-600">รอชำระ</p>
                        </div>
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                            <CreditCard size={20} className="mx-auto text-blue-600 mb-1" />
                            <p className="text-lg font-bold text-blue-700">{stats.statusBreakdown.paid}</p>
                            <p className="text-xs text-blue-600">ชำระแล้ว</p>
                        </div>
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                            <Truck size={20} className="mx-auto text-purple-600 mb-1" />
                            <p className="text-lg font-bold text-purple-700">{stats.statusBreakdown.shipped}</p>
                            <p className="text-xs text-purple-600">จัดส่งแล้ว</p>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                            <CheckCircle size={20} className="mx-auto text-green-600 mb-1" />
                            <p className="text-lg font-bold text-green-700">{stats.statusBreakdown.completed}</p>
                            <p className="text-xs text-green-600">สำเร็จ</p>
                        </div>
                        <div className="text-center p-3 bg-red-50 rounded-lg">
                            <XCircle size={20} className="mx-auto text-red-600 mb-1" />
                            <p className="text-lg font-bold text-red-700">{stats.statusBreakdown.cancelled}</p>
                            <p className="text-xs text-red-600">ยกเลิก</p>
                        </div>
                        <div className="text-center p-3 bg-orange-50 rounded-lg">
                            <RotateCcw size={20} className="mx-auto text-orange-600 mb-1" />
                            <p className="text-lg font-bold text-orange-700">{stats.statusBreakdown.returned}</p>
                            <p className="text-xs text-orange-600">คืนสินค้า</p>
                        </div>
                    </div>
                </div>

                {/* Conversion & Cancellation */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
                    <h3 className="font-semibold text-sm text-gray-900">อัตราสำเร็จ</h3>
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-500">Conversion Rate</span>
                            <span className="text-sm font-bold text-green-600">{stats.conversionRate.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.conversionRate}%` }} />
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-500">Cancellation Rate</span>
                            <span className="text-sm font-bold text-red-600">{stats.cancellationRate.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${stats.cancellationRate}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Products & Inventory */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                        <Package size={14} /> สินค้าทั้งหมด
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalProducts}</p>
                    <p className="text-xs text-gray-400 mt-1">เปิดขาย {stats.activeProducts} รายการ</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-red-500 text-xs mb-2">
                        <AlertTriangle size={14} /> หมดสต็อก
                    </div>
                    <p className="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
                    <Link href="/products" className="text-xs text-red-500 hover:underline mt-1 block">ดูรายการ →</Link>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-amber-500 text-xs mb-2">
                        <AlertTriangle size={14} /> ใกล้หมด (≤5)
                    </div>
                    <p className="text-2xl font-bold text-amber-600">{stats.lowStock}</p>
                    <Link href="/products" className="text-xs text-amber-500 hover:underline mt-1 block">ดูรายการ →</Link>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-blue-500 text-xs mb-2">
                        <Users size={14} /> ลูกค้าใหม่
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{stats.newCustomers}</p>
                    <p className="text-xs text-gray-400 mt-1">ในช่วงเวลาที่เลือก</p>
                </div>
            </div>

            {/* Top Products & Customers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Products */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                        <span className="font-semibold text-sm text-gray-900">สินค้าขายดี</span>
                        <Link href="/admin/products" className="text-xs text-gray-500 hover:text-gray-700">ดูทั้งหมด →</Link>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {stats.topProducts.length === 0 ? (
                            <div className="p-4 text-center text-gray-400 text-sm">ยังไม่มีข้อมูล</div>
                        ) : (
                            stats.topProducts.map((product, idx) => (
                                <div key={idx} className="px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-500">
                                            {idx + 1}
                                        </span>
                                        <div>
                                            <p className="font-medium text-sm text-gray-900 truncate max-w-[180px]">{product.name}</p>
                                            <p className="text-xs text-gray-400">{product.quantity} ชิ้น</p>
                                        </div>
                                    </div>
                                    <span className="font-bold text-sm text-gray-900">฿{product.revenue.toLocaleString()}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Top Customers */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                        <span className="font-semibold text-sm text-gray-900">ลูกค้า VIP</span>
                        <Link href="/customers" className="text-xs text-gray-500 hover:text-gray-700">ดูทั้งหมด →</Link>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {stats.topCustomers.length === 0 ? (
                            <div className="p-4 text-center text-gray-400 text-sm">ยังไม่มีข้อมูล</div>
                        ) : (
                            stats.topCustomers.map((customer, idx) => (
                                <div key={idx} className="px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-500">
                                            {idx + 1}
                                        </span>
                                        <div>
                                            <p className="font-medium text-sm text-gray-900 truncate max-w-[180px]">{customer.name}</p>
                                            <p className="text-xs text-gray-400">{customer.totalOrders || 0} ออเดอร์</p>
                                        </div>
                                    </div>
                                    <span className="font-bold text-sm text-gray-900">฿{(customer.totalSpent || 0).toLocaleString()}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                    <span className="font-semibold text-sm text-gray-900">คำสั่งซื้อล่าสุด</span>
                    <Link href="/admin/orders" className="text-xs text-gray-500 hover:text-gray-700">ดูทั้งหมด →</Link>
                </div>
                <div className="divide-y divide-gray-50">
                    {recentOrders.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm">ยังไม่มีคำสั่งซื้อ</div>
                    ) : (
                        recentOrders.map((order) => {
                            const statusConfig: Record<string, { label: string; color: string }> = {
                                pending: { label: "รอชำระ", color: "bg-amber-100 text-amber-700" },
                                paid: { label: "ชำระแล้ว", color: "bg-blue-100 text-blue-700" },
                                shipped: { label: "จัดส่งแล้ว", color: "bg-purple-100 text-purple-700" },
                                completed: { label: "สำเร็จ", color: "bg-green-100 text-green-700" },
                                cancelled: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
                                returned: { label: "คืนสินค้า", color: "bg-orange-100 text-orange-700" },
                            };
                            const status = statusConfig[order.status] || { label: order.status, color: "bg-gray-100 text-gray-700" };
                            return (
                                <Link key={order.id} href="/admin/orders" className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <p className="font-mono text-xs text-gray-400">{formatOrderId(order, 8)}</p>
                                            <p className="font-medium text-sm text-gray-900">{order.customerName}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                                            {status.label}
                                        </span>
                                        <div className="text-right">
                                            <p className="font-bold text-sm text-gray-900">฿{order.totalAmount.toLocaleString()}</p>
                                            <p className="text-xs text-gray-400">{format(order.createdAt, 'd MMM HH:mm', { locale: th })}</p>
                                        </div>
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
