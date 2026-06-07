"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, addDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useParams } from "next/navigation";
import { Package, Clock, CheckCircle, Truck, XCircle, MapPin, CreditCard, Copy, Check, Loader2, RotateCcw, CircleAlert, UploadCloud } from "lucide-react";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { StoreSettings } from "@/types/store";
import useLiff from "@/hooks/useLiff";
import { buildIssueReportFlexMessage, buildSlipResultFlexMessage } from "@/lib/line/flex";
import { ProductBundleItem, SelectedProductAddOn } from "@/types/product";
import { formatOrderId } from "@/lib/orderId";

interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    status?: OrderItemStatus;
    imageUrl?: string;
    variantInfo?: string;
    addOns?: SelectedProductAddOn[];
    bundleItems?: ProductBundleItem[];
    finalPrice?: number;
    pickupOptionId?: string | null;
    pickupLabel?: string | null;
    pickupDetail?: string | null;
    issueReason?: string;
    issueReportedAt?: string;
    issueReportedByCustomer?: boolean;
    issueAdminReply?: string;
    issueAdminRepliedAt?: string;
    discountAmount?: number;
    appliedPromo?: {
        name: string;
        discountType: string;
        discountValue: number;
    };
}

type OrderItemStatus = 'processing' | 'ready' | 'received' | 'shipped' | 'completed' | 'cancelled' | 'returned';

type BundleExpandState = Record<string, boolean>;

interface Order {
    id: string;
    orderNo?: string;
    status: 'pending' | 'paid' | 'processing' | 'shipped' | 'completed' | 'cancelled' | 'returned';
    totalAmount: number;
    items: OrderItem[];
    createdAt: Date;
    paymentMethod: string;
    trackingNumber?: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    lineDisplayName?: string;
    linePictureUrl?: string;
    totalDiscount?: number;
    subTotal?: number;
    deliveryFee?: number;
    userId?: string;
    cancelReason?: string | null;
    refundChannel?: string | null;
    paymentStatus?: string | null;
}

export default function OrderDetailPage() {
    const params = useParams();
    const orderId = params.id as string;
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [copiedPayment, setCopiedPayment] = useState(false);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
    const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [refundChannel, setRefundChannel] = useState("");
    const [cancelError, setCancelError] = useState("");
    const [issueItemIndex, setIssueItemIndex] = useState<number | null>(null);
    const [issueStatus, setIssueStatus] = useState<Extract<OrderItemStatus, 'cancelled' | 'returned'>>('returned');
    const [issueReason, setIssueReason] = useState("");
    const [issueError, setIssueError] = useState("");
    const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
    const [expandedBundles, setExpandedBundles] = useState<BundleExpandState>({});

    // Slip State
    const [slipDocId, setSlipDocId] = useState<string | null>(null);
    const [slipFile, setSlipFile] = useState<File | null>(null);
    const [slipPreview, setSlipPreview] = useState<string | null>(null);
    const [slipUploading, setSlipUploading] = useState(false);
    const [slipError, setSlipError] = useState("");
    const [slipStatus, setSlipStatus] = useState<{ status: string, message: string }>({ status: '', message: '' });
    const [isSlipModalOpen, setIsSlipModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    const { liff } = useLiff(liffId);

    useEffect(() => {
        const fetchOrder = async () => {
            try {
                const docRef = doc(db, "orders", orderId);
                const settingsRef = doc(db, "settings", "store");
                const slipQuery = query(
                    collection(db, "payment_slips"),
                    where("orderId", "==", orderId)
                );
                const [docSnap, settingsSnap, slipSnap] = await Promise.all([
                    getDoc(docRef),
                    getDoc(settingsRef),
                    getDocs(slipQuery)
                ]);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setOrder({
                        id: docSnap.id,
                        ...data,
                        createdAt: data.createdAt?.toDate() || new Date()
                    } as Order);
                }
                const settingsData = settingsSnap.exists() ? (settingsSnap.data() as StoreSettings) : null;
                if (settingsData) {
                    setStoreSettings(settingsData);
                }
                if (!slipSnap.empty) {
                    const slipDoc = slipSnap.docs[0];
                    const slipData = slipDoc.data();
                    setSlipDocId(slipDoc.id);
                    if (slipData.base64) {
                        setSlipPreview(slipData.base64);
                    }
                    const manualMessage = "รอการตรวจสอบโดยเจ้าหน้าที่";
                    const enableVerify = settingsData?.enableSlipVerify === true;
                    setSlipStatus({
                        status: slipData.verifyStatus || 'pending',
                        message: enableVerify
                            ? (slipData.verifyMessage || 'รอตรวจสอบ')
                            : (slipData.verifyStatus === 'verified' || slipData.verifyStatus === 'rejected'
                                ? (slipData.verifyMessage || 'รอตรวจสอบ')
                                : manualMessage)
                    });
                }
            } catch (error) {
                console.error("Error fetching order:", error);
            } finally {
                setLoading(false);
            }
        };

        if (orderId) {
            fetchOrder();
        }
    }, [orderId]);

    useEffect(() => {
        if (!orderId) return;

        const unsubscribe = onSnapshot(
            doc(db, "orders", orderId),
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setOrder({
                        id: docSnap.id,
                        ...data,
                        createdAt: data.createdAt?.toDate() || new Date()
                    } as Order);
                } else {
                    setOrder(null);
                }
                setLoading(false);
            },
            (error) => {
                console.error("Error listening to order:", error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [orderId]);

    useEffect(() => {
        if (!orderId) return;

        const slipQuery = query(
            collection(db, "payment_slips"),
            where("orderId", "==", orderId)
        );

        const unsubscribe = onSnapshot(
            slipQuery,
            (slipSnap) => {
                if (slipSnap.empty) {
                    setSlipDocId(null);
                    setSlipStatus({ status: '', message: '' });
                    return;
                }

                const slipDoc = slipSnap.docs[0];
                const slipData = slipDoc.data();
                setSlipDocId(slipDoc.id);
                if (slipData.base64) {
                    setSlipPreview(slipData.base64);
                }

                const enableVerify = storeSettings?.enableSlipVerify === true;
                setSlipStatus({
                    status: slipData.verifyStatus || 'pending',
                    message: enableVerify
                        ? (slipData.verifyMessage || 'รอตรวจสอบ')
                        : (slipData.verifyStatus === 'verified' || slipData.verifyStatus === 'rejected'
                            ? (slipData.verifyMessage || 'รอตรวจสอบ')
                            : 'รอการตรวจสอบโดยเจ้าหน้าที่')
                });
            },
            (error) => {
                console.error("Error listening to payment slip:", error);
            }
        );

        return () => unsubscribe();
    }, [orderId, storeSettings?.enableSlipVerify]);

    const getStatusInfo = (status: Order['status']) => {
        const styles = {
            pending: { label: 'รอยืนยัน', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: <Clock className="w-4 h-4" /> },
            paid: { label: 'ชำระแล้ว', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: <CreditCard className="w-4 h-4" /> },
            processing: { label: 'กำลังเตรียม', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: <Package className="w-4 h-4" /> },
            shipped: { label: 'จัดส่งแล้ว', color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200', icon: <Truck className="w-4 h-4" /> },
            completed: { label: 'สำเร็จ', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <CheckCircle className="w-4 h-4" /> },
            cancelled: { label: 'ยกเลิก', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: <XCircle className="w-4 h-4" /> },
            returned: { label: 'คืนสินค้า', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: <Package className="w-4 h-4" /> },
        };
        return styles[status] || { label: status, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200', icon: <Package className="w-4 h-4" /> };
    };

    const getItemStatusInfo = (status?: OrderItemStatus) => {
        if (!status) return null;

        const styles: Record<OrderItemStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
            processing: { label: 'ดำเนินการ', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: <Clock className="w-3 h-3" /> },
            ready: { label: 'พร้อมรับ', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: <Package className="w-3 h-3" /> },
            received: { label: 'รับแล้ว', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: <CheckCircle className="w-3 h-3" /> },
            shipped: { label: 'จัดส่ง', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: <Truck className="w-3 h-3" /> },
            completed: { label: 'สำเร็จ', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: <CheckCircle className="w-3 h-3" /> },
            cancelled: { label: 'ยกเลิก', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: <XCircle className="w-3 h-3" /> },
            returned: { label: 'คืนสินค้า', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', icon: <RotateCcw className="w-3 h-3" /> },
        };

        return styles[status];
    };

    const copyToClipboard = (text: string, setCopiedFn: (val: boolean) => void) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedFn(true);
        setTimeout(() => setCopiedFn(false), 2000);
    };

    const getBundleKey = (orderId: string, itemIndex: number) => `${orderId}-${itemIndex}`;

    const toggleBundleExpanded = (key: string) => {
        setExpandedBundles(prev => ({
            ...prev,
            [key]: !(prev[key] ?? true)
        }));
    };

    const openIssueModal = (index: number) => {
        const item = order?.items[index];
        if (!item || order?.status === 'cancelled') return;

        setIssueItemIndex(index);
        setIssueStatus(item.status === 'cancelled' || item.status === 'returned' ? item.status : 'returned');
        setIssueReason(item.issueReason || "");
        setIssueError("");
    };

    const closeIssueModal = () => {
        if (isSubmittingIssue) return;
        setIssueItemIndex(null);
        setIssueStatus('returned');
        setIssueReason("");
        setIssueError("");
    };

    const handleSubmitItemIssue = async () => {
        if (!order || issueItemIndex === null) return;
        const reason = issueReason.trim();
        const issueItem = order.items[issueItemIndex];

        if (!issueItem) {
            setIssueError("ไม่พบรายการสินค้าที่ต้องการแจ้งปัญหา");
            return;
        }

        if (reason.length < 3) {
            setIssueError("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
            return;
        }

        const nextItems = order.items.map((item, index) => (
            index === issueItemIndex
                ? {
                    ...item,
                    status: issueStatus,
                    issueReason: reason,
                    issueReportedAt: new Date().toISOString(),
                    issueReportedByCustomer: true
                }
                : item
        ));

        try {
            setIsSubmittingIssue(true);
            await updateDoc(doc(db, "orders", order.id), {
                items: nextItems,
                updatedAt: serverTimestamp()
            });
            setOrder(prev => prev ? { ...prev, items: nextItems } : prev);
            await Promise.allSettled([
                fetch("/api/orders/notify-issue", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        orderId: order.id,
                        itemIndex: issueItemIndex,
                        issueStatus,
                        issueReason: reason
                    })
                }),
                handleSendIssueReport({
                    itemName: issueItem.productName,
                    issueStatus,
                    issueReason: reason
                })
            ]);
            setIssueItemIndex(null);
            setIssueStatus('returned');
            setIssueReason("");
            setIssueError("");
        } catch (error) {
            console.error("Error submitting item issue:", error);
            setIssueError("แจ้งปัญหาไม่สำเร็จ กรุณาลองใหม่");
        } finally {
            setIsSubmittingIssue(false);
        }
    };

    const handleSendIssueReport = async (params: {
        itemName?: string;
        issueStatus: Extract<OrderItemStatus, 'cancelled' | 'returned'>;
        issueReason: string;
    }) => {
        if (!order || !liff || !liff.isInClient()) return;
        try {
            await liff.sendMessages([
                buildIssueReportFlexMessage({
                    orderId: order.id,
                    liffId: liffId || "",
                    issueStatus: params.issueStatus,
                    issueReason: params.issueReason,
                    itemName: params.itemName,
                    customerName: order.customerName
                })
            ]);
        } catch (err) {
            console.error("Error sending issue report message:", err);
        }
    };

    const fileToBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
            reader.readAsDataURL(file);
        });

    const handleSendSlipResult = async (verifyResult: Record<string, unknown>, orderContext: Order) => {
        if (!liff || !liff.isInClient()) return;
        try {
            await liff.sendMessages([
                buildSlipResultFlexMessage({
                    orderId: orderId || "",
                    liffId: liffId || "",
                    verifyResult,
                    orderContext
                })
            ]);
        } catch (err) {
            console.error("Error sending slip verification message:", err);
        }
    };

    const requestSlipVerify = async (id: string) => {
        try {
            setSlipStatus({ status: 'checking', message: 'กำลังตรวจสอบสลิปอัตโนมัติ...' });
            setSlipError("");
            const res = await fetch("/api/slipok/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slipId: id })
            });

            let newStatus = 'pending';
            let newMessage = 'รอตรวจสอบ';

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                newStatus = 'error';
                newMessage = data?.error || "ตรวจสอบไม่สำเร็จ";
                setSlipError(newMessage);
            } else {
                const data = await res.json();
                const serverStatus = data?.verifyStatus ?? data?.status;
                const serverMessage = data?.verifyMessage ?? data?.message;
                const isVerified = serverStatus === 'verified' || data?.success === true || data?.data?.valid === true;
                const isManual = serverStatus === 'pending' || data?.isManualCheck === true;

                if (isVerified) {
                    newStatus = serverStatus || 'verified';
                    newMessage = 'ชำระเงินสำเร็จ ตรวจสอบสลิปผ่านแล้ว';
                } else if (isManual) {
                    newStatus = serverStatus || 'pending';
                    newMessage = serverMessage || 'รอตรวจสอบโดยเจ้าหน้าที่';
                } else {
                    newStatus = serverStatus || 'rejected';
                    newMessage = serverMessage || 'สลิปไม่ถูกต้อง';
                    setSlipError(newMessage);
                }
            }

            setSlipStatus({ status: newStatus, message: newMessage });
            if (newStatus === 'verified') {
                setOrder(prev => prev ? {
                    ...prev,
                    status: 'paid',
                    paymentStatus: 'verified'
                } : prev);
            }

            // Persist to Firestore
            if (newStatus !== 'error') {
                const slipRef = doc(db, "payment_slips", id);
                await updateDoc(slipRef, {
                    verifyStatus: newStatus,
                    verifyMessage: newMessage,
                    lastCheckedAt: serverTimestamp()
                });
            }

        } catch (err) {
            console.error("Verification error:", err);
            setSlipError("ตรวจสอบไม่สำเร็จ");
            setSlipStatus({ status: 'error', message: "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
        }
    };

    const handlePaymentChange = async (nextMethod: string) => {
        if (!order || order.paymentMethod === nextMethod) return;
        if (order.status !== "pending") return;
        setIsUpdatingPayment(true);
        try {
            const orderRef = doc(db, "orders", order.id);
            await updateDoc(orderRef, {
                paymentMethod: nextMethod,
                updatedAt: serverTimestamp()
            });
            setOrder(prev => prev ? { ...prev, paymentMethod: nextMethod } : prev);
        } catch (error) {
            console.error("Error updating payment method:", error);
        } finally {
            setIsUpdatingPayment(false);
        }
    };

    const handleSlipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!order || ["cancelled", "completed", "returned"].includes(order.status)) return;
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

        if (storeSettings?.enableSlipVerify) {
            await handleSlipUpload(file);
        }
    };

    const handleSlipUpload = async (fileOverride?: File) => {
        const fileToUpload = fileOverride || slipFile;
        if (!orderId || !order || !fileToUpload || slipUploading) return;
        if (["cancelled", "completed", "returned"].includes(order.status)) return;
        setSlipUploading(true);
        setSlipError("");
        try {
            const base64 = await fileToBase64(fileToUpload);
            setSlipPreview(base64); // Update preview immediately

            const slipData = {
                base64,
                mimeType: fileToUpload.type,
                size: fileToUpload.size,
                paymentMethod: order.paymentMethod || null,
                amount: order.totalAmount || 0,
                needsVerify: false,
                verifyStatus: "pending",
                verifyMessage: "รอตรวจสอบ",
                updatedAt: serverTimestamp()
            };

            setSlipStatus({ status: 'pending', message: 'กำลังตรวจสอบ...' });

            setSlipStatus({
                status: storeSettings?.enableSlipVerify ? 'checking' : 'pending',
                message: storeSettings?.enableSlipVerify ? 'กำลังตรวจสอบสลิปอัตโนมัติ...' : 'รอการตรวจสอบโดยเจ้าหน้าที่'
            });

            if (slipDocId) {
                await updateDoc(doc(db, "payment_slips", slipDocId), slipData);
                await handleSendSlipResult({ isManualCheck: true }, order);
                if (storeSettings?.enableSlipVerify) {
                    await requestSlipVerify(slipDocId);
                } else {
                    setSlipStatus({ status: 'pending', message: 'รอการตรวจสอบโดยเจ้าหน้าที่' });
                }
            } else {
                const newDoc = await addDoc(collection(db, "payment_slips"), {
                    ...slipData,
                    orderId: orderId,
                    userId: order.userId || null,
                    createdAt: serverTimestamp()
                });
                setSlipDocId(newDoc.id);
                await handleSendSlipResult({ isManualCheck: true }, order);
                if (storeSettings?.enableSlipVerify) {
                    await requestSlipVerify(newDoc.id);
                } else {
                    setSlipStatus({ status: 'pending', message: 'รอการตรวจสอบโดยเจ้าหน้าที่' });
                }
            }
            setSlipFile(null); // Clear file to allow re-selection state

        } catch (error) {
            console.error("Error uploading slip:", error);
            setSlipError("อัปโหลดสลิปไม่สำเร็จ");
        } finally {
            setSlipUploading(false);
        }
    };

    const handleCancelOrder = async () => {
        if (!order || canceling) return;
        if (order.status === "cancelled" || order.status === "completed" || order.status === "shipped" || order.status === "returned") return;
        const needsRefundChannel = order.status === "paid" || order.paymentStatus === "paid" || order.paymentStatus === "verified";
        if (needsRefundChannel && refundChannel.trim().length < 3) {
            setCancelError("กรุณาระบุช่องทางการคืนเงิน");
            return;
        }
        try {
            setCanceling(true);
            const res = await fetch("/api/orders/update-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    orderId: order.id,
                    status: "cancelled",
                    cancelReason: cancelReason || null,
                    refundChannel: needsRefundChannel ? refundChannel.trim() : null
                })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Update failed");
            }
            setOrder(prev => prev ? {
                ...prev,
                status: "cancelled",
                cancelReason: cancelReason || null,
                refundChannel: needsRefundChannel ? refundChannel.trim() : prev.refundChannel
            } : prev);
            setIsSlipModalOpen(false);
            setSlipFile(null);
            setIsCancelModalOpen(false);
            setCancelReason("");
            setRefundChannel("");
            setCancelError("");
        } catch (error) {
            console.error("Error cancelling order:", error);
            setCancelError("ยกเลิกออเดอร์ไม่สำเร็จ");
        } finally {
            setCanceling(false);
        }
    };

    // Derived state
    const subtotal = order?.subTotal || order?.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
    const deliveryFee = order?.deliveryFee ?? (order ? order.totalAmount - (subtotal - (order.totalDiscount || 0)) : 0);
    const totalDiscount = order?.totalDiscount || 0;
    const isCancelledOrder = order?.status === 'cancelled';
    const canUsePayment = order ? !["cancelled", "completed", "returned"].includes(order.status) : false;
    const canChangePayment = order?.status === 'pending' && canUsePayment;
    const selectedPaymentMethod = order?.paymentMethod === 'pay_later' ? "" : (order?.paymentMethod || "");
    const isSlipPayment = selectedPaymentMethod === 'bank_transfer' || selectedPaymentMethod === 'promptpay';
    const canManageSlipPayment = isSlipPayment && canUsePayment;
    const paymentMethodLabel =
        selectedPaymentMethod === 'bank_transfer' ? 'โอนเงินเข้าบัญชี' :
            selectedPaymentMethod === 'promptpay' ? 'พร้อมเพย์ QR' :
                selectedPaymentMethod === 'cod' ? 'เก็บเงินปลายทาง' :
                    ['stripe', 'omise'].includes(selectedPaymentMethod) ? 'บัตรเครดิต/เดบิต' :
                        'ยังไม่ได้เลือก';
    const statusInfo = order ? getStatusInfo(order.status) : null;
    const canCancelOrder = order ? !["cancelled", "completed", "shipped", "returned"].includes(order.status) : false;
    const needsRefundChannel = order?.status === "paid" || order?.paymentStatus === "paid" || order?.paymentStatus === "verified";

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-100"><Loader2 className="animate-spin text-slate-400" /></div>;
    if (!order) return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-400">ไม่พบคำสั่งซื้อ</div>;

    const issueItem = issueItemIndex !== null ? order.items[issueItemIndex] : null;

    return (
        <div className="min-h-screen bg-slate-100 text-slate-900 font-sans pb-20">
            <main className="max-w-3xl mx-auto p-4 space-y-4">
                {/* Status Card */}
                <div className="bg-white rounded-2xl border border-slate-200  p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className={`p-2 rounded-full ${statusInfo?.bg || 'bg-slate-100'} ${statusInfo?.color}`}>
                                {statusInfo?.icon}
                            </div>
                            <div className="min-w-0">
                                <h2 className="font-semibold text-base text-slate-900">รายละเอียดคำสั่งซื้อ</h2>
                                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{formatOrderId(order, 12)}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">{format(order.createdAt, 'd MMM yyyy, HH:mm', { locale: th })}</p>
                            </div>
                        </div>
                        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                            <span className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusInfo?.border || "border-slate-200"} ${statusInfo?.bg || "bg-slate-50"} ${statusInfo?.color || "text-slate-700"}`}>
                                {statusInfo?.icon}
                                {statusInfo?.label}
                            </span>
                            {canCancelOrder && (
                                <button
                                    onClick={() => setIsCancelModalOpen(true)}
                                    disabled={canceling}
                                    className="inline-flex min-h-8 items-center justify-center rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                    {canceling ? "กำลังยกเลิก..." : "ยกเลิกออเดอร์"}
                                </button>
                            )}
                        </div>
                    </div>
                    {order.trackingNumber && (
                        <div className="mt-3 w-full pt-3 border-t border-slate-200 flex items-center justify-between bg-slate-50 rounded-md px-3 py-1.5">
                            <span className="text-[11px] text-slate-500 font-medium">เลขพัสดุ</span>
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-[13px] font-semibold text-slate-900">{order.trackingNumber}</span>
                                <button onClick={() => copyToClipboard(order.trackingNumber!, setCopied)} className="text-slate-400 hover:text-slate-900 transition-colors">
                                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer Info */}
                    <div className="bg-white rounded-2xl border border-slate-200  p-4 space-y-3">
                        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                            <MapPin size={16} className="text-slate-400" />
                            <h3 className="text-sm font-semibold text-slate-900">ที่อยู่จัดส่ง</h3>
                        </div>
                        <div className="text-sm text-slate-600 space-y-1 pl-6">
                            <p className="font-medium text-slate-900">{order.customerName}</p>
                            <p className="font-mono text-xs text-slate-500">{order.customerPhone}</p>
                            <p className="leading-relaxed text-slate-500 text-xs mt-1">{order.shippingAddress}</p>
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="bg-white rounded-2xl border border-slate-200  p-4 space-y-3">
                        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                            <CreditCard size={16} className="text-slate-400" />
                            <h3 className="text-sm font-semibold text-slate-900">สรุปยอดชำระ</h3>
                        </div>
                        <div className="space-y-2 text-sm pl-6">
                            <div className="flex justify-between text-slate-500 text-xs">
                                <span>รวมสินค้า ({order.items.length})</span>
                                <span>฿{subtotal.toLocaleString()}</span>
                            </div>
                            {totalDiscount > 0 && (
                                <div className="flex justify-between text-red-600 text-xs">
                                    <span>ส่วนลด</span>
                                    <span>-฿{totalDiscount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-slate-500 text-xs">
                                <span>ค่าจัดส่ง</span>
                                <span>฿{deliveryFee.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200 text-sm">
                                <span>ยอดสุทธิ</span>
                                <span>฿{order.totalAmount.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items List */}
                <div className="bg-white rounded-2xl border border-slate-200  overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                        <Package size={16} className="text-slate-400" />
                        <h3 className="text-sm font-semibold text-slate-900">รายการสินค้า</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {order.items.map((item, idx) => {
                            const fallbackItemStatus =
                                order.status === "processing" ? "processing" :
                                    order.status === "shipped" ? "shipped" :
                                        order.status === "completed" ? "completed" :
                                            order.status === "cancelled" ? "cancelled" :
                                                order.status === "returned" ? "returned" :
                                                    undefined;
                            const itemStatus = getItemStatusInfo(item.status || fallbackItemStatus);

                            return (
                                <div
                                    key={idx}
                                    className="w-full p-3 flex gap-3 text-left hover:bg-slate-50 transition-colors"
                                >
                                    <div className="w-12 h-12 bg-white rounded border border-slate-200 overflow-hidden flex-shrink-0 p-1">
                                        {item.imageUrl ? (
                                            <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300"><Package size={16} /></div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex justify-between items-start gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <p className="font-medium text-sm text-slate-900 line-clamp-1">{item.productName}</p>
                                                {itemStatus && (
                                                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${itemStatus.bg} ${itemStatus.color} ${itemStatus.border}`}>
                                                        {itemStatus.icon}
                                                        {itemStatus.label}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => openIssueModal(idx)}
                                                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${item.issueReason
                                                        ? 'border-orange-200 bg-orange-50 text-orange-600'
                                                        : 'border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600'
                                                        }`}
                                                    aria-label={`แจ้งปัญหา ${item.productName}`}
                                                    title="แจ้งปัญหา"
                                                >
                                                    <CircleAlert size={14} />
                                                </button>
                                            </div>
                                            <p className="text-xs text-slate-500">x{item.quantity} {item.variantInfo && `· ${item.variantInfo}`}</p>
                                            {itemStatus && (item.status || fallbackItemStatus) === "ready" && item.pickupLabel && (
                                                <PickupInfo label={item.pickupLabel} detail={item.pickupDetail || ""} />
                                            )}
                                            {item.bundleItems && item.bundleItems.length > 0 && (() => {
                                                const bundleKey = getBundleKey(order.id, idx);
                                                const isExpanded = expandedBundles[bundleKey] ?? false;
                                                const statusCount = item.bundleItems.filter(bundleItem => bundleItem.status || item.status || fallbackItemStatus).length;

                                                return (
                                                <div className={`mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 transition-all ${isExpanded ? "sm:w-[calc(100%+6rem)]" : "w-full"}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleBundleExpanded(bundleKey)}
                                                        className="flex w-full items-center justify-between gap-2 border-b border-slate-200 bg-white/80 px-2.5 py-2 text-left"
                                                        aria-expanded={isExpanded}
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-[11px] font-semibold text-slate-700">สินค้าในเซต</p>
                                                            <p className="text-[10px] text-slate-400">
                                                                {item.bundleItems.length} รายการ · มีสถานะ {statusCount} รายการ
                                                            </p>
                                                        </div>
                                                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                                            {isExpanded ? "ย่อ" : "ขยาย"}
                                                        </span>
                                                    </button>
                                                    {isExpanded && (
                                                    <div className="space-y-1 px-2 py-2">
                                                    {item.bundleItems.map((bundleItem) => {
                                                        const bundleStatus = getItemStatusInfo(bundleItem.status || item.status || fallbackItemStatus);

                                                        return (
                                                        <div key={bundleItem.id} className="rounded-lg bg-white px-2 py-1.5 text-[10px] text-slate-500 shadow-sm ring-1 ring-slate-100">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <p className="min-w-0 flex-1 leading-4 text-slate-600">
                                                                    {bundleItem.productName}{bundleItem.variantName ? ` (${bundleItem.variantName})` : ""} x{bundleItem.quantity}
                                                                </p>
                                                                {bundleStatus && (
                                                                    <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${bundleStatus.bg} ${bundleStatus.color} ${bundleStatus.border}`}>
                                                                        {bundleStatus.label}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {bundleItem.selectedAddOns && bundleItem.selectedAddOns.length > 0 && (
                                                                <div className="ml-2 space-y-0.5">
                                                                    {bundleItem.selectedAddOns.map((addOn) => (
                                                                        <p key={addOn.id}>
                                                                            {addOn.name}{addOn.value ? `: ${addOn.value}` : ""}{addOn.price > 0 ? ` +฿${addOn.price.toLocaleString()}` : ""}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {bundleStatus && (bundleItem.status || item.status || fallbackItemStatus) === "ready" && bundleItem.pickupLabel && (
                                                                <PickupInfo label={bundleItem.pickupLabel} detail={bundleItem.pickupDetail || ""} compact />
                                                            )}
                                                        </div>
                                                    )})}
                                                    </div>
                                                    )}
                                                </div>
                                            )})()}
                                            {item.addOns && item.addOns.length > 0 && (
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {item.addOns.map((addOn) => (
                                                        <span key={addOn.id} className="max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                                            {addOn.name}{addOn.value ? `: ${addOn.value}` : ""}{addOn.price > 0 ? ` +฿${addOn.price.toLocaleString()}` : ""}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {item.appliedPromo && <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded ml-[-2px] mt-1 inline-block">{item.appliedPromo.name}</span>}
                                            {(item.issueReason || item.issueAdminReply) && (
                                                <div className="mt-2 rounded-lg border border-orange-100 bg-orange-50 px-2 py-1.5 text-[11px] text-orange-700">
                                                    {item.issueReason && (
                                                        <span className="block">
                                                            <span className="font-semibold">แจ้งปัญหา:</span> {item.issueReason}
                                                        </span>
                                                    )}
                                                    {item.issueAdminReply && (
                                                        <span className="mt-1 block border-t border-orange-100 pt-1 text-orange-800">
                                                            <span className="font-semibold">แอดมินตอบกลับ:</span> {item.issueAdminReply}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-medium text-slate-900">
                                                ฿{((item.finalPrice ?? item.price) * item.quantity).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Payment Module */}
                <div className="bg-white rounded-2xl border border-slate-200  overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/60">
                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            การชำระเงิน
                        </h3>
                        {canChangePayment && storeSettings && (
                            <div className="relative">
                                <select
                                    className="appearance-none bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer text-right"
                                    value={selectedPaymentMethod}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handlePaymentChange(e.target.value);
                                        }
                                    }}
                                    disabled={isUpdatingPayment}
                                >
                                    <option value="">เลือกวิธีชำระเงิน</option>
                                    {storeSettings.enablePromptPay && <option value="promptpay">เปลี่ยนเป็น PromptPay</option>}
                                    {storeSettings.enableBankTransfer && <option value="bank_transfer">เปลี่ยนเป็น โอนเงิน</option>}
                                    {storeSettings.enableCOD && <option value="cod">เปลี่ยนเป็น เก็บเงินปลายทาง</option>}
                                </select>
                            </div>
                        )}
                    </div>

                    <div className={selectedPaymentMethod ? "p-5" : "hidden"}>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm text-slate-600">วิธีชำระเงิน</span>
                            <span className="text-sm font-medium text-slate-900 bg-slate-100 px-2 py-1 rounded">
                                {!selectedPaymentMethod && paymentMethodLabel}
                                {order.paymentMethod === 'bank_transfer' && 'โอนเงินเข้าบัญชี'}
                                {order.paymentMethod === 'promptpay' && 'พร้อมเพย์ QR'}
                                {order.paymentMethod === 'cod' && 'เก็บเงินปลายทาง'}
                                {!order.paymentMethod && 'ยังไม่ได้เลือก'}
                                {['stripe', 'omise'].includes(order.paymentMethod || "") && 'บัตรเครดิต/เดบิต'}
                            </span>
                        </div>

                        {/* Payment Actions / Helpers */}
                        {canManageSlipPayment && (
                            <div className="mt-4 pt-4 border-t border-slate-200">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex flex-col">
                                        <p className="text-sm font-medium text-slate-900">หลักฐานการโอนเงิน</p>
                                        <p className={`text-xs mt-0.5 font-medium ${slipStatus.status === 'verified' ? 'text-green-600' :
                                            slipStatus.status === 'rejected' ? 'text-red-600' :
                                                slipDocId ? 'text-amber-600' : 'text-slate-400'
                                            }`}>
                                            {slipStatus.status === 'verified' ? 'ตรวจสอบแล้ว' :
                                                slipStatus.status === 'rejected' ? 'สลิปไม่ถูกต้อง' :
                                                    slipDocId ? 'รอการตรวจสอบ' : 'ยังไม่ได้แนบสลิป'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setIsSlipModalOpen(true)}
                                        className={`px-4 py-2 rounded-md text-xs font-medium transition-colors border ${slipDocId
                                            ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                            : 'bg-[var(--shop-accent)] border-transparent text-white shadow-sm hover:brightness-95'
                                            }`}
                                    >
                                        {slipDocId ? 'ดู/แก้ไขสลิป' : 'แจ้งชำระเงิน'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {isCancelledOrder && (
                            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-center text-xs font-medium text-red-700">
                                คำสั่งซื้อนี้ถูกยกเลิกแล้ว ระบบปิดการชำระเงินสำหรับออเดอร์นี้
                            </div>
                        )}

                        {/* Info for offline payments */}
                        {order.paymentMethod === 'cod' && canUsePayment && (
                            <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded-xl text-center border border-amber-200">
                                กรุณาเตรียมเงินสดสำหรับชำระกับพนักงานจัดส่ง
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Slip Upload Modal */}
            {isSlipModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-all">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden border border-slate-200 shadow-2xl animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
                            <h3 className="font-semibold text-slate-900 text-sm">แจ้งชำระเงิน / อัปโหลดสลิป</h3>
                            <button onClick={() => setIsSlipModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <XCircle size={20} />
                            </button>
                        </div>

                        <div className="max-h-[78vh] overflow-y-auto bg-slate-100 p-3">
                            {storeSettings && (
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                                        <div>
                                            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">ยอดชำระ</p>
                                            <p className="text-xl font-bold text-slate-900">฿{order.totalAmount.toLocaleString()}</p>
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                                            {formatOrderId(order, 8)}
                                        </span>
                                    </div>

                                    {order.paymentMethod === 'promptpay' && storeSettings.enablePromptPay && (
                                        <div className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3 max-[360px]:grid-cols-1">
                                            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-blue-100 bg-white p-2 shadow-sm max-[360px]:mx-auto">
                                                {storeSettings.promptPayQrUrl ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewImage({ src: storeSettings.promptPayQrUrl!, alt: "PromptPay QR" })}
                                                        className="group relative h-full w-full"
                                                        aria-label="ขยายรูป QR"
                                                    >
                                                        <img src={storeSettings.promptPayQrUrl} alt="PromptPay QR" className="h-full w-full object-contain" />
                                                        <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-blue-950/80 py-1 text-[10px] font-bold text-white">
                                                            กดเพื่อขยาย
                                                        </span>
                                                    </button>
                                                ) : storeSettings.promptPayId ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewImage({ src: `https://promptpay.io/${storeSettings.promptPayId}/${order.totalAmount}`, alt: "PromptPay QR" })}
                                                        className="group relative h-full w-full"
                                                        aria-label="ขยายรูป QR"
                                                    >
                                                        <img
                                                            src={`https://promptpay.io/${storeSettings.promptPayId}/${order.totalAmount}`}
                                                            alt="PromptPay QR"
                                                            className="h-full w-full object-contain"
                                                        />
                                                        <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-blue-950/80 py-1 text-[10px] font-bold text-white">
                                                            กดเพื่อขยาย
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <div className="flex h-full items-center justify-center px-3 text-center text-[10px] text-slate-400">ไม่พบ QR</div>
                                                )}
                                            </div>
                                            <div className="min-w-0 rounded-xl bg-blue-50/70 p-2.5">
                                                <p className="text-sm font-extrabold text-blue-950">PromptPay QR</p>
                                                {storeSettings.promptPayAccountName && (
                                                    <p className="mt-1 text-[11px] font-semibold text-slate-700">
                                                        ผู้รับโอน: {storeSettings.promptPayAccountName}
                                                    </p>
                                                )}
                                                <p className="mt-0.5 text-[10px] text-slate-500">สแกนจ่ายแล้วแนบสลิปด้านล่าง</p>
                                                {storeSettings.promptPayId && (
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(storeSettings.promptPayId!, setCopiedPayment)}
                                                        className="mt-2 inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700"
                                                    >
                                                        <span className="truncate font-mono">{storeSettings.promptPayId}</span>
                                                        {copiedPayment ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {order.paymentMethod === 'bank_transfer' && storeSettings.enableBankTransfer && (
                                        <div className="mt-3 space-y-2 text-xs">
                                            <div className="flex justify-between gap-3">
                                                <span className="text-slate-500">ธนาคาร</span>
                                                <span className="text-right font-semibold text-slate-900">{storeSettings.bankName}</span>
                                            </div>
                                            <div className="flex justify-between gap-3">
                                                <span className="text-slate-500">ชื่อบัญชี</span>
                                                <span className="text-right font-semibold text-slate-900">{storeSettings.bankAccountName}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] uppercase tracking-wider text-slate-500">เลขที่บัญชี</p>
                                                    <p className="font-mono text-sm font-bold text-slate-900">{storeSettings.bankAccountNumber}</p>
                                                </div>
                                                <button onClick={() => copyToClipboard(storeSettings.bankAccountNumber!, setCopiedPayment)} className="rounded-md border border-slate-200 bg-white p-2">
                                                    {copiedPayment ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-500" />}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
                                {/* Always render hidden input */}
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleSlipChange}
                                    id="slip-upload-input"
                                />

                                {slipPreview ? (
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setPreviewImage({ src: slipPreview, alt: "สลิปการชำระเงิน" })}
                                            className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                                            aria-label="ขยายรูปสลิป"
                                        >
                                            <img src={slipPreview} alt="สลิปการชำระเงิน" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                            <span className="absolute inset-x-0 bottom-0 bg-slate-950/70 py-0.5 text-[9px] font-medium text-white">
                                                ดูรูป
                                            </span>
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-semibold text-slate-900">{slipFile?.name || "สลิปการชำระเงิน"}</p>
                                            <p className="text-[10px] text-slate-400">{slipDocId ? "มีสลิปในระบบแล้ว" : "พร้อมอัปโหลด"} · กดรูปเพื่อขยาย</p>
                                        </div>
                                        {(!slipDocId || slipStatus.status !== 'verified') && (
                                            <button
                                                type="button"
                                                onClick={() => document.getElementById('slip-upload-input')?.click()}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--shop-primary)] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:brightness-95"
                                            >
                                                <UploadCloud size={13} />
                                                เปลี่ยน
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <label htmlFor="slip-upload-input" className="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg bg-[var(--shop-primary)] px-3 py-2 text-center text-xs font-extrabold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99]">
                                        <span className="inline-flex items-center gap-1.5">
                                            <UploadCloud size={15} />
                                            แนบสลิป
                                        </span>
                                        <span className="mt-0.5 block text-[10px] font-medium text-white/80">รูปภาพไม่เกิน 700KB</span>
                                        <span className="block text-[10px] font-medium text-white/80">
                                            {storeSettings?.enableSlipVerify ? "ตรวจสอบอัตโนมัติหลังเลือกไฟล์" : "รูปภาพไม่เกิน 700KB"}
                                        </span>
                                    </label>
                                )}

                                <div className={`mt-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${slipStatus.status === 'verified' ? 'border-green-200 bg-green-50 text-green-700' :
                                    slipStatus.status === 'checking' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                    (slipStatus.status === 'rejected' || slipStatus.status === 'failed' || slipStatus.status === 'error') ? 'border-red-200 bg-red-50 text-red-700' :
                                        slipPreview || slipDocId ? 'border-amber-200 bg-amber-50 text-amber-700' :
                                            'border-slate-200 bg-slate-50 text-slate-500'
                                    }`}>
                                    {slipStatus.message || (slipPreview ? 'พร้อมอัปโหลดสลิป' : 'ยังไม่ได้เลือกสลิป')}
                                </div>
                                {slipError && <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-600">
                                    <XCircle size={14} /> {slipError}
                                </div>}
                            </div>
                        </div>
                        <div className="border-t border-slate-200 bg-white p-3 flex gap-2 pb-safe">
                            <button
                                onClick={() => setIsSlipModalOpen(false)}
                                className="flex-1 px-4 py-2.5 bg-white text-slate-700 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                ปิด
                            </button>
                            {(!slipDocId || (slipStatus.status !== 'verified')) && (
                                <button
                                    onClick={() => {
                                        if (slipDocId && !slipFile) {
                                            document.getElementById('slip-upload-input')?.click();
                                        } else {
                                            handleSlipUpload();
                                        }
                                    }}
                                    disabled={(!slipFile && !slipDocId) || slipUploading || slipStatus.status === 'checking'}
                                    className={`flex-[2] px-4 py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all ${(slipDocId && !slipFile)
                                        ? 'bg-white border border-slate-200 text-slate-900 hover:bg-slate-50'
                                        : 'bg-[var(--shop-accent)] text-white shadow-sm hover:brightness-95 disabled:opacity-50'
                                        }`}
                                >
                                    {slipUploading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                        (slipDocId && !slipFile) ? <CreditCard size={18} /> : <CheckCircle size={18} />
                                    }
                                    {slipDocId
                                        ? (slipFile ? 'ยืนยันใหม่' : 'เลือกรูปใหม่')
                                        : 'ยืนยันชำระเงิน'
                                    }
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {issueItem && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden border border-slate-200 shadow-2xl">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-slate-900 text-sm">แจ้งปัญหาสินค้า</h3>
                                <p className="mt-1 truncate text-xs text-slate-500">{issueItem.productName}</p>
                            </div>
                            <button
                                onClick={closeIssueModal}
                                disabled={isSubmittingIssue}
                                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                                aria-label="ปิด"
                            >
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="p-5 bg-slate-100 space-y-4">
                            {issueItem.issueAdminReply && (
                                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                                    <p className="font-semibold">แอดมินตอบกลับ</p>
                                    <p className="mt-1 leading-5">{issueItem.issueAdminReply}</p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIssueStatus('returned')}
                                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${issueStatus === 'returned'
                                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                                        : 'border-slate-200 bg-white text-slate-600'
                                        }`}
                                >
                                    คืนสินค้า
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIssueStatus('cancelled')}
                                    className={`rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${issueStatus === 'cancelled'
                                        ? 'border-red-200 bg-red-50 text-red-700'
                                        : 'border-slate-200 bg-white text-slate-600'
                                        }`}
                                >
                                    ยกเลิกสินค้า
                                </button>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-700">เหตุผล</label>
                                <textarea
                                    value={issueReason}
                                    onChange={(e) => {
                                        setIssueReason(e.target.value);
                                        setIssueError("");
                                    }}
                                    rows={4}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                    placeholder="เช่น สินค้าชำรุด ได้รับไม่ครบ ต้องการคืนสินค้า"
                                />
                            </div>
                            {issueError && (
                                <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-600">
                                    <XCircle size={14} /> {issueError}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-200 bg-white flex gap-3 pb-safe">
                            <button
                                onClick={closeIssueModal}
                                disabled={isSubmittingIssue}
                                className="flex-1 px-4 py-3 bg-white text-slate-700 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                                ปิด
                            </button>
                            <button
                                onClick={handleSubmitItemIssue}
                                disabled={isSubmittingIssue}
                                className="flex-[2] px-4 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                            >
                                {isSubmittingIssue && <Loader2 className="h-4 w-4 animate-spin" />}
                                ส่งแจ้งปัญหา
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewImage && (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
                    onClick={() => setPreviewImage(null)}
                >
                    <button
                        type="button"
                        onClick={() => setPreviewImage(null)}
                        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20"
                        aria-label="ปิดรูป"
                    >
                        <XCircle size={24} />
                    </button>
                    <img
                        src={previewImage.src}
                        alt={previewImage.alt}
                        onClick={(event) => event.stopPropagation()}
                        className="max-h-[84vh] max-w-full rounded-xl bg-white object-contain shadow-2xl"
                    />
                </div>
            )}

            {isCancelModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-all">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden border border-slate-200 shadow-2xl animate-in slide-in-from-bottom-5 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
                            <h3 className="font-semibold text-slate-900 text-sm">ยกเลิกออเดอร์</h3>
                            <button
                                onClick={() => {
                                    if (canceling) return;
                                    setIsCancelModalOpen(false);
                                    setCancelReason("");
                                    setRefundChannel("");
                                    setCancelError("");
                                }}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="p-5 bg-slate-100 space-y-3">
                            <p className="text-xs text-slate-600">
                                คุณแน่ใจหรือไม่ว่าต้องการยกเลิกออเดอร์นี้? หากยกเลิกแล้วจะไม่สามารถย้อนกลับได้
                            </p>
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-700">เหตุผล (ไม่บังคับ)</label>
                                <textarea
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                    placeholder="ระบุเหตุผลการยกเลิก"
                                />
                            </div>
                            {needsRefundChannel && (
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-700">ช่องทางการคืนเงิน</label>
                                    <textarea
                                        value={refundChannel}
                                        onChange={(e) => {
                                            setRefundChannel(e.target.value);
                                            setCancelError("");
                                        }}
                                        rows={3}
                                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                        placeholder="เช่น พร้อมเพย์ 0812345678 / ธนาคาร กสิกร 123-4-56789-0 ชื่อบัญชี..."
                                    />
                                    <p className="text-[11px] text-slate-500">ใช้สำหรับคืนเงินหลังยกเลิกออเดอร์ที่ชำระแล้ว</p>
                                </div>
                            )}
                            {cancelError && (
                                <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 flex gap-2 items-center">
                                    <XCircle size={14} /> {cancelError}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-200 bg-white flex gap-3 pb-safe">
                            <button
                                onClick={() => {
                                    if (canceling) return;
                                    setIsCancelModalOpen(false);
                                    setCancelReason("");
                                    setRefundChannel("");
                                    setCancelError("");
                                }}
                                className="flex-1 px-4 py-3 bg-white text-slate-700 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                ปิด
                            </button>
                            <button
                                onClick={handleCancelOrder}
                                disabled={canceling}
                                className="flex-1 px-4 py-3 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                                {canceling ? "กำลังยกเลิก..." : "ยืนยันยกเลิก"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function PickupInfo({ label, detail, compact = false }: { label: string; detail?: string; compact?: boolean }) {
    return (
        <div className={`mt-2 rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-800 ${compact ? "px-2 py-1.5 text-[10px]" : "px-2.5 py-2 text-[11px]"}`}>
            <div className="flex items-start gap-1.5">
                <MapPin size={compact ? 12 : 14} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <p className="font-bold">สถานที่รับ: {label}</p>
                    {detail ? <p className="mt-0.5 whitespace-pre-line text-emerald-700">{detail}</p> : null}
                </div>
            </div>
        </div>
    );
}
