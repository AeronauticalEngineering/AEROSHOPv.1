"use client";

import { XCircle } from "lucide-react";

type CancelOrderModalProps = {
    open: boolean;
    canceling: boolean;
    reason: string;
    error: string;
    onChangeReason: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
};

export default function CancelOrderModal({
    open,
    canceling,
    reason,
    error,
    onChangeReason,
    onClose,
    onConfirm
}: CancelOrderModalProps) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-all">
            <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                    <h3 className="font-semibold text-gray-900 text-sm">ยกเลิกออเดอร์</h3>
                    <button
                        onClick={onClose}
                        disabled={canceling}
                        className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                    >
                        <XCircle size={20} />
                    </button>
                </div>
                <div className="p-5 bg-[#F8F9FA] space-y-3">
                    <p className="text-xs text-gray-600">
                        คุณแน่ใจหรือไม่ว่าต้องการยกเลิกออเดอร์นี้? หากยกเลิกแล้วจะไม่สามารถย้อนกลับได้
                    </p>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-700">เหตุผล (ไม่บังคับ)</label>
                        <textarea
                            value={reason}
                            onChange={(e) => onChangeReason(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                            placeholder="ระบุเหตุผลการยกเลิก"
                        />
                    </div>
                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 flex gap-2 items-center">
                            <XCircle size={14} /> {error}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-gray-100 bg-white flex gap-3 pb-safe">
                    <button
                        onClick={onClose}
                        disabled={canceling}
                        className="flex-1 px-4 py-3 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        ปิด
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={canceling}
                        className="flex-1 px-4 py-3 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                        {canceling ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
                    </button>
                </div>
            </div>
        </div>
    );
}
