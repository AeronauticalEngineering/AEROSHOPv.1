"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { useCoupons } from "@/hooks/useCoupons";
import useLiff from "@/hooks/useLiff";

import { CreditCard, Check, Copy, QrCode, Smartphone, Truck, Globe, XCircle, UploadCloud } from "lucide-react";
import { addDoc, collection, serverTimestamp, doc, setDoc, getDoc, updateDoc, arrayUnion, increment, query, where, orderBy, getDocs, runTransaction } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { buildReceiptFlexMessage } from "@/lib/line/flex";
import { ShippingOption, StoreSettings } from "@/types/store";

interface Promotion {
    id: string;
    type: 'coupon' | 'auto';
    code?: string;
    name: string;
    description: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    minPurchase: number;
    maxDiscount: number | null;
    startDate: DateLike;
    endDate: DateLike;
    isActive: boolean;
}

type DateLike = string | number | Date | { toDate: () => Date };

type PromotionSettings = {
    couponsEnabled: boolean;
    autoPromotionsEnabled: boolean;
};

type CheckoutAddress = {
    linename?: string;
    name: string;
    phone: string;
    citizenId?: string;
    address: string;
    saveToBook?: boolean;
};

type SlipVerifyResult = {
    verified: boolean;
    status: string;
    message: string;
    slipId: string;
};

type PaymentMethod = "promptpay" | "bank_transfer" | "cod" | "stripe" | "omise";

const toDate = (value: DateLike) => {
    if (value instanceof Date) return value;
    if (typeof value === "object" && "toDate" in value) return value.toDate();
    return new Date(value);
};

const formatInvoiceId = (value: number) => `INV${String(value).padStart(5, "0")}`;

export default function CheckoutPaymentPage() {
    const router = useRouter();
    const { userProfile } = useAuth();
    const { useCoupon: markCouponUsed } = useCoupons();
    const { cartItems, totalAmount, clearCart } = useCart();
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    const { liff } = useLiff(liffId);
    const [addressData, setAddressData] = useState<CheckoutAddress | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [promotionSettings, setPromotionSettings] = useState<PromotionSettings>({
        couponsEnabled: true,
        autoPromotionsEnabled: true
    });
    const [appliedCoupon, setAppliedCoupon] = useState<Promotion | null>(null);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
    const [selectedShippingOptionId, setSelectedShippingOptionId] = useState("");
    const [copiedPromptPay, setCopiedPromptPay] = useState(false);
    const [slipFile, setSlipFile] = useState<File | null>(null);
    const [slipPreview, setSlipPreview] = useState<string | null>(null);
    const [slipError, setSlipError] = useState("");
    const [slipVerifyMessage, setSlipVerifyMessage] = useState("");
    const [slipVerifyStatus, setSlipVerifyStatus] = useState<"idle" | "checking" | "verified" | "failed">("idle");
    const [verifiedSlipId, setVerifiedSlipId] = useState<string | null>(null);
    const [uploadedSlipId, setUploadedSlipId] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
    const orderCreatedRef = useRef(false);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Prepare queries
                const settingsRef = doc(db, "settings", "store");
                const promotionSettingsRef = doc(db, "settings", "promotion");
                const now = new Date();
                const promotionsQuery = query(
                    collection(db, "promotions"),
                    where("isActive", "==", true),
                    orderBy("createdAt", "desc")
                );

                // Fetch in parallel
                const [settingsSnap, promotionSettingsSnap, promotionsSnap] = await Promise.all([
                    getDoc(settingsRef),
                    getDoc(promotionSettingsRef),
                    getDocs(promotionsQuery)
                ]);

                // Process Settings
                if (settingsSnap.exists()) {
                    const data = settingsSnap.data() as StoreSettings;
                    setStoreSettings(data);
                }

                const nextPromotionSettings = promotionSettingsSnap.exists()
                    ? {
                        couponsEnabled: promotionSettingsSnap.data().couponsEnabled !== false,
                        autoPromotionsEnabled: promotionSettingsSnap.data().autoPromotionsEnabled !== false
                    }
                    : {
                        couponsEnabled: true,
                        autoPromotionsEnabled: true
                    };
                setPromotionSettings(nextPromotionSettings);

                // Process Promotions
                const activePromos = promotionsSnap.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Promotion))
                    .filter(p => {
                        const start = toDate(p.startDate);
                        const end = toDate(p.endDate);
                        const typeEnabled = p.type === "coupon"
                            ? nextPromotionSettings.couponsEnabled
                            : nextPromotionSettings.autoPromotionsEnabled;
                        return typeEnabled && now >= start && now <= end;
                    });
                setPromotions(activePromos);

            } catch (error) {
                console.error("Error fetching initial data:", error);
            }
        };

        fetchInitialData();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setSelectedShippingOptionId(sessionStorage.getItem("selected_shipping_option") || "");
        const raw = sessionStorage.getItem("applied_coupon");
        if (!raw) {
            setAppliedCoupon(null);
            return;
        }
        try {
            const parsed = JSON.parse(raw) as Promotion | null;
            if (!parsed || parsed.type !== "coupon" || !promotionSettings.couponsEnabled) {
                sessionStorage.removeItem("applied_coupon");
                setAppliedCoupon(null);
                return;
            }
            let coupon = parsed;
            const fromStore = promotions.find(p =>
                p.type === "coupon" &&
                (p.id === coupon.id ||
                    (p.code && coupon.code &&
                        p.code.toUpperCase() === coupon.code.toUpperCase()))
            );
            if (fromStore) coupon = fromStore;

            const start = toDate(coupon.startDate);
            const end = toDate(coupon.endDate);
            const now = new Date();

            if (coupon.isActive === false || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || now < start || now > end) {
                sessionStorage.removeItem("applied_coupon");
                setAppliedCoupon(null);
                return;
            }

            setAppliedCoupon(coupon);
        } catch {
            sessionStorage.removeItem("applied_coupon");
            setAppliedCoupon(null);
        }
    }, [promotions, promotionSettings.couponsEnabled]);

    useEffect(() => {
        if (!userProfile?.uid && appliedCoupon) {
            if (typeof window !== "undefined") {
                sessionStorage.removeItem("applied_coupon");
            }
            setAppliedCoupon(null);
        }
    }, [userProfile?.uid, appliedCoupon]);

    // Calculate item discounts and total summary
    const { discountedItems, totalDiscount, netTotal } = useMemo(() => {
        let discountSum = 0;

        if (appliedCoupon && totalAmount >= appliedCoupon.minPurchase) {
            const coupon = appliedCoupon;
            const rawDiscount = coupon.discountType === 'percentage'
                ? (totalAmount * coupon.discountValue / 100)
                : coupon.discountValue;
            const capped = coupon.maxDiscount != null
                ? Math.min(rawDiscount, coupon.maxDiscount)
                : rawDiscount;
            const couponDiscount = Math.max(0, Math.min(totalAmount, capped));

            return {
                discountedItems: cartItems.map(item => ({
                    ...item,
                    finalPrice: item.price,
                    discountAmountPerUnit: 0,
                    appliedPromo: null
                })),
                totalDiscount: couponDiscount,
                netTotal: totalAmount - couponDiscount
            };
        }

        const itemsWithDiscount = cartItems.map(item => {
            const bestAuto = promotions
                .filter(p => p.type === 'auto' && item.price >= p.minPurchase)
                .sort((a, b) => {
                    const discountA = a.discountType === 'percentage'
                        ? (item.price * a.discountValue / 100)
                        : a.discountValue;
                    const discountB = b.discountType === 'percentage'
                        ? (item.price * b.discountValue / 100)
                        : b.discountValue;
                    return discountB - discountA;
                })[0];

            let finalPrice = item.price;
            let discountAmount = 0;

            if (bestAuto) {
                finalPrice = bestAuto.discountType === 'percentage'
                    ? item.price * (1 - bestAuto.discountValue / 100)
                    : Math.max(0, item.price - bestAuto.discountValue);

                discountAmount = (item.price - finalPrice) * item.quantity;
            }

            discountSum += discountAmount;

            return {
                ...item,
                finalPrice,
                discountAmountPerUnit: item.price - finalPrice,
                appliedPromo: bestAuto
            };
        });

        return {
            discountedItems: itemsWithDiscount,
            totalDiscount: discountSum,
            netTotal: totalAmount - discountSum
        };
    }, [cartItems, promotions, totalAmount, appliedCoupon]);

    const activeShippingOptions = useMemo<ShippingOption[]>(() => {
        if (!storeSettings) return [];
        return (storeSettings.shippingOptions || [])
            .filter(option => option.isActive !== false && option.name)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }, [storeSettings]);

    const hasLocationShippingOptions = useMemo(
        () => activeShippingOptions.some(option => option.conditionType === "location"),
        [activeShippingOptions]
    );

    const automaticShippingOption = useMemo<ShippingOption | null>(() => {
        const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
        const matchedOption = activeShippingOptions.find(option => {
            if (!option.conditionType || option.conditionType === "standard" || option.conditionType === "location") return false;
            const threshold = Number(option.threshold) || 0;
            switch (option.conditionType) {
                case "price_less_than":
                    return netTotal < threshold;
                case "price_greater_than":
                    return netTotal > threshold;
                case "quantity_less_than":
                    return totalQuantity < threshold;
                case "quantity_greater_than":
                    return totalQuantity > threshold;
                default:
                    return false;
            }
        });

        return matchedOption || null;
    }, [activeShippingOptions, cartItems, netTotal]);

    const selectableShippingOptions = useMemo<ShippingOption[]>(() => {
        const directOptions = activeShippingOptions.filter(option => !option.conditionType || option.conditionType === "standard" || option.conditionType === "location");
        const locationOptions = directOptions.filter(option => option.conditionType === "location");

        if (locationOptions.length > 0) {
            return automaticShippingOption ? [...directOptions, automaticShippingOption] : directOptions;
        }
        if (!storeSettings) return [];

        return [{
            id: "default",
            name: "จัดส่งสินค้า",
            fee: storeSettings.shippingFee ?? 50,
            description: "",
            conditionType: "standard",
            isActive: true,
            sortOrder: 0
        }];
    }, [activeShippingOptions, automaticShippingOption, storeSettings]);

    const selectedOption = selectableShippingOptions.find(option => option.id === selectedShippingOptionId) || null;
    const selectedShippingOption = selectedOption || (hasLocationShippingOptions ? selectableShippingOptions[0] : automaticShippingOption || selectableShippingOptions[0]) || null;
    const deliveryFee = !storeSettings?.shippingOptions?.length && storeSettings?.freeShippingThreshold && storeSettings.freeShippingThreshold > 0 && netTotal >= storeSettings.freeShippingThreshold
        ? 0
        : selectedShippingOption?.fee ?? 0;
    const grandTotal = netTotal + deliveryFee;
    const availablePaymentMethods = useMemo<PaymentMethod[]>(() => {
        if (!storeSettings) return [];
        return [
            storeSettings.enablePromptPay ? "promptpay" : null,
            storeSettings.enableBankTransfer ? "bank_transfer" : null,
            storeSettings.enableCOD ? "cod" : null,
            storeSettings.enableStripe ? "stripe" : null,
            storeSettings.enableOmise ? "omise" : null,
        ].filter(Boolean) as PaymentMethod[];
    }, [storeSettings]);
    const selectedPaymentMethod = availablePaymentMethods.includes(paymentMethod as PaymentMethod)
        ? (paymentMethod as PaymentMethod)
        : "";
    const canSubmitOrder = !isSubmitting && slipVerifyStatus !== "checking";

    useEffect(() => {
        if (paymentMethod && !availablePaymentMethods.includes(paymentMethod)) {
            setPaymentMethod("");
            return;
        }

    }, [availablePaymentMethods, paymentMethod]);

    const getPromptPayQrUrl = () => {
        if (!storeSettings) return null;
        if (storeSettings.promptPayQrUrl) return storeSettings.promptPayQrUrl;
        if (!storeSettings.promptPayId) return null;
        return `https://promptpay.io/${encodeURIComponent(storeSettings.promptPayId)}/${grandTotal.toFixed(2)}`;
    };
    const handleCopyPromptPay = () => {
        if (!storeSettings?.promptPayId) return;
        navigator.clipboard.writeText(storeSettings.promptPayId);
        setCopiedPromptPay(true);
        setTimeout(() => setCopiedPromptPay(false), 1800);
    };
    const fileToBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
            reader.readAsDataURL(file);
        });
    const uploadSlipToStorage = async (file: File, slipId: string) => {
        const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const storagePath = `payment_slips/${slipId}-${Date.now()}.${extension}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
        const imageUrl = await getDownloadURL(storageRef);
        return { imageUrl, storagePath };
    };
    const handleSlipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSlipError("");
        setVerifiedSlipId(null);
        setUploadedSlipId(null);
        const useStorageForSlips = Boolean(storeSettings?.useStorageForPaymentSlips);
        const maxBytes = useStorageForSlips ? 5 * 1024 * 1024 : 700 * 1024;
        if (file.size > maxBytes) {
            setSlipFile(null);
            setSlipPreview(null);
            setSlipError(`ไฟล์ใหญ่เกินไป (จำกัด ${useStorageForSlips ? "5MB" : "700KB"}) โปรดบีบอัดรูป`);
            setSlipVerifyStatus("failed");
            setSlipVerifyMessage("ไฟล์ใหญ่เกินไป กรุณาแนบสลิปใหม่");
            return;
        }
        const shouldAutoVerifySlip = Boolean(storeSettings?.enableSlipVerify);
        setSlipFile(file);
        setSlipPreview(URL.createObjectURL(file));
        setSlipVerifyStatus(shouldAutoVerifySlip ? "checking" : "idle");
        setSlipVerifyMessage(shouldAutoVerifySlip ? "กำลังตรวจสอบสลิปอัตโนมัติ..." : "");

        if (!shouldAutoVerifySlip) return;

        try {
            const result = await uploadSelectedSlip(null, file);
            setUploadedSlipId(result?.slipId || null);
            if (result?.verified) {
                setVerifiedSlipId(result.slipId);
            } else {
                setVerifiedSlipId(null);
                setSlipError("");
            }
        } catch (error) {
            console.error("Slip verify on attach failed:", error);
            setVerifiedSlipId(null);
            setSlipVerifyStatus("failed");
            setSlipVerifyMessage("ตรวจสอบสลิปไม่สำเร็จ จะสร้างออเดอร์เป็นรอตรวจสอบ");
            setSlipError("");
        }
    };
    const promptPayQrUrl = getPromptPayQrUrl();
    const uploadSelectedSlip = async (orderId: string | null, fileOverride?: File): Promise<SlipVerifyResult | null> => {
        const file = fileOverride || slipFile;
        if (!file || !addressData) return null;
        const useStorageForSlips = Boolean(storeSettings?.useStorageForPaymentSlips);
        const baseSlipData = {
            orderId,
            userId: userProfile?.uid || userProfile?.id || null,
            paymentMethod: selectedPaymentMethod || null,
            amount: grandTotal,
            mimeType: file.type,
            size: file.size,
            needsVerify: false,
            verifyStatus: "pending",
            verifyMessage: "รอตรวจสอบ",
            createdAt: serverTimestamp()
        };
        const slipDoc = await addDoc(collection(db, "payment_slips"), baseSlipData);

        if (useStorageForSlips) {
            const { imageUrl, storagePath } = await uploadSlipToStorage(file, slipDoc.id);
            await updateDoc(doc(db, "payment_slips", slipDoc.id), {
                imageUrl,
                storagePath,
                storageProvider: "firebase_storage",
                updatedAt: serverTimestamp()
            });
        } else {
            const base64 = await fileToBase64(file);
            await updateDoc(doc(db, "payment_slips", slipDoc.id), {
                base64,
                storageProvider: "firestore_base64",
                updatedAt: serverTimestamp()
            });
        }

        if (!storeSettings?.enableSlipVerify) {
            return {
                verified: false,
                status: "pending",
                message: "รอการตรวจสอบโดยเจ้าหน้าที่",
                slipId: slipDoc.id
            };
        }

        setSlipVerifyStatus("checking");
        setSlipVerifyMessage("กำลังตรวจสอบสลิปอัตโนมัติ...");

        const res = await fetch("/api/slipok/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slipId: slipDoc.id })
        });
        const data = await res.json().catch(() => ({}));
        const status = data?.verifyStatus || data?.status || (res.ok ? "pending" : "error");
        const message = data?.verifyMessage || data?.message || data?.error || "ตรวจสอบสลิปไม่สำเร็จ";
        const verified = res.ok && status === "verified";

        setSlipVerifyStatus(verified ? "verified" : "failed");
        setSlipVerifyMessage(verified ? "ชำระเงินสำเร็จ ตรวจสอบสลิปผ่านแล้ว" : message);

        return { verified, status, message, slipId: slipDoc.id };
    };

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (selectedShippingOptionId && !selectableShippingOptions.some(option => option.id === selectedShippingOptionId)) {
            setSelectedShippingOptionId("");
            sessionStorage.removeItem("selected_shipping_option");
            sessionStorage.removeItem("selected_shipping_location");
        }
    }, [selectableShippingOptions, selectedShippingOptionId]);

    useEffect(() => {
        if (typeof window === "undefined" || selectedShippingOptionId || !hasLocationShippingOptions) return;
        const firstLocationOption = selectableShippingOptions.find(option => option.conditionType === "location");
        if (!firstLocationOption) return;

        const locationAddress = firstLocationOption.description?.trim() || firstLocationOption.name;
        setSelectedShippingOptionId(firstLocationOption.id);
        sessionStorage.setItem("selected_shipping_option", firstLocationOption.id);
        sessionStorage.setItem("selected_shipping_location", JSON.stringify({
            id: firstLocationOption.id,
            name: firstLocationOption.name,
            address: locationAddress
        }));
    }, [hasLocationShippingOptions, selectableShippingOptions, selectedShippingOptionId]);

    useEffect(() => {
        if (orderCreatedRef.current) return;
        const saved = sessionStorage.getItem('checkout_address');
        if (!saved) {
            router.replace('/checkout/address');
            return;
        }
        setAddressData(JSON.parse(saved));

        if (cartItems.length === 0) {
            router.replace('/cart');
        }
    }, [router, cartItems]);

    // Save or update customer record
    const saveCustomer = async (orderId: string) => {
        if (!addressData) return;
        // Use lineId > uid > id > phone as customer ID
        const customerId = userProfile?.lineId || userProfile?.uid || userProfile?.id || addressData.phone;
        const shouldSaveToBook = addressData.saveToBook === true;

        if (!customerId) {
            console.warn("⚠️ No customerId available, skipping customer save");
            return;
        }

        try {
            const customerRef = doc(db, "customers", customerId);
            const customerSnap = await getDoc(customerRef);

            const newAddress = {
                ...(addressData.linename?.trim() ? { linename: addressData.linename.trim() } : {}),
                name: addressData.name,
                phone: addressData.phone,
                ...(addressData.citizenId?.trim() ? { citizenId: addressData.citizenId.trim() } : {}),
                address: addressData.address,
                usedAt: new Date().toISOString()
            };

            // Common fields to update
            const commonFields = {
                name: addressData.name,
                linename: addressData.linename?.trim() || userProfile?.displayName || userProfile?.name || null,
                phone: addressData.phone,
                citizenId: addressData.citizenId?.trim() || null,
                address: addressData.address,
                // Keep LINE profile updated (prefer LIFF data)
                // Note: userProfile is already merged in component, but keeping original fallback logic just in case
                lineId: userProfile?.lineId || null,
                displayName: userProfile?.displayName || userProfile?.name || addressData.linename || null,
                pictureUrl: userProfile?.pictureUrl || userProfile?.photoURL || null,
                updatedAt: serverTimestamp()
            };

            if (customerSnap.exists()) {
                const updateData: Record<string, unknown> = {
                    ...commonFields,
                    totalOrders: increment(1),
                    totalSpent: increment(grandTotal),
                    lastOrderId: orderId,
                    lastOrderAt: serverTimestamp()
                };

                // Only add to history if requested
                if (shouldSaveToBook) {
                    updateData.addressHistory = arrayUnion(newAddress);
                }

                await setDoc(customerRef, updateData, { merge: true });
            } else {
                await setDoc(customerRef, {
                    ...commonFields,
                    id: customerId,
                    totalOrders: 1,
                    totalSpent: grandTotal,
                    // Address history based on preference
                    addressHistory: shouldSaveToBook ? [newAddress] : [],
                    firstOrderId: orderId,
                    lastOrderId: orderId,
                    lastOrderAt: serverTimestamp(),
                    createdAt: serverTimestamp()
                });
            }
        } catch (err) {
            console.error("❌ Error saving customer:", err);
        }
    };

    const handleOrderSubmit = async () => {
        if (!addressData) return;

        setIsSubmitting(true);
        try {
            const isSlipPayment = selectedPaymentMethod === "promptpay" || selectedPaymentMethod === "bank_transfer";
            let slipVerifyResult: SlipVerifyResult | null = null;

            if (isSlipPayment && verifiedSlipId && slipVerifyStatus === "verified") {
                slipVerifyResult = {
                    verified: true,
                    status: "verified",
                    message: slipVerifyMessage || "ชำระเงินสำเร็จ ตรวจสอบสลิปผ่านแล้ว",
                    slipId: verifiedSlipId
                };
            }

            const customerId = userProfile?.lineId || userProfile?.uid || userProfile?.id || 'guest';

            const baseOrderData = {
                userId: userProfile?.uid || userProfile?.id || 'guest',
                customerId: customerId,
                // Make sure to capture LIFF data if available
                lineId: userProfile?.lineId || null,
                lineDisplayName: userProfile?.displayName || userProfile?.name || addressData.linename || null,
                linePictureUrl: userProfile?.pictureUrl || userProfile?.photoURL || null,
                customerName: addressData.name,
                customerPhone: addressData.phone,
                customerCitizenId: addressData.citizenId?.trim() || null,
                shippingAddress: addressData.address,
                items: discountedItems.map(item => ({
                    productId: item.id,
                    productName: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    finalPrice: item.finalPrice, // Save final price per unit
                    discountAmount: item.discountAmountPerUnit * item.quantity, // Total discount for this line item
                    appliedPromo: item.appliedPromo ? {
                        id: item.appliedPromo.id,
                        name: item.appliedPromo.name,
                        discountType: item.appliedPromo.discountType,
                        discountValue: item.appliedPromo.discountValue
                    } : null,
                    imageUrl: item.imageUrl,
                    variantInfo: item.selectedVariant ? item.selectedVariant.name : null,
                    addOns: item.selectedAddOns || [],
                    bundleItems: item.bundleItems || []
                })),
                totalDiscount: totalDiscount, // Save total discount
                subTotal: totalAmount, // Original subtotal
                deliveryFee: deliveryFee,
                shippingOptionId: selectedShippingOption?.id || null,
                shippingOptionName: selectedShippingOption?.name || null,
                totalAmount: grandTotal, // Net total
                status: slipVerifyResult?.verified ? 'paid' : 'pending',
                paymentMethod: selectedPaymentMethod || 'pay_later',
                paymentStatus: slipVerifyResult?.verified ? 'verified' : isSlipPayment ? 'pending' : null,
                paymentVerifiedAt: slipVerifyResult?.verified ? serverTimestamp() : null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            const orderId = await runTransaction(db, async (transaction) => {
                const counterRef = doc(db, "counters", "orders");
                const counterSnap = await transaction.get(counterRef);
                const currentNumber = counterSnap.exists() ? Number(counterSnap.data().lastNumber || 0) : 0;
                const nextNumber = currentNumber + 1;
                const nextOrderId = formatInvoiceId(nextNumber);
                const orderRef = doc(db, "orders", nextOrderId);

                transaction.set(counterRef, {
                    lastNumber: nextNumber,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                transaction.set(orderRef, {
                    ...baseOrderData,
                    orderNo: nextOrderId,
                    invoiceNumber: nextNumber
                });

                return nextOrderId;
            });

            // Save customer data
            await saveCustomer(orderId);

            if (appliedCoupon?.id && userProfile?.uid) {
                await markCouponUsed(appliedCoupon.id, orderId);
                if (typeof window !== "undefined") {
                    sessionStorage.removeItem("applied_coupon");
                }
            }

            const existingSlipId = slipVerifyResult?.slipId || uploadedSlipId;
            if (existingSlipId) {
                await updateDoc(doc(db, "payment_slips", existingSlipId), {
                    orderId,
                    userId: userProfile?.uid || userProfile?.id || null,
                    updatedAt: serverTimestamp()
                });
            } else if (isSlipPayment && slipFile) {
                slipVerifyResult = await uploadSelectedSlip(orderId);
            }

            if (selectedPaymentMethod === 'stripe') {
                const stripeRes = await fetch('/api/stripe/create-checkout-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId })
                });

                if (!stripeRes.ok) {
                    const data = await stripeRes.json().catch(() => ({}));
                    alert(data?.error || 'Failed to create Stripe Checkout session');
                    setIsSubmitting(false);
                    return;
                }

                const { url } = await stripeRes.json();
                if (url) {
                    window.location.href = url;
                    return; // Prevent further execution while redirecting
                }
            }

            await fetch("/api/orders/notify-created", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId })
            }).catch(() => undefined);

            orderCreatedRef.current = true;

            if (typeof window !== "undefined") {
                sessionStorage.removeItem("checkout_address");
                sessionStorage.removeItem("selected_shipping_location");
            }
            clearCart();

            if (slipVerifyResult?.verified) {
                alert("ชำระเงินสำเร็จ ระบบตรวจสอบสลิปผ่านแล้ว");
            } else if (storeSettings?.enableSlipVerify && isSlipPayment) {
                alert("สร้างออเดอร์แล้ว สถานะรอตรวจสอบการชำระเงิน");
            }

            if (liff && typeof liff.isInClient === "function" && liff.isInClient()) {
                try {
                    await liff.sendMessages([
                        buildReceiptFlexMessage({
                            orderId,
                            liffId: liffId || "",
                            orderData: {
                                ...baseOrderData,
                                orderNo: orderId,
                                id: orderId
                            }
                        })
                    ]);
                } catch (sendError) {
                    console.error("Error sending checkout receipt message:", sendError);
                }
                if (typeof liff.closeWindow === "function") {
                    liff.closeWindow();
                    return;
                }
            }

            router.replace(`/myorder/${orderId}`);
        } catch (error) {
            console.error("Error creating order: ", error);
            alert("เกิดข้อผิดพลาดในการสั่งซื้อ กรุณาลองใหม่อีกครั้ง");
            setIsSubmitting(false);
        }
    };

    if (!addressData || !storeSettings) return null;

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white px-4 py-3 sticky top-0 z-20 border-b border-gray-100">

                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-2 mt-4 pb-1">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center">
                            <Check size={14} />
                        </div>
                        <span className="text-xs font-medium text-gray-400">ที่อยู่</span>
                    </div>
                    <div className="w-8 h-0.5 bg-gray-900"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center">
                            <Check size={14} />
                        </div>
                        <span className="text-xs font-medium text-gray-400">สรุปรายการ</span>
                    </div>
                    <div className="w-8 h-0.5 bg-gray-900"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">3</div>
                        <span className="text-xs font-medium text-gray-900">ชำระเงิน</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 space-y-4 overflow-y-auto pb-28">
                {/* Payment Method */}
                <div className="space-y-3">
                    <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wide px-1">วิธีชำระเงิน</h2>

                    {storeSettings.enablePromptPay && (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => setPaymentMethod('promptpay')}
                                className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${paymentMethod === 'promptpay'
                                    ? 'border-gray-900 bg-white'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                            >
                                <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${paymentMethod === 'promptpay' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                                    }`}>
                                    <Smartphone size={22} />
                                </div>
                                <div className="text-left flex-1">
                                    <span className="block font-semibold text-gray-900 text-sm">พร้อมเพย์ (PromptPay)</span>
                                    <span className="text-xs text-gray-400">
                                        {storeSettings.promptPayAccountName
                                            ? `ผู้รับโอน: ${storeSettings.promptPayAccountName}`
                                            : "สแกนจ่ายสะดวก รวดเร็ว"}
                                    </span>
                                </div>
                                {paymentMethod === 'promptpay' && (
                                    <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center">
                                        <Check size={14} className="text-white" />
                                    </div>
                                )}
                            </button>

                            {paymentMethod === 'promptpay' && (
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                                        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                            <QrCode size={16} />
                                            ข้อมูลการชำระเงิน
                                        </h3>
                                        <span className="text-sm font-extrabold text-slate-950">฿{grandTotal.toLocaleString()}</span>
                                    </div>

                                    <div className="p-3 sm:p-4">
                                        <div className="grid grid-cols-[124px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[170px_1fr] sm:gap-4">
                                                <button
                                                    type="button"
                                                    onClick={() => promptPayQrUrl && setPreviewImage({ src: promptPayQrUrl, alt: "PromptPay QR" })}
                                                    disabled={!promptPayQrUrl}
                                                    className="group relative flex h-28 w-28 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed sm:h-40 sm:w-40 sm:rounded-2xl sm:p-3"
                                                    aria-label="ขยายรูป QR"
                                                >
                                                    {promptPayQrUrl ? (
                                                        <>
                                                            <img
                                                                src={promptPayQrUrl}
                                                                alt="PromptPay QR"
                                                                className="h-full w-full object-contain"
                                                            />
                                                            <span className="absolute inset-x-2 bottom-2 rounded-full bg-slate-950/75 py-0.5 text-[9px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 sm:inset-x-3 sm:bottom-3 sm:py-1 sm:text-[10px]">
                                                                กดเพื่อขยาย
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <div className="flex h-full items-center justify-center text-center text-xs text-slate-400">
                                                            ไม่พบ QR
                                                        </div>
                                                    )}
                                                </button>
                                                <div className="min-w-0 py-1">
                                                    <p className="text-sm font-extrabold text-slate-950 sm:text-base">PromptPay QR</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-700">
                                                        ผู้รับโอน: {storeSettings.promptPayAccountName || storeSettings.storeName || "-"}
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">สแกนจ่ายยอด ฿{grandTotal.toLocaleString()}</p>
                                                    {storeSettings.promptPayId && (
                                                        <button
                                                            type="button"
                                                            onClick={handleCopyPromptPay}
                                                            className="mt-2 inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] font-bold text-slate-900 sm:mt-3 sm:text-xs"
                                                        >
                                                            <span className="truncate">{storeSettings.promptPayId}</span>
                                                            {copiedPromptPay ? <Check size={12} className="shrink-0 text-emerald-500" /> : <Copy size={12} className="shrink-0 text-slate-500" />}
                                                        </button>
                                                    )}
                                                </div>
                                        </div>
                                    </div>
                                    <div className="border-t border-slate-200 p-4">
                                        <div className="flex items-center gap-3">
                                            {slipPreview ? (
                                                <img
                                                    src={slipPreview}
                                                    alt="สลิปการชำระเงิน"
                                                    className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                                                    <UploadCloud size={18} />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-semibold text-slate-900">{slipFile?.name || "ยังไม่ได้แนบสลิป"}</p>
                                                <p className="mt-0.5 text-[10px] text-slate-400">
                                                    {storeSettings.enableSlipVerify
                                                        ? "ตรวจสอบอัตโนมัติหลังเลือกไฟล์"
                                                        : `รูปภาพไม่เกิน ${storeSettings.useStorageForPaymentSlips ? "5MB" : "700KB"}`}
                                                </p>
                                            </div>
                                            <label className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-bold text-white shadow-sm shadow-gray-900/20 transition hover:bg-gray-800 active:scale-[0.98]">
                                                <UploadCloud size={14} />
                                                {slipFile ? "เปลี่ยน" : "แนบ"}
                                                <input type="file" accept="image/*" className="hidden" onChange={handleSlipChange} />
                                            </label>
                                        </div>
                                        {slipVerifyMessage && (
                                            <p className={`mt-3 rounded-lg px-3 py-2 text-[11px] font-semibold ${slipVerifyStatus === "verified"
                                                ? "bg-green-50 text-green-700"
                                                : slipVerifyStatus === "failed"
                                                    ? "bg-red-50 text-red-700"
                                                    : slipVerifyStatus === "checking"
                                                        ? "bg-blue-50 text-blue-700"
                                                        : "bg-orange-50 text-orange-700"
                                                }`}>
                                                {slipVerifyMessage}
                                            </p>
                                        )}
                                        {slipError && !slipVerifyMessage && (
                                            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">{slipError}</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {storeSettings.enableBankTransfer && (
                        <button
                            type="button"
                            onClick={() => setPaymentMethod('bank_transfer')}
                            className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${paymentMethod === 'bank_transfer'
                                ? 'border-gray-900 bg-white'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                }`}
                        >
                            <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${paymentMethod === 'bank_transfer' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                                }`}>
                                <CreditCard size={22} />
                            </div>
                            <div className="text-left flex-1">
                                <span className="block font-semibold text-gray-900 text-sm">โอนเงินผ่านบัญชีธนาคาร</span>
                                <span className="text-xs text-gray-400">
                                    {storeSettings.bankAccountName
                                        ? `ผู้รับโอน: ${storeSettings.bankAccountName}`
                                        : "แนบสลิปการโอนเงิน"}
                                </span>
                            </div>
                            {paymentMethod === 'bank_transfer' && (
                                <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center">
                                    <Check size={14} className="text-white" />
                                </div>
                            )}
                        </button>
                    )}

                    {storeSettings.enableCOD && (
                        <button
                            type="button"
                            onClick={() => setPaymentMethod('cod')}
                            className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${paymentMethod === 'cod'
                                ? 'border-gray-900 bg-white'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                }`}
                        >
                            <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${paymentMethod === 'cod' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                                }`}>
                                <Truck size={22} />
                            </div>
                            <div className="text-left flex-1">
                                <span className="block font-semibold text-gray-900 text-sm">เก็บเงินปลายทาง</span>
                                <span className="text-xs text-gray-400">จ่ายเมื่อได้รับสินค้า</span>
                            </div>
                            {paymentMethod === 'cod' && (
                                <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center">
                                    <Check size={14} className="text-white" />
                                </div>
                            )}
                        </button>
                    )}

                    {storeSettings.enableStripe && (
                        <button
                            type="button"
                            onClick={() => setPaymentMethod('stripe')}
                            className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${paymentMethod === 'stripe'
                                ? 'border-gray-900 bg-white'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                }`}
                        >
                            <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${paymentMethod === 'stripe' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                                }`}>
                                <Globe size={22} />
                            </div>
                            <div className="text-left flex-1">
                                <span className="block font-semibold text-gray-900 text-sm">บัตรเครดิต / เดบิต (Stripe)</span>
                                <span className="text-xs text-gray-400">ชำระผ่านบัตรปลอดภัย</span>
                            </div>
                            {paymentMethod === 'stripe' && (
                                <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center">
                                    <Check size={14} className="text-white" />
                                </div>
                            )}
                        </button>
                    )}

                    {storeSettings.enableOmise && (
                        <button
                            type="button"
                            onClick={() => setPaymentMethod('omise')}
                            className={`w-full p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${paymentMethod === 'omise'
                                ? 'border-gray-900 bg-white'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                }`}
                        >
                            <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${paymentMethod === 'omise' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'
                                }`}>
                                <Globe size={22} />
                            </div>
                            <div className="text-left flex-1">
                                <span className="block font-semibold text-gray-900 text-sm">บัตรเครดิต / เดบิต (Omise)</span>
                                <span className="text-xs text-gray-400">ชำระผ่านบัตรปลอดภัย</span>
                            </div>
                            {paymentMethod === 'omise' && (
                                <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center">
                                    <Check size={14} className="text-white" />
                                </div>
                            )}
                        </button>
                    )}
                </div>
            </main>

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
                    <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <img
                            src={previewImage.src}
                            alt={previewImage.alt}
                            className="mx-auto max-h-[76vh] w-full object-contain"
                        />
                        <p className="mt-3 text-center text-xs font-semibold text-slate-500">PromptPay QR</p>
                    </div>
                </div>
            )}

            {/* Bottom Button */}
            <div className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-100 px-4 py-3 pb-6 z-30">
                <button
                    type="button"
                    onClick={handleOrderSubmit}
                    disabled={!canSubmitOrder}
                    className="w-full bg-gray-900 text-white py-3.5 rounded-full font-bold text-base hover:bg-gray-800 transition-all disabled:opacity-50 flex justify-center items-center"
                >
                    {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : slipVerifyStatus === "checking" ? (
                        "กำลังตรวจสอบสลิป..."
                    ) : (
                        `ยืนยันคำสั่งซื้อ • ฿${grandTotal.toLocaleString()}`
                    )}
                </button>
            </div>
        </div>
    );
}

