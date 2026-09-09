"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    BarChart3,
    ChevronRight,
    LayoutDashboard,
    LogOut,
    Package,
    Receipt,
    Settings,
    Shield,
    ShoppingBag,
    Sparkles,
    Tags,
    Ticket,
    User,
    UserCheck,
    UserCog,
    Users,
    X,
} from 'lucide-react';

interface AdminSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

interface MenuItem {
    href: string;
    label: string;
    icon: React.ElementType;
    badge?: number | string | null;
    badgeColor?: 'orange' | 'amber';
}

interface MenuGroup {
    id: string;
    title: string;
    items: MenuItem[];
}

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
    const { logout, userProfile } = useAuth();
    const pathname = usePathname();
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
    const [pendingSlipsCount, setPendingSlipsCount] = useState(0);
    const navRef = useRef<HTMLElement | null>(null);
    const [scrollbar, setScrollbar] = useState({ top: 0, height: 100, visible: false });

    // Listen to pending orders
    useEffect(() => {
        const q = query(
            collection(db, "orders"),
            where("status", "==", "pending")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingOrdersCount(snapshot.docs.length);
        }, (err) => {
            console.warn("Orders count error:", err);
        });

        return () => unsubscribe();
    }, []);

    // Listen to pending slip checks
    useEffect(() => {
        const q = query(
            collection(db, "payment_slips"),
            where("verifyStatus", "==", "pending")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingSlipsCount(snapshot.docs.length);
        }, (err) => {
            console.warn("Slip checks count error:", err);
        });

        return () => unsubscribe();
    }, []);

    // Listen to pending order edit requests
    const [pendingOrderRequestsCount, setPendingOrderRequestsCount] = useState(0);
    useEffect(() => {
        const fetchPendingCountFromApi = async () => {
            try {
                const res = await fetch("/api/order-requests?status=pending");
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data.requests)) {
                        setPendingOrderRequestsCount(data.requests.length);
                    }
                }
            } catch (e) {
                console.warn("Error fetching pending order requests count:", e);
            }
        };

        fetchPendingCountFromApi();

        const q = query(
            collection(db, "order_edit_requests"),
            where("status", "==", "pending")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingOrderRequestsCount(snapshot.docs.length);
        }, (err) => {
            console.warn("Order edit requests count error:", err);
            fetchPendingCountFromApi();
        });

        return () => unsubscribe();
    }, []);

    // Organized Navigation Groups
    const menuGroups: MenuGroup[] = [
        {
            id: 'overview',
            title: 'ภาพรวม & สถิติ',
            items: [
                { href: '/dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
                { href: '/reports', label: 'รายงานยอดขาย', icon: BarChart3 },
            ],
        },
        {
            id: 'sales-inventory',
            title: 'การขาย & สต็อกสินค้า',
            items: [
                {
                    href: '/orders',
                    label: 'คำสั่งซื้อ',
                    icon: ShoppingBag,
                    badge: pendingOrdersCount > 0 ? (pendingOrdersCount > 99 ? '99+' : pendingOrdersCount) : null,
                    badgeColor: 'orange',
                },
                {
                    href: '/order-requests',
                    label: 'คำขอแก้ไขออเดอร์',
                    icon: Sparkles,
                    badge: pendingOrderRequestsCount > 0 ? (pendingOrderRequestsCount > 99 ? '99+' : pendingOrderRequestsCount) : null,
                    badgeColor: 'amber',
                },
                {
                    href: '/slip-checks',
                    label: 'ตรวจสลิปโอนเงิน',
                    icon: Receipt,
                    badge: pendingSlipsCount > 0 ? (pendingSlipsCount > 99 ? '99+' : pendingSlipsCount) : null,
                    badgeColor: 'amber',
                },
                { href: '/products', label: 'จัดการสินค้า', icon: Package },
                { href: '/categories', label: 'หมวดหมู่สินค้า', icon: Tags },
            ],
        },
        {
            id: 'marketing-crm',
            title: 'ลูกค้า & การตลาด',
            items: [
                { href: '/customers', label: 'ข้อมูลลูกค้า', icon: Users },
                { href: '/promotions', label: 'โปรโมชั่น & คูปอง', icon: Ticket },
            ],
        },
        {
            id: 'settings-system',
            title: 'ระบบ & ตั้งค่า',
            items: [
                { href: '/employees', label: 'จัดการพนักงาน', icon: UserCog },
                { href: '/settings', label: 'ตั้งค่าร้านค้า', icon: Settings },
            ],
        },
    ];

    const isItemActive = (href: string) => {
        if (pathname === href) return true;
        if (pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`)) return true;
        return false;
    };

    const updateScrollbar = useCallback(() => {
        const nav = navRef.current;
        if (!nav) return;

        const { scrollTop, scrollHeight, clientHeight } = nav;
        const visible = scrollHeight > clientHeight + 1;
        const height = visible ? Math.max(14, (clientHeight / scrollHeight) * 100) : 100;
        const top = visible
            ? (scrollTop / Math.max(1, scrollHeight - clientHeight)) * (100 - height)
            : 0;

        setScrollbar({ top, height, visible });
    }, []);

    useEffect(() => {
        updateScrollbar();
        window.addEventListener('resize', updateScrollbar);
        return () => window.removeEventListener('resize', updateScrollbar);
    }, [updateScrollbar]);

    // Format display initials
    const displayName = userProfile?.displayName || userProfile?.name || 'Admin';
    const userRole = userProfile?.role || 'staff';
    const userInitial = displayName.trim().charAt(0).toUpperCase() || 'A';

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            <aside className={`fixed inset-y-0 left-0 bg-[radial-gradient(circle_at_88%_8%,rgba(249,115,22,0.28),transparent_14rem),linear-gradient(145deg,#06172c_0%,#0a2a52_55%,#0d3d6e_100%)] border-r border-white/10 z-50 w-72 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:sticky md:top-0 md:h-screen md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col shadow-2xl md:shadow-none`}>
                {/* Header: User Profile & Actions */}
                <div className="p-3.5 border-b border-white/10 bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="relative shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-600 text-white font-bold text-base flex items-center justify-center shadow-md shadow-orange-500/25 border border-white/20">
                                {userInitial}
                                <span
                                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#092548] rounded-full"
                                    title="ออนไลน์"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-white leading-tight">
                                    {displayName}
                                </p>
                                <div className="mt-0.5 flex items-center">
                                    {userRole === 'admin' ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-500/20 border border-amber-400/30 px-1.5 py-0.5 rounded">
                                            <Shield size={10} />
                                            ผู้ดูแลระบบ
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-300 bg-sky-500/20 border border-sky-400/30 px-1.5 py-0.5 rounded">
                                            <User size={10} />
                                            พนักงาน
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                            <button
                                onClick={() => logout()}
                                className="rounded-lg p-2 text-white/60 transition-colors hover:bg-red-500/20 hover:text-red-300"
                                title="ออกจากระบบ"
                                aria-label="ออกจากระบบ"
                            >
                                <LogOut size={18} />
                            </button>

                            {/* Mobile Close Button */}
                            <button
                                onClick={onClose}
                                className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white md:hidden"
                                aria-label="ปิดเมนู"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <div className="relative flex-1 min-h-0">
                    <nav
                        ref={navRef}
                        onScroll={updateScrollbar}
                        className="admin-sidebar-scroll h-full px-3.5 py-4 space-y-4 overflow-y-auto"
                    >
                        {menuGroups.map((group) => (
                            <div key={group.id} className="space-y-1">
                                {/* Group Title with subtle divider */}
                                <div className="px-3 pt-1 pb-1 flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                                        {group.title}
                                    </span>
                                    <div className="h-px flex-1 bg-white/[0.08]" />
                                </div>

                                {/* Menu Items */}
                                <div className="space-y-0.5">
                                    {group.items.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = isItemActive(item.href);

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={onClose}
                                                className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 ${isActive
                                                    ? 'bg-white text-[#0a2a52] font-semibold shadow-md shadow-black/20 ring-1 ring-white/20'
                                                    : 'text-slate-300 hover:bg-white/[0.09] hover:text-white hover:translate-x-0.5'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <Icon
                                                        size={18}
                                                        className={`shrink-0 transition-colors ${isActive
                                                            ? 'text-orange-500'
                                                            : 'text-white/60 group-hover:text-white'
                                                            }`}
                                                    />
                                                    <span className="truncate">{item.label}</span>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {item.badge !== null && item.badge !== undefined && (
                                                        <span
                                                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full text-white shadow-sm ${item.badgeColor === 'amber'
                                                                ? 'bg-amber-500'
                                                                : 'bg-orange-500'
                                                                }`}
                                                        >
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                    {isActive && (
                                                        <ChevronRight size={14} className="text-orange-500 shrink-0" />
                                                    )}
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    {/* Custom Scrollbar */}
                    {scrollbar.visible && (
                        <div className="pointer-events-none absolute bottom-4 right-1 top-4 w-1 rounded-full bg-white/5">
                            <div
                                className="absolute left-0 w-full rounded-full bg-white/30 transition-colors"
                                style={{
                                    height: `${scrollbar.height}%`,
                                    top: `${scrollbar.top}%`,
                                }}
                            />
                        </div>
                    )}
                </div>
            </aside>
        </>
    );
}


