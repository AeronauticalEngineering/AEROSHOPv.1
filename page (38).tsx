"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Check, CheckCircle, Copy, CreditCard, QrCode, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useCart } from "@/context/CartContext";
import { doc, getDoc, addDoc, updateDoc, collection, query, where, getDocs, limit, serverTimestamp } from "firebase/firestore";
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
    totalAmount?: number;
    totalDiscount?: number;
    deliveryFee?: number;
    items?: OrderItem[];
    cancelReason?: string | null;
};

function CheckoutSuccessContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { clearCart } = useCart();
    const orderId = searchParams.get('orderId');
    const sessionId = searchParams.get('session_id');
    const [orderData, setOrderData] = useState<OrderData | null>(null);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [slipFile, setSlipFile] = useState<File | null>(null);
    const [slipPreview, setSlipPreview] = useState<string | null>(null);
    const [slipUploading, setSlipUploading] = useState(false);
    const [slipError, setSlipError] = useState("");
    const [slipUploaded, setSlipUploaded] = useState(false);
    const [sentBill, setSentBill] = useState(false);
    const [primaryConfirming, setPrimaryConfirming] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelError, setCancelError] = useState("");
    const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
    const slipUploadLockRef = useRef(false);
    const primaryConfirmLockRef = useRef(false);
    const successNotificationLockRef = useRef(false);
    const successNotificationPromiseRef = useRef<Promise<void> | null>(null);
    const autoSuccessNotificationAttemptRef = useRef(false);

    const [verificationStatus, setVerificationStatus] = useState<{
        type: 'success' | 'error' | 'pending' | 'manual';
        message: string;
    } | null>(null);

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

    useEffect(() => {
        const fetchSlip = async () => {
            if (!orderId) return;
            try {
                const q = query(
                    collection(db, "payment_slips"),
                    where("orderId", "==", orderId),
                    limit(1)
                );
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const data = snap.docs[0].data() as { base64?: string };
                    setSlipUploaded(true);
                    if (data.base64) {
                        setSlipPreview(data.base64);
                    }
                }
            } catch (error) {
                console.error("Error fetching slip:", error);
            }
        };
        fetchSlip();
    }, [orderId]);

    const getPromptPayQrUrl = () => {
        if (!storeSettings) return null;
        if (storeSettings.promptPayQrUrl) return storeSettings.promptPayQrUrl;
        if (!storeSettings.promptPayId || !orderData?.totalAmount) return null;
        const amount = Number(orderData.totalAmount);
        if (!Number.isFinite(amount)) return null;
        return `https://promptpay.io/${encodeURIComponent(storeSettings.promptPayId)}/${amount.toFixed(2)}`;
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const fileToBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
            reader.readAsDataURL(file);
        });

    const handleSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSlipError("");

        const maxBytes = 700 * 1024;
        if (file.size > maxBytes) {
            setSlipError("ไฟล์ใหญ่เกินไป (จำกัด 700KB) โปรดบีบอัดรูป");
            return;
        }

        setSlipFile(file);
        setSlipPreview(URL.createObjectURL(file));
    };

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

    const notifyPaymentResult = async (
        type: "manual" | "gateway_paid" | "failed",
        message?: string
    ) => {
        if (!orderId) return;
        try {
            await fetch("/api/orders/notify-payment-result", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId,
                    type,
                    message: message || null
                })
            });
        } catch (error) {
            console.error("Error notifying payment result:", error);
        }
    };

    const handleSlipUpload = async () => {
        if (!orderId || !orderData || !slipFile || slipUploading || slipUploaded || slipUploadLockRef.current) return false;
        slipUploadLockRef.current = true;
        setSlipUploading(true);
        setSlipError("");
        setVerificationStatus({ type: 'pending', message: 'กำลังตรวจสอบสลิป...' });

        try {
            let shouldContinue = false;
            const base64 = await fileToBase64(slipFile);
            setSlipPreview(base64);
            const newDoc = await addDoc(collection(db, "payment_slips"), {
                orderId: orderId,
                userId: orderData.userId || null,
                paymentMethod: orderData.paymentMethod || null,
                amount: orderData.totalAmount || 0,
                base64,
                mimeType: slipFile.type,
                size: slipFile.size,
                needsVerify: false,
                verifyStatus: "pending",
                verifyMessage: "รอตรวจสอบ",
                createdAt: serverTimestamp()
            });
            setSlipUploaded(true);

            // Check if slip verification is enabled in store settings
            if (storeSettings?.enableSlipVerify) {
                try {
                    const res = await fetch("/api/slipok/verify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ slipId: newDoc.id })
                    });

                    let newStatus = 'pending';
                    let newMessage = 'รอตรวจสอบ';

                    if (res.ok) {
                        const result = await res.json();

                        const serverStatus = result?.verifyStatus ?? result?.status;
                        const serverMessage = result?.verifyMessage ?? result?.message;
                        const isVerified = serverStatus === 'verified' || result?.success === true || result?.data?.valid === true;
                        const isManual = serverStatus === 'pending' || result?.isManualCheck === true;

                        if (isVerified) {
                            newStatus = serverStatus || 'verified';
                            newMessage = serverMessage || 'ตรวจสอบสลิปสำเร็จ: ยอดเงินถูกต้อง';
                        } else if (isManual) {
                            newStatus = serverStatus || 'pending';
                            newMessage = serverMessage || 'รอการตรวจสอบโดยเจ้าหน้าที่';
                        } else {
                            newStatus = serverStatus || 'rejected';
                            newMessage = serverMessage || 'สลิปไม่ถูกต้อง หรือไม่พบยอดเงิน';
                        }
                    } else {
                        throw new Error("Verification API Error");
                    }

                    // Update UI state
                    if (newStatus === 'verified') {
                        setVerificationStatus({ type: 'success', message: newMessage });
                        shouldContinue = true;
                    } else if (newStatus === 'pending') {
                        setVerificationStatus({ type: 'manual', message: newMessage });
                        await notifyPaymentResult("manual", newMessage);
                        shouldContinue = true;
                    } else {
                        setVerificationStatus({ type: 'error', message: newMessage });
                        await notifyPaymentResult("failed", newMessage);
                    }

                    // Persist to Firestore
                    if (newStatus !== 'error') {
                        const slipRef = doc(db, "payment_slips", newDoc.id);
                        await updateDoc(slipRef, {
                            verifyStatus: newStatus,
                            verifyMessage: newMessage,
                            lastCheckedAt: serverTimestamp()
                        });
                    }

                } catch (verifyError) {
                    console.warn("Slip verification failed, switching to manual check mode:", verifyError);
                    setVerificationStatus({ type: 'manual', message: 'รอการตรวจสอบโดยเจ้าหน้าที่' });
                    await notifyPaymentResult("manual", "รอการตรวจสอบโดยเจ้าหน้าที่");
                    shouldContinue = true;
                }
            } else {
                console.log("Slip verification disabled, using manual check mode.");
                setVerificationStatus({ type: 'manual', message: 'รอการตรวจสอบโดยเจ้าหน้าที่' });
                await notifyPaymentResult("manual", "รอการตรวจสอบโดยเจ้าหน้าที่");
                shouldContinue = true;
            }
            return shouldContinue;
        } catch (error) {
            console.error("Error uploading slip:", error);
            setSlipError("อัปโหลดสลิปไม่สำเร็จ");
            setVerificationStatus({ type: 'error', message: 'อัปโหลดสลิปไม่สำเร็จ' });
            return false;
        } finally {
            slipUploadLockRef.current = false;
            setSlipUploading(false);
        }
    };

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

    const summaryCards: Array<{ label: string; value: string }> = [
        ...(!hasPaymentPanel
            ? [
                { label: "ORDER", value: formatOrderId(orderData || orderId, 12) },
                { label: "PAYMENT", value: paymentMethodLabel }
            ]
            : [])
    ];

    const handleConfirmPayment = async () => {
        if (!hasPaymentPanel) return true;
        if (slipUploaded || slipUploading) return true;
        if (!slipFile) {
            setSlipError("");
            setVerificationStatus({
                type: "manual",
                message: "ยืนยันคำสั่งซื้อแล้ว สามารถแนบสลิปภายหลังได้"
            });
            return true;
        }
        return await handleSlipUpload();
    };

    const handlePrimaryConfirm = async () => {
        if (primaryConfirmLockRef.current) return;
        primaryConfirmLockRef.current = true;
        setPrimaryConfirming(true);
        if (hasPaymentPanel && !slipUploaded) {
            const confirmed = await handleConfirmPayment();
            if (!confirmed) {
                primaryConfirmLockRef.current = false;
                setPrimaryConfirming(false);
                return;
            }
        }
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

    if (loading) return (
        <div className="min-h-screen bg-slate-100 px-4 pb-28 pt-5 font-sans text-slate-900">
            <div className="mx-auto w-full max-w-3xl space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-56 animate-pulse rounded bg-slate-100" />
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white">
                                <Check size={14} />
                            </div>
                            <span className="text-xs font-medium text-gray-400">ชำระเงิน</span>
                        </div>
                        <div className="h-0.5 w-8 bg-gray-900" />
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">3</div>
                            <span className="text-xs font-medium text-gray-900">สำเร็จ</span>
                        </div>
                    </div>
                </header>

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <CheckCircle size={20} className="text-emerald-500" strokeWidth={3} />
                            <h2 className="text-base font-semibold">ยืนยันคำสั่งซื้อ</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            {orderData && orderData.status !== "cancelled" && orderData.status !== "completed" && (
                                <button
                                    onClick={() => setIsCancelModalOpen(true)}
                                    disabled={canceling}
                                    className="rounded-full border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                    {canceling ? "กำลังยกเลิก..." : "ยกเลิกออเดอร์"}
                                </button>
                            )}
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${isPaid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                                {isPaid ? "ชำระแล้ว" : "รอชำระ"}
                            </span>
                        </div>
                    </div>

                    {summaryCards.length > 0 && (
                        <div className={`mt-4 grid gap-2 ${summaryCards.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                            {summaryCards.map((card) => (
                                <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{card.label}</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-900">{card.value}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="space-y-2 border-b border-dashed border-slate-200 pb-3">
                            {orderData?.items?.map((item, i) => (
                                <div key={i} className="flex items-start justify-between gap-3 text-sm">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-slate-900">{item.productName}</p>
                                        <p className="text-xs text-slate-500">
                                            x {item.quantity}{item.variantInfo ? ` • ${item.variantInfo}` : ""}
                                        </p>
                                    </div>
                                    <p className="shrink-0 font-semibold text-slate-900">฿{((item.finalPrice || item.price) * item.quantity).toLocaleString()}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-3 space-y-1.5 text-sm">
                            <div className="flex items-center justify-between text-slate-500">
                                <span>ค่าจัดส่ง</span>
                                <span>{orderData?.deliveryFee ? `฿${orderData.deliveryFee.toLocaleString()}` : "ฟรี"}</span>
                            </div>
                            {(orderData?.totalDiscount || 0) > 0 && (
                                <div className="flex items-center justify-between text-red-500">
                                    <span>ส่วนลด</span>
                                    <span>-฿{(orderData?.totalDiscount || 0).toLocaleString()}</span>
                                </div>
                            )}
                            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                                <span className="text-sm font-semibold text-slate-900">ยอดชำระทั้งหมด</span>
                                <span className="text-lg font-bold text-slate-900">฿{orderData?.totalAmount?.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </section>

                {hasPaymentPanel && storeSettings && (
                    <section id="payment-section" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                {orderData?.paymentMethod === "promptpay" ? <QrCode size={16} /> : <CreditCard size={16} />}
                                การชำระเงิน
                            </h3>
                            <span className="shrink-0 text-[11px] text-slate-500">{formatOrderId(orderData || orderId, 8)}</span>
                        </div>

                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            {orderData?.paymentMethod === "promptpay" ? (
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const qrUrl = getPromptPayQrUrl();
                                            if (qrUrl) setPreviewImage({ src: qrUrl, alt: "QR Code สำหรับชำระเงิน" });
                                        }}
                                        className="h-28 w-28 shrink-0 rounded-xl border border-slate-200 bg-white p-2"
                                    >
                                        {getPromptPayQrUrl() ? (
                                            <img
                                                src={getPromptPayQrUrl() as string}
                                                alt="QR Code สำหรับชำระเงิน"
                                                className="h-full w-full object-contain"
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-center text-[10px] text-slate-400">
                                                ไม่พบ QR
                                            </div>
                                        )}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-slate-900">PromptPay QR</p>
                                        {storeSettings.promptPayAccountName && (
                                            <p className="mt-1 text-[11px] font-semibold text-slate-700">
                                                ผู้รับโอน: {storeSettings.promptPayAccountName}
                                            </p>
                                        )}
                                        <p className="mt-1 text-[11px] text-slate-500">สแกนจ่ายยอด ฿{orderData?.totalAmount?.toLocaleString()}</p>
                                        {storeSettings.promptPayId && (
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(storeSettings.promptPayId || "")}
                                                className="mt-2 inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] font-bold text-slate-900"
                                            >
                                                <span className="truncate">{storeSettings.promptPayId}</span>
                                                {copied ? <CheckCircle size={10} className="shrink-0 text-emerald-500" /> : <Copy size={10} className="shrink-0 text-slate-400" />}
                                            </button>
                                        )}
                                        <p className="mt-2 text-[10px] text-slate-400">แนบสลิปหลังชำระเงิน</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex justify-between gap-3 text-xs">
                                        <span className="text-slate-500">ธนาคาร</span>
                                        <span className="text-right font-semibold text-slate-900">{storeSettings.bankName || "-"}</span>
                                    </div>
                                    <div className="flex justify-between gap-3 text-xs">
                                        <span className="text-slate-500">ชื่อบัญชี</span>
                                        <span className="text-right font-semibold text-slate-900">{storeSettings.bankAccountName || "-"}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                                        <span className="text-xs text-slate-500">เลขที่บัญชี</span>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(storeSettings.bankAccountNumber || "")}
                                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-900"
                                        >
                                            {storeSettings.bankAccountNumber || "-"}
                                            {copied ? <CheckCircle size={10} className="text-emerald-500" /> : <Copy size={10} className="text-slate-400" />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="mt-3 border-t border-slate-200 pt-3">
                                {slipPreview && (
                                    <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
                                        <button
                                            type="button"
                                            onClick={() => setPreviewImage({ src: slipPreview, alt: "สลิปการชำระเงิน" })}
                                            className="h-14 w-14 shrink-0 overflow-hidden rounded-md"
                                        >
                                            <img
                                                src={slipPreview}
                                                alt="สลิปการชำระเงิน"
                                                className="h-full w-full object-cover"
                                            />
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium text-slate-900">{slipFile?.name || "สลิปการชำระเงิน"}</p>
                                            <p className="text-[10px] text-slate-400">{slipUploaded ? "อัปโหลดแล้ว" : "พร้อมยืนยัน"}</p>
                                        </div>
                                    </div>
                                )}
                                {!slipUploaded && (
                                    <label className="block w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                        {slipFile ? "เปลี่ยนรูปสลิป" : "แนบสลิป"}
                                        <input type="file" accept="image/*" className="hidden" onChange={handleSlipChange} />
                                    </label>
                                )}
                                {slipUploaded && (
                                    <div className={`rounded-lg border px-3 py-2 text-xs ${verificationStatus?.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
                                        verificationStatus?.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                                            verificationStatus?.type === 'manual' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                'bg-slate-50 text-slate-700 border-slate-200'
                                        }`}>
                                        {verificationStatus?.message || "แนบสลิปเรียบร้อย"}
                                    </div>
                                )}
                                {slipError && <p className="mt-1.5 text-[10px] text-red-500">{slipError}</p>}
                            </div>
                        </div>
                    </section>
                )}

            </div>

            <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white px-4 py-3 pb-6 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
                {hasPaymentPanel ? (
                    <button
                        type="button"
                        onClick={handlePrimaryConfirm}
                        disabled={slipUploading || primaryConfirming}
                        className="flex w-full items-center justify-center rounded-full bg-slate-900 py-3.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                        {slipUploading || primaryConfirming ? "กำลังยืนยัน..." : "ยืนยัน"}
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
                            {primaryConfirming ? "กำลังยืนยัน..." : "ยืนยันคำสั่งซื้อ"}
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

export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
            </div>
        }>
            <CheckoutSuccessContent />
        </Suspense>
    );
}
