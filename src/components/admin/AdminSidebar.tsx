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
    const [pendingOrderRequestsCount, setPendingOrderRequestsCount] = useState(0);
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
                },
                {
                    href: '/order-requests',
                    label: 'คำขอแก้ไขออเดอร์',
                    icon: Sparkles,
                    badge: pendingOrderRequestsCount > 0 ? (pendingOrderRequestsCount > 99 ? '99+' : pendingOrderRequestsCount) : null,
                },
                {
                    href: '/slip-checks',
                    label: 'ตรวจสลิปโอนเงิน',
                    icon: Receipt,
                    badge: pendingSlipsCount > 0 ? (pendingSlipsCount > 99 ? '99+' : pendingSlipsCount) : null,
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
                    className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 md:hidden transition-opacity duration-200"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar Container: Clean, Calm Dark Navy-Slate (Zero-Noise) */}
            <aside className={`fixed inset-y-0 left-0 bg-[#091424] border-r border-slate-800/80 z-50 w-64 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:sticky md:top-0 md:h-screen md:translate-x-0 transition-transform duration-250 ease-out flex flex-col shadow-xl md:shadow-none select-none`}>
                
                {/* Header: Compact User Profile Card */}
                <div className="p-3 border-b border-slate-800/80 bg-slate-900/40">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="relative shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 text-slate-100 font-semibold text-xs flex items-center justify-center border border-slate-700/80 shadow-2xs">
                                {userInitial}
                                <span
                                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 border-[1.5px] border-[#091424] rounded-full"
                                    title="ออนไลน์"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-100 leading-tight">
                                    {displayName}
                                </p>
                                <div className="mt-0.5 flex items-center">
                                    {userRole === 'admin' ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300/90 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                            <Shield size={9} />
                                            ผู้ดูแลระบบ
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-300/90 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                                            <User size={9} />
                                            พนักงาน
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                            <button
                                onClick={() => logout()}
                                className="rounded-md p-1.5 text-slate-400 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
                                title="ออกจากระบบ"
                                aria-label="ออกจากระบบ"
                            >
                                <LogOut size={15} />
                            </button>

                            {/* Mobile Close Button */}
                            <button
                                onClick={onClose}
                                className="rounded-md p-1.5 text-slate-400 hover:text-white hover:bg-white/5 transition-colors md:hidden cursor-pointer"
                                aria-label="ปิดเมนู"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Navigation Menu List */}
                <div className="relative flex-1 min-h-0">
                    <nav
                        ref={navRef}
                        onScroll={updateScrollbar}
                        className="admin-sidebar-scroll h-full px-2.5 py-3 space-y-3.5 overflow-y-auto"
                    >
                        {menuGroups.map((group) => (
                            <div key={group.id} className="space-y-0.5">
                                {/* Group Title with clean subtle divider */}
                                <div className="px-2.5 pt-1.5 pb-1 flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400/70">
                                        {group.title}
                                    </span>
                                    <div className="h-px flex-1 bg-white/[0.05]" />
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
                                                className={`group flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                                                    isActive
                                                        ? 'bg-white/10 text-white font-semibold border border-white/10 shadow-2xs'
                                                        : 'text-slate-300/85 hover:bg-white/[0.05] hover:text-white'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <Icon
                                                        size={15}
                                                        className={`shrink-0 transition-colors ${
                                                            isActive
                                                                ? 'text-orange-400'
                                                                : 'text-slate-400 group-hover:text-slate-200'
                                                        }`}
                                                    />
                                                    <span className="truncate">{item.label}</span>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {/* Clean & Compact Badge (Zero-Noise) */}
                                                    {item.badge !== null && item.badge !== undefined && (
                                                        <span
                                                            className={`inline-flex items-center justify-center min-w-[19px] h-[17px] px-1 text-[10px] font-mono font-semibold rounded-full transition-all ${
                                                                isActive
                                                                    ? 'bg-orange-400/25 text-orange-300 ring-1 ring-orange-400/40'
                                                                    : 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/25 group-hover:bg-orange-500/25'
                                                            }`}
                                                        >
                                                            {item.badge}
                                                        </span>
                                                    )}
                                                    {isActive && (
                                                        <ChevronRight size={13} className="text-orange-400 shrink-0 opacity-80" />
                                                    )}
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    {/* Custom Minimal Scrollbar */}
                    {scrollbar.visible && (
                        <div className="pointer-events-none absolute bottom-3 right-1 top-3 w-1 rounded-full bg-white/5">
                            <div
                                className="absolute left-0 w-full rounded-full bg-white/20 transition-colors"
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
