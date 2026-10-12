"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Users, ShoppingBag, TrendingUp, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2, X, Eye } from "lucide-react";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import Link from "next/link";

interface Customer {
    id: string;
    name: string;
    phone: string;
    address: string;
    lineId?: string;
    displayName?: string;
    pictureUrl?: string;
    totalOrders: number;
    totalSpent: number;
    lastOrderAt?: Date | null;
    createdAt?: Date | null;
}

type SortField = 'name' | 'totalOrders' | 'totalSpent' | 'lastOrderAt';
type SortOrder = 'asc' | 'desc';

function CustomerAvatar({
    url,
    name,
    iconSize = 14,
}: {
    url?: string | null;
    name?: string;
    iconSize?: number;
}) {
    const [prevUrl, setPrevUrl] = useState(url);
    const [hasError, setHasError] = useState(false);

    if (url !== prevUrl) {
        setPrevUrl(url);
        setHasError(false);
    }

    if (!url || !url.trim() || hasError) {
        return <Users size={iconSize} className="text-slate-400" />;
    }

    return (
        <img
            key={url}
            src={url}
            alt={name || ""}
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
            referrerPolicy="no-referrer"
            loading="lazy"
        />
    );
}

export default function AdminCustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<SortField>('totalSpent');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const itemsPerPage = 15;

    // Fetch Customers
    useEffect(() => {
        const q = query(collection(db, "customers"), orderBy("updatedAt", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
                    lastOrderAt: data.lastOrderAt?.toDate ? data.lastOrderAt.toDate() : null,
                };
            }) as Customer[];
            setCustomers(items);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching customers:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Filter & Sort
    const filteredCustomers = useMemo(() => {
        const result = customers.filter(c => {
            const term = searchTerm.toLowerCase();
            return (
                c.name?.toLowerCase().includes(term) ||
                c.displayName?.toLowerCase().includes(term) ||
                c.phone?.includes(term) ||
                c.address?.toLowerCase().includes(term)
            );
        });

        result.sort((a, b) => {
            if (sortField === 'lastOrderAt') {
                const aTime = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
                const bTime = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
                return sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
            }

            if (sortField === 'name') {
                const aName = a.name || "";
                const bName = b.name || "";
                return sortOrder === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
            }

            const aNum = Number(a[sortField] || 0);
            const bNum = Number(b[sortField] || 0);
            return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
        });

        return result;
    }, [customers, searchTerm, sortField, sortOrder]);

    // Pagination
    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
    const paginatedCustomers = filteredCustomers.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Stats
    const stats = useMemo(() => ({
        total: customers.length,
        totalRevenue: customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0),
        totalOrders: customers.reduce((sum, c) => sum + (c.totalOrders || 0), 0),
        avgOrderValue: customers.length > 0
            ? customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / (customers.reduce((sum, c) => sum + (c.totalOrders || 0), 0) || 1)
            : 0
    }), [customers]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ChevronDown size={13} className="opacity-30" />;
        return sortOrder === 'asc' ? <ChevronUp size={13} className="text-slate-900" /> : <ChevronDown size={13} className="text-slate-900" />;
    };

    // Delete Customer
    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, "customers", deleteConfirm.id));
            setDeleteConfirm(null);
        } catch (error) {
            console.error("Error deleting customer:", error);
            alert("เกิดข้อผิดพลาดในการลบข้อมูลลูกค้า");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-3.5">
                <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                        <span>จัดการร้านค้า</span>
                        <span>/</span>
                        <span className="font-medium text-slate-900">ลูกค้า</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">ฐานข้อมูลลูกค้า</h1>
                        <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                            {stats.total.toLocaleString()} ราย
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                        ประวัติการสั่งซื้อ ข้อมูลการติดต่อ และยอดรวมการสั่งซื้อของลูกค้าทั้งหมด
                    </p>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">ลูกค้าทั้งหมด</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            <Users size={12} />
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold tracking-tight text-slate-900">
                        {stats.total.toLocaleString()}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">ออเดอร์ทั้งหมด</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <ShoppingBag size={12} />
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold tracking-tight text-emerald-600">
                        {stats.totalOrders.toLocaleString()}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">ยอดซื้อสะสมรวม</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            <TrendingUp size={12} />
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold tracking-tight text-slate-900">
                        ฿{stats.totalRevenue.toLocaleString()}
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">ยอดเฉลี่ย / ออเดอร์ (AOV)</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                            <TrendingUp size={12} />
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold tracking-tight text-sky-700">
                        ฿{Math.round(stats.avgOrderValue).toLocaleString()}
                    </p>
                </div>
            </div>

            {/* Search Toolbar */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="relative flex-1 sm:max-w-md">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อ, เบอร์โทร, LINE ID หรือที่อยู่..."
                        className="w-full h-8 pl-8 pr-7 border border-slate-200 bg-slate-50/60 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-500 font-mono">
                    <span>
                        แสดง {filteredCustomers.length.toLocaleString()} จาก {customers.length.toLocaleString()} ราย
                    </span>
                </div>
            </div>

            {/* Table Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-slate-400">
                        <Users className="mx-auto mb-2 animate-pulse text-slate-300" size={28} />
                        <p className="text-xs">กำลังโหลดข้อมูลลูกค้า...</p>
                    </div>
                ) : filteredCustomers.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <Users size={36} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-xs font-medium text-slate-600">
                            {searchTerm ? "ไม่พบข้อมูลลูกค้าที่ตรงกับคำค้นหา" : "ยังไม่มีข้อมูลลูกค้าในระบบ"}
                        </p>
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="mt-1 text-[11px] text-slate-500 underline"
                            >
                                ล้างคำค้นหา
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <button
                                type="button"
                                onClick={() => handleSort('name')}
                                className="col-span-4 flex items-center gap-1 hover:text-slate-900 transition text-left"
                            >
                                ข้อมูลลูกค้า <SortIcon field="name" />
                            </button>
                            <div className="col-span-2">เบอร์โทรศัพท์</div>
                            <button
                                type="button"
                                onClick={() => handleSort('totalOrders')}
                                className="col-span-1 flex items-center gap-1 hover:text-slate-900 transition"
                            >
                                ออเดอร์ <SortIcon field="totalOrders" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSort('totalSpent')}
                                className="col-span-2 flex items-center justify-end gap-1 hover:text-slate-900 transition text-right"
                            >
                                ยอดซื้อสะสม <SortIcon field="totalSpent" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSort('lastOrderAt')}
                                className="col-span-2 flex items-center justify-center gap-1 hover:text-slate-900 transition text-center"
                            >
                                ล่าสุด <SortIcon field="lastOrderAt" />
                            </button>
                            <div className="col-span-1 text-right">จัดการ</div>
                        </div>

                        {/* Table Body */}
                        <div className="divide-y divide-slate-100">
                            {paginatedCustomers.map((customer) => (
                                <div
                                    key={customer.id}
                                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-slate-50/60 transition-colors"
                                >
                                    {/* Customer Info */}
                                    <div className="col-span-8 md:col-span-4 flex items-center gap-2.5 min-w-0">
                                        <div className="w-8 h-8 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                            <CustomerAvatar url={customer.pictureUrl} name={customer.name} iconSize={14} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <Link
                                                href={`/customers/${customer.id}`}
                                                className="font-semibold text-xs text-slate-900 truncate hover:text-sky-600 transition block"
                                            >
                                                {customer.name}
                                            </Link>
                                            {customer.displayName && customer.displayName !== customer.name && (
                                                <span className="text-[10px] text-slate-400 font-mono truncate block">
                                                    LINE: {customer.displayName}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Phone */}
                                    <div className="hidden md:block col-span-2">
                                        <a
                                            href={`tel:${customer.phone}`}
                                            className="text-xs font-mono text-slate-600 hover:text-slate-900 transition"
                                        >
                                            {customer.phone || "-"}
                                        </a>
                                    </div>

                                    {/* Orders Count */}
                                    <div className="hidden md:block col-span-1">
                                        <span className="font-mono text-xs font-semibold text-slate-800">
                                            {(customer.totalOrders || 0).toLocaleString()}
                                        </span>
                                    </div>

                                    {/* Total Spent */}
                                    <div className="hidden md:block col-span-2 text-right">
                                        <span className="font-mono text-xs font-bold text-slate-900">
                                            ฿{(customer.totalSpent || 0).toLocaleString()}
                                        </span>
                                    </div>

                                    {/* Last Order Date */}
                                    <div className="hidden md:block col-span-2 text-center">
                                        {customer.lastOrderAt ? (
                                            <span className="font-mono text-xs text-slate-500">
                                                {format(customer.lastOrderAt, 'd MMM yy', { locale: th })}
                                            </span>
                                        ) : (
                                            <span className="font-mono text-xs text-slate-300">-</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="col-span-4 md:col-span-1 flex items-center justify-end gap-1">
                                        <Link
                                            href={`/customers/${customer.id}`}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                                            title="ดูรายละเอียดลูกค้า"
                                        >
                                            <Eye size={13} />
                                        </Link>

                                        <button
                                            type="button"
                                            onClick={() => setDeleteConfirm(customer)}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                            title="ลบข้อมูลลูกค้า"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>

                                    {/* Mobile Quick Stats */}
                                    <div className="col-span-12 md:hidden flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                                        <span className="font-mono">{customer.phone}</span>
                                        <span className="font-mono">📦 {customer.totalOrders || 0} ออเดอร์</span>
                                        <span className="font-mono font-bold text-slate-900">฿{(customer.totalSpent || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination Footer */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-slate-200/70 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500">
                                <span>
                                    แสดง {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, filteredCustomers.length)} จาก {filteredCustomers.length} ราย
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                                    >
                                        <ChevronLeft size={13} />
                                        ก่อนหน้า
                                    </button>
                                    <span className="px-2 font-mono text-xs font-semibold text-slate-700">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                                    >
                                        ถัดไป
                                        <ChevronRight size={13} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Delete Confirm Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                                    <Trash2 size={13} />
                                </span>
                                <h3 className="text-xs font-semibold text-slate-900">ยืนยันการลบลูกค้า</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="p-4 space-y-1.5">
                            <p className="text-xs text-slate-700">
                                คุณต้องการลบข้อมูลลูกค้า <span className="font-semibold text-slate-900">&quot;{deleteConfirm.name}&quot;</span> ใช่หรือไม่?
                            </p>
                            <p className="text-[11px] text-rose-500">
                                ข้อมูลลูกค้าจะถูกลบถาวรและไม่สามารถกู้คืนได้
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                disabled={isDeleting}
                                className="h-7.5 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="h-7.5 px-3 rounded-lg bg-rose-600 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50 transition"
                            >
                                {isDeleting ? "กำลังลบ..." : "ยืนยันลบ"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
