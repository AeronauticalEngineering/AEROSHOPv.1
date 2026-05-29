"use client";

import { useEffect } from "react";
import useLiffAuth from "@/hooks/useLiffAuth";
import { useAuth } from "@/context/AuthContext";

export default function MainLayout({ children }: { children: React.ReactNode }) {
    const { error: liffError, userProfile: liffProfile } = useLiffAuth();
    const { setUserProfileFromAuth, userProfile } = useAuth();

    // Sync LIFF profile to AuthContext
    useEffect(() => {
        if (liffProfile && userProfile?.uid !== liffProfile.uid) {
            setUserProfileFromAuth(liffProfile);
        }
    }, [liffProfile, setUserProfileFromAuth, userProfile]);

    // Show error if LIFF failed (but not in dev mock mode)
    if (liffError && !liffProfile) {
        return (
            <div className="customer-theme bg-gray-50 min-h-screen font-sans">
                <div className="mx-auto max-w-md bg-white flex items-center justify-center p-8">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-2xl">⚠️</span>
                        </div>
                        <h2 className="font-bold text-gray-900 mb-2">เกิดข้อผิดพลาด</h2>
                        <p className="text-sm text-gray-500 mb-4">{liffError}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
                        >
                            ลองใหม่
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="customer-theme bg-gray-50 min-h-screen md:pb-0 font-sans">
            <div className="mx-auto max-w-md bg-white overflow-hidden relative">
                {children}
            </div>
        </div>
    );
}
