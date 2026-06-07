"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Check, CheckCircle, MapPin, Phone, ReceiptText, User, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useCart } from "@/context/CartContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { StoreSettings } from "@/types/store";
import useLiff from "@/hooks/useLiff";
import { buildReceiptFlexMessage } from "@/lib/line/flex";
import CancelOrderModal from "@/components/CancelOrderModal";
import { formatOrderId } from "@/lib/orderId";

type OrderItem = {
    productName: string;
    quantity: number;
    price: number;
    finalPrice?: number;
    variantInfo?: string | null;
};

type OrderData = {
    id?: string;
    orderNo?: string;
    userId?: string | null;
    status?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    customerName?: string;
    customerPhone?: string;
    shippingAddress?: string;
    shippingOptionName?: string;
    subTotal?: number;
    totalAmount?: number;
    totalDiscount?: number;
    deliveryFee?: number;
    items?: OrderItem[];
    cancelReason?: string | null;
};

type CheckoutOrderSummaryPageProps = {
    orderId?: string;
    sessionId?: string;
};

function CheckoutSuccessContent({ orderId: orderIdOverride, sessionId: sessionIdOverride }: CheckoutOrderSummaryPageProps = {}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { clearCart } = useCart();
    const orderId = orderIdOverride || searchParams.get('orderId');
    const sessionId = sessionIdOverride || searchParams.get('session_id');
    const [orderData, setOrderData] = useState<OrderData | null>(null);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [sentBill, setSentBill] = useState(false);
    const [primaryConfirming, setPrimaryConfirming] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelError, setCancelError] = useState("");
    const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
    const primaryConfirmLockRef = useRef(false);
    const successNotificationLockRef = useRef(false);
    const successNotificationPromiseRef = useRef<Promise<void> | null>(null);
    const autoSuccessNotificationAttemptRef = useRef(false);

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    const { liff } = useLiff(liffId);

    useEffect(() => {
        const fetchData = async () => {
            if (!orderId) return;
            try {
                // Prepare queries
                const orderRef = doc(db, "orders", orderId);
                const settingsRef = doc(db, "settings", "store");

                // Fetch in parallel
                const [orderSnap, settingsSnap] = await Promise.all([
                    getDoc(orderRef),
                    getDoc(settingsRef)
                ]);

                if (orderSnap.exists()) {
                    setOrderData({ id: orderSnap.id, ...orderSnap.data() });
                }
                if (settingsSnap.exists()) {
                    setStoreSettings(settingsSnap.data() as StoreSettings);
                }
            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };

        clearCart();
        sessionStorage.removeItem('checkout_address');
        fetchData();
    }, [orderId, clearCart]);

    useEffect(() => {
        const verifySession = async () => {
            if (!orderId || !sessionId) return;
            try {
                const res = await fetch("/api/stripe/verify-session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderId, session_id: sessionId })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.payment_status === 'paid') {
                        setOrderData((prev) => prev ? { ...prev, status: "paid", paymentStatus: "paid" } : prev);
                    }
                }
            } catch (error) {
                console.error("Error verifying Stripe session:", error);
            }
        };
        verifySession();
    }, [orderId, sessionId]);

    const closeLiffWindow = () => {
        if (!liff || typeof liff.isInClient !== "function") return;
        if (!liff.isInClient()) return;
        if (typeof liff.closeWindow === "function") {
            liff.closeWindow();
        }
    };

    const getSessionFlag = useCallback((key: string) => {
        if (typeof window === "undefined") return false;
        try {
            return sessionStorage.getItem(key) === "1";
        } catch (error) {
            console.warn("Unable to read session notification flag:", error);
            return false;
        }
    }, []);

    const setSessionFlag = useCallback((key: string) => {
        if (typeof window === "undefined") return;
        try {
            sessionStorage.setItem(key, "1");
        } catch (error) {
            console.warn("Unable to write session notification flag:", error);
        }
    }, []);

    const getLocalFlag = useCallback((key: string) => {
        if (typeof window === "undefined") return false;
        try {
            return localStorage.getItem(key) === "1";
        } catch (error) {
            console.warn("Unable to read local notification flag:", error);
            return false;
        }
    }, []);

    const setLocalFlag = useCallback((key: string) => {
        if (typeof window === "undefined") return;
        try {
            localStorage.setItem(key, "1");
        } catch (error) {
            console.warn("Unable to write local notification flag:", error);
        }
    }, []);

    const notifyOrderCreated = useCallback(async () => {
        if (!orderId) return { customerNotified: false };
        try {
            const res = await fetch("/api/orders/notify-created", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId })
            });
            if (!res.ok) return { customerNotified: false };
            const data = await res.json().catch(() => ({}));
            return { customerNotified: data?.customerNotified === true };
        } catch (error) {
            console.error("Error notifying created order:", error);
            return { customerNotified: false };
        }
    }, [orderId]);

    const handleCancelOrder = async () => {
        if (!orderId || !orderData || canceling) return;
        if (orderData?.status === "cancelled" || orderData?.status === "completed") return;
        try {
            setCanceling(true);
            const res = await fetch("/api/orders/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId,
                    status: "cancelled",
                    cancelReason: cancelReason || null
                })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Update failed");
            }
            setOrderData((prev) => prev ? { ...prev, status: "cancelled", cancelReason: cancelReason || null } : prev);
            setIsCancelModalOpen(false);
            setCancelReason("");
            setCancelError("");
        } catch (error) {
            console.error("Error cancelling order:", error);
            setCancelError("ยกเลิกออเดอร์ไม่สำเร็จ");
        } finally {
            setCanceling(false);
        }
    };

    const handleSendBill = useCallback(async () => {
        if (!liff || !liff.isInClient() || !orderData || sentBill) return false;

        try {
            await liff.sendMessages([
                buildReceiptFlexMessage({
                    orderId: orderId || "",
                    liffId: liffId || "",
                    orderData
                })
            ]);
            setSentBill(true);
            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            return false;
        }
    }, [liff, liffId, orderData, orderId, sentBill]);

    const handleSuccessNotification = useCallback(async () => {
        if (successNotificationPromiseRef.current) {
            return successNotificationPromiseRef.current;
        }
        if (!orderId || !orderData || successNotificationLockRef.current) return;
        if (orderData.status === "cancelled") return;

        const notificationTask = (async () => {
            successNotificationLockRef.current = true;
            const isGatewayPaid =
                (orderData.paymentMethod === "stripe" || orderData.paymentMethod === "omise") &&
                (orderData.paymentStatus === "paid" || orderData.status === "paid" || orderData.status === "completed");

            if ((orderData.paymentMethod === "stripe" || orderData.paymentMethod === "omise") && !isGatewayPaid) {
                return;
            }

            const adminSessionKey = `order-created-notified:${orderId}`;
            const adminLocalKey = `order-created-notified:${orderId}`;
            if (!getSessionFlag(adminSessionKey) && !getLocalFlag(adminLocalKey)) {
                setSessionFlag(adminSessionKey);
                setLocalFlag(adminLocalKey);
                await notifyOrderCreated();
            }

            const messageSessionKey = `checkout-customer-sendmessage-v2:${orderId}`;
            const messageLocalKey = `checkout-customer-sendmessage-v2:${orderId}`;
            if (getSessionFlag(messageSessionKey) || getLocalFlag(messageLocalKey)) {
                setSentBill(true);
                return;
            }

            if (liff && typeof liff.isInClient === "function" && liff.isInClient()) {
                const sent = await handleSendBill();
                if (sent) {
                    setSessionFlag(messageSessionKey);
                    setLocalFlag(messageLocalKey);
                }
            } else {
                console.info("Skipping customer sendMessage because page is not running inside LINE LIFF client.");
            }

        })();

        successNotificationPromiseRef.current = notificationTask
            .catch((error) => {
                console.error("Checkout success notification failed, continuing order flow:", error);
            })
            .finally(() => {
                successNotificationLockRef.current = false;
                successNotificationPromiseRef.current = null;
            });

        return successNotificationPromiseRef.current;
    }, [getLocalFlag, getSessionFlag, handleSendBill, liff, notifyOrderCreated, orderData, orderId, setLocalFlag, setSessionFlag]);

    useEffect(() => {
        if (!orderId || !orderData || autoSuccessNotificationAttemptRef.current) return;
        const isGatewayOrder = orderData.paymentMethod === "stripe" || orderData.paymentMethod === "omise";
        const isGatewayPaid =
            orderData.paymentStatus === "paid" ||
            orderData.status === "paid" ||
            orderData.status === "completed";
        if (isGatewayOrder && !isGatewayPaid) return;
        if (!liff || typeof liff.isInClient !== "function" || !liff.isInClient()) return;

        autoSuccessNotificationAttemptRef.current = true;
        void handleSuccessNotification();
    }, [orderId, orderData, liff, handleSuccessNotification]);

    const paymentMethodTextMap: Record<string, string> = {
        promptpay: "พร้อมเพย์",
        bank_transfer: "โอนเงินเข้าบัญชี",
        cod: "เก็บเงินปลายทาง",
        stripe: "บัตรเครดิต/เดบิต (Stripe)",
        omise: "บัตรเครดิต/เดบิต (Omise)"
    };

    const paymentMethodLabel = orderData?.paymentMethod
        ? paymentMethodTextMap[orderData.paymentMethod] || orderData.paymentMethod
        : "-";
    const orderDisplayId = formatOrderId(orderData || orderId, 12);
    const subtotal = orderData?.subTotal ?? orderData?.items?.reduce((sum, item) => {
        return sum + ((item.finalPrice || item.price) * item.quantity);
    }, 0) ?? 0;
    const deliveryFee = orderData?.deliveryFee ?? 0;
    const totalDiscount = orderData?.totalDiscount ?? 0;
    const totalAmount = orderData?.totalAmount ?? 0;

    const isPaid =
        orderData?.paymentStatus === "paid" ||
        orderData?.paymentStatus === "verified" ||
        orderData?.status === "paid" ||
        orderData?.status === "completed";

    const hasPaymentPanel = Boolean(
        orderData &&
        (orderData.paymentMethod === "bank_transfer" || orderData.paymentMethod === "promptpay") &&
        storeSettings
    );

    const handlePrimaryConfirm = async () => {
        if (primaryConfirmLockRef.current) return;
        primaryConfirmLockRef.current = true;
        setPrimaryConfirming(true);
        await handleSuccessNotification().catch((error) => {
            console.error("Checkout notification skipped after confirm:", error);
        });
        if (liff && typeof liff.isInClient === "function" && liff.isInClient()) {
            closeLiffWindow();
            return;
        }
        if (orderId) {
            router.push(`/myorder/${orderId}`);
        }
    };

    const handleSaveOrder = async () => {
        if (primaryConfirmLockRef.current) return;
        primaryConfirmLockRef.current = true;
        setPrimaryConfirming(true);
        await handleSuccessNotification().catch((error) => {
            console.error("Checkout notification skipped after save:", error);
        });
        if (liff && typeof liff.isInClient === "function" && liff.isInClient()) {
            closeLiffWindow();
            return;
        }
        if (orderId) {
            router.push(`/myorder/${orderId}`);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-100 px-4 pb-28 pt-5 font-sans text-slate-900">
            <div className="mx-auto w-full max-w-3xl space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 ">
                    <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-56 animate-pulse rounded bg-slate-100" />
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 ">
                    <div className="space-y-2">
                        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="h-11 animate-pulse rounded-xl bg-slate-300" />
                    <div className="h-11 animate-pulse rounded-xl border border-slate-200 bg-white" />
                </div>
            </div>
        </div>
    );
    return (
        <div className="min-h-screen bg-slate-100 px-4 py-5 font-sans text-slate-900">
            <div className="mx-auto w-full max-w-3xl space-y-4">
                <header className="rounded-none bg-white px-4 py-4">
                    <div className="flex items-center justify-center gap-2">
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white">
                                <Check size={14} />
                            </div>
                            <span className="text-xs font-medium text-gray-400">ที่อยู่</span>
                        </div>
                        <div className="h-0.5 w-8 bg-gray-900" />
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
                                2
                            </div>
                            <span className="text-xs font-medium text-gray-900">สรุปรายการ</span>
                        </div>
                        <div className="h-0.5 w-8 bg-gray-200" />
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-400">3</div>
                            <span className="text-xs font-medium text-gray-400">ชำระเงิน</span>
                        </div>
                    </div>
                </header>

                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <CheckCircle size={20} className="text-emerald-500" strokeWidth={3} />
                                <h2 className="text-base font-bold text-slate-900">ยืนยันการสั่งซื้อ</h2>
                            </div>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                                ตรวจสอบข้อมูลให้ครบถ้วนก่อนชำระเงิน • {orderDisplayId}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {orderData && orderData.status !== "cancelled" && orderData.status !== "completed" && (
                                <button
                                    onClick={() => setIsCancelModalOpen(true)}
                                    disabled={canceling}
                                    className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                                >
                                    {canceling ? "กำลังยกเลิก..." : "ยกเลิกออเดอร์"}
                                </button>
                            )}
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${isPaid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                                {isPaid ? "ชำระแล้ว" : "รอชำระ"}
                            </span>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
                        <div className="divide-y divide-dashed divide-slate-200">
                            {orderData?.items?.map((item, i) => (
                                <div key={i} className="flex items-start justify-between gap-3 px-3 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold text-slate-900">{item.productName}</p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            x {item.quantity}{item.variantInfo ? ` • ${item.variantInfo}` : ""}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-bold text-slate-900">฿{((item.finalPrice || item.price) * item.quantity).toLocaleString()}</p>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-slate-200 px-3 py-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="flex items-start gap-2">
                                    <User size={15} className="mt-0.5 shrink-0 text-slate-400" />
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">ผู้รับ</p>
                                        <p className="truncate text-sm font-semibold text-slate-900">{orderData?.customerName || "-"}</p>
                                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                                            <Phone size={12} /> {orderData?.customerPhone || "-"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <ReceiptText size={15} className="mt-0.5 shrink-0 text-slate-400" />
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">การชำระเงิน</p>
                                        <p className="text-sm font-semibold text-slate-900">{paymentMethodLabel}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <MapPin size={15} className="mt-0.5 shrink-0 text-slate-400" />
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{orderData?.shippingOptionName || "ที่อยู่จัดส่ง"}</p>
                                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{orderData?.shippingAddress || "ไม่ระบุ"}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5 border-t border-slate-200 px-3 py-3 text-sm">
                            <div className="flex items-center justify-between text-slate-500">
                                <span>รวมสินค้า</span>
                                <span>฿{subtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-500">
                                <span>ค่าจัดส่ง</span>
                                <span>{deliveryFee ? `฿${deliveryFee.toLocaleString()}` : "ฟรี"}</span>
                            </div>
                            {totalDiscount > 0 && (
                                <div className="flex items-center justify-between text-red-500">
                                    <span>ส่วนลด</span>
                                    <span>-฿{totalDiscount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                                <span className="text-sm font-bold text-slate-900">ยอดชำระทั้งหมด</span>
                                <span className="text-xl font-extrabold text-slate-900">฿{totalAmount.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </section>

            </div>

            <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white px-4 py-3 pb-6 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
                {hasPaymentPanel ? (
                    <button
                        type="button"
                        onClick={handleSaveOrder}
                        disabled={primaryConfirming}
                        className="flex w-full items-center justify-center rounded-full bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                        {primaryConfirming ? "กำลังบันทึก..." : "เสร็จสิ้น"}
                    </button>
                ) : (
                    <div className="grid grid-cols-[1fr_1.25fr] gap-2">
                        <Link
                            href="/"
                            className="flex w-full items-center justify-center rounded-full border border-slate-300 bg-white py-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            หน้าหลัก
                        </Link>
                        <button
                            type="button"
                            onClick={handlePrimaryConfirm}
                            disabled={primaryConfirming}
                            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                            {primaryConfirming ? "กำลังยืนยัน..." : "ยืนยันการสั่งซื้อ"}
                        </button>
                    </div>
                )}
            </div>

            <CancelOrderModal
                open={isCancelModalOpen}
                canceling={canceling}
                reason={cancelReason}
                error={cancelError}
                onChangeReason={setCancelReason}
                onClose={() => {
                    if (canceling) return;
                    setIsCancelModalOpen(false);
                    setCancelReason("");
                    setCancelError("");
                }}
                onConfirm={handleCancelOrder}
            />

            {previewImage && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setPreviewImage(null)}
                >
                    <div className="relative w-full max-w-sm" onClick={(event) => event.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute -top-11 right-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                            aria-label="ปิดรูปภาพ"
                        >
                            <X size={20} />
                        </button>
                        <div className="rounded-2xl bg-white p-3">
                            <img
                                src={previewImage.src}
                                alt={previewImage.alt}
                                className="max-h-[75vh] w-full rounded-xl object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

export default function CheckoutSuccessPage(props: CheckoutOrderSummaryPageProps = {}) {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <CheckoutSuccessContent {...props} />
        </Suspense>
    );
}
