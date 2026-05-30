"use client";

import { useCoupons } from "@/hooks/useCoupons";
import { ChevronLeft, Ticket, Calendar, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { MyCoupon } from "@/hooks/useCoupons";

const toDate = (value: MyCoupon["endDate"]) => {
    if (value instanceof Date) return value;
    if (typeof value === "object" && "toDate" in value) return value.toDate();
    return new Date(value);
};

export default function MyCouponsPage() {
    const { myCoupons, loading } = useCoupons();

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">

            <main className="flex-1 p-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 size={32} className="animate-spin text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500">กำลังโหลดคูปอง...</p>
                    </div>
                ) : myCoupons.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Ticket size={32} className="text-gray-300" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 mb-1">ไม่มีคูปอง</h2>
                        <p className="text-sm text-gray-500 mb-6 max-w-xs">คุณยังไม่มีคูปองส่วนลด ลองเก็บคูปองจากหน้ารายละเอียดสินค้า</p>
                        <Link href="/" className="px-6 py-2.5 bg-gray-900 text-white rounded-full font-medium text-sm hover:bg-gray-800 transition-colors">
                            เลือกซื้อสินค้า
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {myCoupons.map((coupon) => {
                            const endDate = coupon.endDate ? toDate(coupon.endDate) : null;
                            const isExpired = endDate ? endDate < new Date() : false;

                            return (
                                <div key={coupon.id} className={`bg-white rounded-xl border border-gray-200 overflow-hidden relative shadow-sm flex ${isExpired ? 'opacity-60 grayscale' : ''}`}>
                                    {/* Left Side (Discount) */}
                                    <div className="bg-orange-50 w-24 flex flex-col items-center justify-center border-r border-dashed border-gray-200 p-2 text-center relative">
                                        <div className="absolute -top-3 -bottom-3 -left-1 w-2 bg-radial-dots"></div>
                                        <Ticket size={24} className="text-orange-500 mb-1" />
                                        <span className="font-bold text-lg text-orange-600 leading-none">
                                            {coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `฿${coupon.discountValue}`}
                                        </span>
                                        <span className="text-[10px] text-orange-500 mt-1">ส่วนลด</span>
                                    </div>

                                    {/* Right Side (Details) */}
                                    <div className="flex-1 p-3 flex flex-col justify-between">
                                        <div>
                                            <h3 className="font-semibold text-gray-900 text-sm">{coupon.name}</h3>
                                            <p className="text-xs text-gray-500 mt-1">
                                                ซื้อขั้นต่ำ ฿{coupon.minPurchase.toLocaleString()}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
                                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                                <Calendar size={12} />
                                                หมดอายุ: {endDate
                                                    ? format(endDate, 'd MMM yy', { locale: th })
                                                    : 'ไม่มีวันหมดอายุ'}
                                            </div>

                                            {isExpired ? (
                                                <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">หมดอายุ</span>
                                            ) : (
                                                <Link href="/" className="text-xs font-bold text-blue-600 hover:underline">
                                                    ใช้เลย
                                                </Link>
                                            )}
                                        </div>
                                    </div>

                                    {/* Decorations */}
                                    <div className="absolute -top-2 left-[5.75rem] w-4 h-4 bg-gray-50 rounded-full"></div>
                                    <div className="absolute -bottom-2 left-[5.75rem] w-4 h-4 bg-gray-50 rounded-full"></div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
