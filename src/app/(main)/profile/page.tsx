"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ChevronLeft, User, ShoppingBag, MapPin, LogOut, ChevronRight, Settings, Ticket } from "lucide-react";

export default function ProfilePage() {
    const router = useRouter();
    const { userProfile, logout } = useAuth();

    const userPic = userProfile?.pictureUrl || userProfile?.photoURL;
    const userName = userProfile?.displayName || userProfile?.name || 'ลูกค้า';

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white sticky top-0 z-20 border-b border-gray-100">

                {/* Profile Card */}
                <div className="px-6 pb-6 pt-2 text-center">
                    <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center overflow-hidden mb-3 border-4 border-white shadow-sm">
                        {userPic ? (
                            <img src={userPic} alt={userName} className="w-full h-full object-cover" />
                        ) : (
                            <User size={32} className="text-gray-400" />
                        )}
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">{userName}</h2>
                    {userProfile?.email && <p className="text-sm text-gray-500">{userProfile.email}</p>}
                </div>
            </div>

            <main className="flex-1 p-4 space-y-4">
                {/* Menu Group 1 */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    <Link href="/myorder" className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                <ShoppingBag size={18} />
                            </div>
                            <span className="font-medium text-gray-900">ประวัติการสั่งซื้อ</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </Link>

                    <Link href="/profile/coupons" className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                                <Ticket size={18} />
                            </div>
                            <span className="font-medium text-gray-900">คูปองของฉัน</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </Link>

                    <Link href="/profile/address" className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                                <MapPin size={18} />
                            </div>
                            <span className="font-medium text-gray-900">สมุดที่อยู่</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-400" />
                    </Link>
                </div>

                {/* Menu Group 2 */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                    <button
                        onClick={() => logout()}
                        className="w-full flex items-center justify-between p-4 hover:bg-red-50 hover:text-red-600 transition-colors text-left"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center">
                                <LogOut size={18} />
                            </div>
                            <span className="font-medium">ออกจากระบบ</span>
                        </div>
                    </button>
                </div>

                <div className="text-center text-xs text-gray-400 pt-4">
                    E-Shop Application v1.0.0
                </div>
            </main>
        </div>
    );
}
