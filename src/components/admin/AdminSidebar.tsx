"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BarChart3, Bell, LayoutDashboard, Package, LogOut, ShoppingBag, Users, Settings, Store, Ticket, UserCog, Receipt, Tags } from 'lucide-react';

interface AdminSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
    const { logout, userProfile } = useAuth();
    const pathname = usePathname();
    const [pendingCount, setPendingCount] = useState(0);
    const navRef = useRef<HTMLElement | null>(null);
    const [scrollbar, setScrollbar] = useState({ top: 0, height: 100, visible: false });

    const menuItems = [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/products', label: 'สินค้า', icon: Package },
        { href: '/categories', label: 'หมวดหมู่', icon: Tags },
        { href: '/orders', label: 'คำสั่งซื้อ', icon: ShoppingBag },
        { href: '/reports', label: 'รายงาน', icon: BarChart3 },
        { href: '/customers', label: 'ลูกค้า', icon: Users },
        { href: '/promotions', label: 'โปรโมชั่น', icon: Ticket },
        { href: '/employees', label: 'พนักงาน', icon: UserCog },
        { href: '/slip-checks', label: 'ตรวจสลิป', icon: Receipt },
        { href: '/settings', label: 'ตั้งค่าร้านค้า', icon: Settings },
    ];

    useEffect(() => {
        const q = query(
            collection(db, "orders"),
            where("status", "==", "pending")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingCount(snapshot.docs.length);
        });

        return () => unsubscribe();
    }, []);

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

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            <aside className={`fixed inset-y-0 left-0 bg-[radial-gradient(circle_at_88%_8%,rgba(249,115,22,0.32),transparent_13rem),linear-gradient(135deg,#06172c_0%,#0b2f5b_58%,#0f4c81_100%)] border-r border-white/10 z-50 w-72 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:sticky md:top-0 md:h-screen md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col`}>
                {/* Header */}
                <div className="h-16 flex items-center justify-between gap-3 px-6 border-b border-white/10">
                    <div className="flex min-w-0 items-center gap-3 text-white">
                        <div className="shrink-0 p-1.5 bg-white/10 rounded-lg border border-white/10">
                            <Store size={20} className="text-white" />
                        </div>
                        <span className="truncate text-lg font-bold tracking-wide">Aero Shop</span>
                    </div>
                    <Link
                        href="/orders?status=pending"
                        className="relative shrink-0 rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                        onClick={onClose}
                        aria-label="Pending orders"
                    >
                        <Bell size={18} />
                        {pendingCount > 0 && (
                            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white ring-2 ring-[#06172c]">
                                {pendingCount > 9 ? '9+' : pendingCount}
                            </span>
                        )}
                    </Link>
                </div>

                {/* Navigation */}
                <div className="relative flex-1 min-h-0">
                    <nav
                        ref={navRef}
                        onScroll={updateScrollbar}
                        className="admin-sidebar-scroll h-full px-4 py-6 space-y-1 overflow-y-auto"
                    >
                        <p className="px-4 text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">
                            เมนูหลัก
                        </p>
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname.startsWith(item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClose}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                        ? 'bg-white text-[#0b2f5b] shadow-lg shadow-black/20'
                                        : 'text-white/60 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <Icon size={20} className={isActive ? 'text-orange-500' : 'text-white/60 group-hover:text-white transition-colors'} />
                                    <span className="font-medium">{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>
                    {scrollbar.visible && (
                        <div className="pointer-events-none absolute bottom-4 right-1 top-4 w-1.5 rounded-full bg-white/5">
                            <div
                                className="absolute left-0 w-full rounded-full bg-white/35 transition-colors"
                                style={{
                                    height: `${scrollbar.height}%`,
                                    top: `${scrollbar.top}%`,
                                }}
                            />
                        </div>
                    )}
                </div>

                <div className="border-t border-white/10 p-4">
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                                {userProfile?.displayName || 'Admin'}
                            </p>
                            <p className="text-xs capitalize text-white/40">
                                {userProfile?.role || 'Staff'}
                            </p>
                        </div>
                        <button
                            onClick={() => logout()}
                            className="shrink-0 rounded-lg p-2 text-white/60 transition-colors hover:bg-red-500/10 hover:text-red-300"
                            title="ออกจากระบบ"
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
