"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, Users, ShoppingBag, TrendingUp, Phone, MapPin, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2, X, Eye } from "lucide-react";
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
    lastOrderAt?: any;
    createdAt?: any;
}

type SortField = 'name' | 'totalOrders' | 'totalSpent' | 'lastOrderAt';
type SortOrder = 'asc' | 'desc';

export default function AdminCustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<SortField>('totalSpent');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
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
        let result = customers.filter(c => {
            const term = searchTerm.toLowerCase();
            return (
                c.name?.toLowerCase().includes(term) ||
                c.displayName?.toLowerCase().includes(term) ||
                c.phone?.includes(term) ||
                c.address?.toLowerCase().includes(term)
            );
        });

        result.sort((a, b) => {
            let aVal: any = a[sortField];
            let bVal: any = b[sortField];

            if (sortField === 'lastOrderAt') {
                aVal = aVal ? new Date(aVal).getTime() : 0;
                bVal = bVal ? new Date(bVal).getTime() : 0;
            }

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = (bVal || '').toLowerCase();
            }

            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
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
            ? customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / customers.reduce((sum, c) => sum + (c.totalOrders || 0), 0) || 0
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
        if (sortField !== field) return <ChevronDown size={14} className="opacity-30" />;
        return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    // Delete Customer
    const handleDelete = async (id: string) => {
        try {
            await deleteDoc(doc(db, "customers", id));
            setDeleteConfirm(null);
        } catch (error) {
            console.error("Error deleting customer:", error);
            alert("เกิดข้อผิดพลาดในการลบ");
        }
    };



    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">ลูกค้า</h1>
                    <p className="text-sm text-gray-500">{stats.total} ราย</p>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2">
                        <Users size={16} className="text-blue-500" />
                        <span className="text-xs text-gray-500">ลูกค้า</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2">
                        <ShoppingBag size={16} className="text-green-500" />
                        <span className="text-xs text-gray-500">ออเดอร์</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 mt-1">{stats.totalOrders}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-amber-500" />
                        <span className="text-xs text-gray-500">ยอดขาย</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 mt-1">฿{stats.totalRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-purple-500" />
                        <span className="text-xs text-gray-500">เฉลี่ย/ออเดอร์</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 mt-1">฿{Math.round(stats.avgOrderValue).toLocaleString()}</p>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white rounded-lg border border-gray-100 p-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder="ค้นหาชื่อ, เบอร์โทร, ที่อยู่..."
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">กำลังโหลด...</div>
                ) : filteredCustomers.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Users size={40} className="mx-auto mb-3 text-gray-300" />
                        <p>ยังไม่มีข้อมูลลูกค้า</p>
                    </div>
                ) : (
                    <>
                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 border-b">
                            <div className="col-span-3">ลูกค้า</div>
                            <div className="col-span-2">เบอร์โทร</div>
                            <button onClick={() => handleSort('totalOrders')} className="col-span-1 flex items-center gap-1 hover:text-gray-700">
                                ออเดอร์ <SortIcon field="totalOrders" />
                            </button>
                            <button onClick={() => handleSort('totalSpent')} className="col-span-2 flex items-center gap-1 hover:text-gray-700">
                                ยอดซื้อ <SortIcon field="totalSpent" />
                            </button>
                            <button onClick={() => handleSort('lastOrderAt')} className="col-span-2 flex items-center gap-1 hover:text-gray-700">
                                ล่าสุด <SortIcon field="lastOrderAt" />
                            </button>
                            <div className="col-span-2 text-right">จัดการ</div>
                        </div>

                        {/* Table Body */}
                        <div className="divide-y divide-gray-50">
                            {paginatedCustomers.map((customer) => (
                                <div key={customer.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50 transition-colors">
                                    {/* Customer Info */}
                                    <div className="col-span-8 md:col-span-3 flex items-center gap-3">
                                        <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                                            {customer.pictureUrl ? (
                                                <img src={customer.pictureUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <Users size={16} className="text-gray-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm text-gray-900 truncate">{customer.name}</p>
                                            {customer.displayName && customer.displayName !== customer.name && (
                                                <p className="text-xs text-gray-400 truncate">LINE: {customer.displayName}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Phone */}
                                    <div className="hidden md:block col-span-2">
                                        <a href={`tel:${customer.phone}`} className="text-sm text-gray-600 hover:text-blue-600">
                                            {customer.phone}
                                        </a>
                                    </div>

                                    {/* Orders */}
                                    <div className="hidden md:block col-span-1">
                                        <span className="text-sm font-medium text-gray-900">{customer.totalOrders || 0}</span>
                                    </div>

                                    {/* Total Spent */}
                                    <div className="hidden md:block col-span-2">
                                        <span className="text-sm font-bold text-gray-900">฿{(customer.totalSpent || 0).toLocaleString()}</span>
                                    </div>

                                    {/* Last Order */}
                                    <div className="hidden md:block col-span-2">
                                        {customer.lastOrderAt ? (
                                            <span className="text-sm text-gray-500">
                                                {format(customer.lastOrderAt, 'd MMM yy', { locale: th })}
                                            </span>
                                        ) : (
                                            <span className="text-sm text-gray-300">-</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="col-span-4 md:col-span-2 flex items-center justify-end gap-1">
                                        <Link
                                            href={`/customers/${customer.id}`}
                                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"
                                            title="ดูรายละเอียด"
                                        >
                                            <Eye size={16} />
                                        </Link>

                                        <button
                                            onClick={() => setDeleteConfirm(customer.id)}
                                            className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                                            title="ลบ"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Mobile Stats */}
                                    <div className="col-span-12 md:hidden flex items-center gap-4 text-xs text-gray-500">
                                        <span>📱 {customer.phone}</span>
                                        <span>📦 {customer.totalOrders || 0}</span>
                                        <span className="font-bold text-gray-900">฿{(customer.totalSpent || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                                <span className="text-gray-500">
                                    {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredCustomers.length)} จาก {filteredCustomers.length}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="px-3 py-1">{currentPage} / {totalPages}</span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Delete Confirm Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-sm p-6 text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={28} className="text-red-500" />
                        </div>
                        <h3 className="font-bold text-lg text-gray-900 mb-2">ยืนยันการลบ?</h3>
                        <p className="text-sm text-gray-500 mb-6">ข้อมูลลูกค้าจะถูกลบถาวรและไม่สามารถกู้คืนได้</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-2.5 border rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
                            >
                                ลบ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
