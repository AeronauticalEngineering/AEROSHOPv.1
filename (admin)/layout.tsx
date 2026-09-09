"use client";

import { useAuth } from "@/context/AuthContext";
import useLiffAuth from "@/hooks/useLiffAuth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { loading: authLoading, userProfile: authProfile, setUserProfileFromAuth, logout } = useAuth();
    const useLiffForAdmin = false;
    const { loading: liffLoading, userProfile: liffProfile } = useLiffAuth({ enabled: useLiffForAdmin });

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const router = useRouter();

    // Combined Loading & Profile Logic
    const loading = authLoading || (useLiffForAdmin && liffLoading);
    const userProfile = authProfile || (useLiffForAdmin ? liffProfile : null);

    // Sync Profile
    useEffect(() => {
        if (!useLiffForAdmin) return;
        if (liffProfile && !authProfile) {
            setUserProfileFromAuth(liffProfile);
        }
    }, [useLiffForAdmin, liffProfile, authProfile, setUserProfileFromAuth]);

    useEffect(() => {
        if (!loading && !userProfile) {
            router.replace("/login");
            return;
        }
    }, [loading, userProfile, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                Loading Admin Panel...
            </div>
        );
    }

    if (!userProfile) return null;

    if (userProfile.role !== 'admin' && userProfile.role !== 'employee') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
                <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
                <button onClick={() => logout()} className="mt-4 bg-red-600 text-white px-4 py-2 rounded">Logout</button>
            </div>
        );
    }

    return (
        <div className="admin-theme flex min-h-screen">
            <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="flex-1 flex flex-col min-w-0">
                <div className="bg-white shadow px-4 md:hidden">
                    <AdminHeader onMenuClick={() => setSidebarOpen(true)} />
                </div>
                <main className="p-4 flex-1 overflow-auto w-full mx-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
