"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, MapPin, Megaphone, Phone, ReceiptText, ShoppingBag, User } from "lucide-react";
import { collection, doc, getDoc, getDocs, orderBy, query, where } from "firebase/firestore";
import { useCart } from "@/context/CartContext";
import { db } from "@/lib/firebase";
import { ShippingOption, StoreSettings } from "@/types/store";
import CheckoutOrderSummaryPage from "@/components/CheckoutOrderSummaryPage";

interface Promotion {
    id: string;
    type: "coupon" | "auto";
    code?: string;
    name: string;
    description: string;
    discountType: "percentage" | "fixed";
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

const toDate = (value: DateLike) => {
    if (value instanceof Date) return value;
    if (typeof value === "object" && "toDate" in value) return value.toDate();
    return new Date(value);
};

export default function CheckoutSummaryPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-900 border-t-transparent"></div>
            </div>
        }>
            <CheckoutSummaryContent />
        </Suspense>
    );
}

function CheckoutSummaryContent() {
    const searchParams = useSearchParams();
    if (searchParams.get("orderId")) {
        return <CheckoutOrderSummaryPage />;
    }

    return <CheckoutPreOrderSummary />;
}

function CheckoutPreOrderSummary() {
    const router = useRouter();
    const { cartItems, totalAmount } = useCart();
    const [addressData] = useState<CheckoutAddress | null>(() => {
        if (typeof window === "undefined") return null;
        const saved = sessionStorage.getItem("checkout_address");
        return saved ? JSON.parse(saved) : null;
    });
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [promotionSettings, setPromotionSettings] = useState<PromotionSettings>({
        couponsEnabled: true,
        autoPromotionsEnabled: true
    });
    const [rawAppliedCoupon] = useState(() => {
        if (typeof window === "undefined") return "";
        return sessionStorage.getItem("applied_coupon") || "";
    });
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
    const [isSubmitting] = useState(false);
    const [selectedShippingOptionId] = useState(() => {
        if (typeof window === "undefined") return "";
        return sessionStorage.getItem("selected_shipping_option") || "";
    });

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const settingsRef = doc(db, "settings", "store");
                const promotionSettingsRef = doc(db, "settings", "promotion");
                const promotionsQuery = query(
                    collection(db, "promotions"),
                    where("isActive", "==", true),
                    orderBy("createdAt", "desc")
                );
                const [settingsSnap, promotionSettingsSnap, promotionsSnap] = await Promise.all([
                    getDoc(settingsRef),
                    getDoc(promotionSettingsRef),
                    getDocs(promotionsQuery)
                ]);

                if (settingsSnap.exists()) setStoreSettings(settingsSnap.data() as StoreSettings);
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

                const now = new Date();
                const activePromos = promotionsSnap.docs
                    .map(promoDoc => ({ id: promoDoc.id, ...promoDoc.data() } as Promotion))
                    .filter(promo => {
                        const start = toDate(promo.startDate);
                        const end = toDate(promo.endDate);
                        const typeEnabled = promo.type === "coupon"
                            ? nextPromotionSettings.couponsEnabled
                            : nextPromotionSettings.autoPromotionsEnabled;
                        return typeEnabled && now >= start && now <= end;
                    });
                setPromotions(activePromos);
            } catch (error) {
                console.error("Error loading checkout summary:", error);
            }
        };

        fetchInitialData();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const saved = sessionStorage.getItem("checkout_address");
        if (!saved) {
            router.replace("/checkout/address");
            return;
        }
    }, [router, promotions, promotionSettings.couponsEnabled]);

    const appliedCoupon = useMemo<Promotion | null>(() => {
        if (!rawAppliedCoupon || !promotionSettings.couponsEnabled) return null;
        try {
            const parsed = JSON.parse(rawAppliedCoupon) as Promotion | null;
            if (!parsed || parsed.type !== "coupon") return null;
            const fromStore = promotions.find(promo =>
                promo.type === "coupon" &&
                (promo.id === parsed.id ||
                    (promo.code && parsed.code && promo.code.toUpperCase() === parsed.code.toUpperCase()))
            );
            const coupon = fromStore || parsed;
            const start = toDate(coupon.startDate);
            const end = toDate(coupon.endDate);
            const now = new Date();
            if (coupon.isActive === false || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || now < start || now > end) return null;
            return coupon;
        } catch {
            return null;
        }
    }, [promotions, promotionSettings.couponsEnabled, rawAppliedCoupon]);

    useEffect(() => {
        if (cartItems.length === 0) router.replace("/cart");
    }, [cartItems.length, router]);

    const { discountedItems, totalDiscount, netTotal } = useMemo(() => {
        let discountSum = 0;

        if (appliedCoupon && totalAmount >= appliedCoupon.minPurchase) {
            const rawDiscount = appliedCoupon.discountType === "percentage"
                ? (totalAmount * appliedCoupon.discountValue / 100)
                : appliedCoupon.discountValue;
            const capped = appliedCoupon.maxDiscount != null
                ? Math.min(rawDiscount, appliedCoupon.maxDiscount)
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
                .filter(promo => promo.type === "auto" && item.price >= promo.minPurchase)
                .sort((a, b) => {
                    const discountA = a.discountType === "percentage" ? (item.price * a.discountValue / 100) : a.discountValue;
                    const discountB = b.discountType === "percentage" ? (item.price * b.discountValue / 100) : b.discountValue;
                    return discountB - discountA;
                })[0];

            let finalPrice = item.price;
            let discountAmount = 0;

            if (bestAuto) {
                finalPrice = bestAuto.discountType === "percentage"
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
        return activeShippingOptions.find(option => {
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
        }) || null;
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


    if (!addressData || !storeSettings) return null;

    return (
        <div className="flex min-h-screen flex-col bg-gray-50">
            <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-4 py-3">
                <div className="flex items-center justify-center gap-2 mt-4 pb-1">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center">
                            <Check size={14} />
                        </div>
                        <span className="text-xs font-medium text-gray-400">ที่อยู่</span>
                    </div>
                    <div className="w-8 h-0.5 bg-gray-900"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">2</div>
                        <span className="text-xs font-medium text-gray-900">สรุปรายการ</span>
                    </div>
                    <div className="w-8 h-0.5 bg-gray-200"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-xs font-bold">3</div>
                        <span className="text-xs font-medium text-gray-400">ชำระเงิน</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 space-y-4 p-4 pb-28">
                <section className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                            <ReceiptText size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                            <div className="min-w-0">
                                <h1 className="text-base font-bold text-gray-900">ยืนยันคำสั่งซื้อ</h1>
                                <p className="text-xs text-gray-400">ตรวจสอบข้อมูลให้ครบถ้วนก่อนชำระเงิน</p>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                รอชำระ
                            </span>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="mb-3 flex items-center gap-2 text-gray-500">
                        <ShoppingBag size={16} />
                        <span className="text-xs font-semibold uppercase tracking-wide">สรุปรายการ</span>
                    </div>
                    <div className="space-y-2">
                        {discountedItems.map(item => (
                            <div key={item.cartItemId} className="flex justify-between text-sm">
                                <div className="min-w-0 text-gray-600">
                                    <span className="font-semibold text-gray-900">{item.name}</span>
                                    {item.selectedVariant && <span className="text-gray-400 ml-1">({item.selectedVariant.name})</span>}
                                    <span className="text-gray-400"> x{item.quantity}</span>
                                    {item.productType === "bundle" && item.bundleItems && item.bundleItems.length > 0 && (
                                        <div className="mt-0.5 space-y-0.5 text-[10px] text-gray-400">
                                            {item.bundleItems.map(bundleItem => (
                                                <div key={bundleItem.id}>
                                                    <div>{bundleItem.productName}{bundleItem.variantName ? ` (${bundleItem.variantName})` : ""} x{bundleItem.quantity}</div>
                                                    {bundleItem.selectedAddOns && bundleItem.selectedAddOns.length > 0 && (
                                                        <div className="ml-2 space-y-0.5">
                                                            {bundleItem.selectedAddOns.map(addOn => (
                                                                <div key={addOn.id}>
                                                                    {addOn.name}{addOn.value ? `: ${addOn.value}` : ""} {addOn.price > 0 ? `(+฿${addOn.price.toLocaleString()})` : ""}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                                        <div className="mt-0.5 space-y-0.5 text-[10px] text-gray-400">
                                            {item.selectedAddOns.map(addOn => (
                                                <div key={addOn.id}>
                                                    {addOn.name}{addOn.value ? `: ${addOn.value}` : ""} {addOn.price > 0 ? `(+฿${addOn.price.toLocaleString()})` : ""}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {item.appliedPromo && (
                                        <div className="mt-0.5 flex items-center gap-0.5 text-[10px] font-medium text-red-500">
                                            <Megaphone size={8} /> {item.appliedPromo.name}
                                        </div>
                                    )}
                                </div>
                                <div className="flex shrink-0 flex-col items-end">
                                    <span className={`font-medium ${item.appliedPromo ? "text-red-600" : "text-gray-900"}`}>
                                        ฿{(item.finalPrice * item.quantity).toLocaleString()}
                                    </span>
                                    {item.appliedPromo && (
                                        <span className="text-xs text-gray-400 line-through">
                                            ฿{(item.price * item.quantity).toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div className="flex justify-between border-t border-gray-100 pt-3 text-sm">
                            <span className="text-gray-500">รวมสินค้า</span>
                            <span className="font-medium text-gray-900">฿{totalAmount.toLocaleString()}</span>
                        </div>
                        {totalDiscount > 0 && (
                            <div className="flex justify-between text-sm text-red-500">
                                <span>โปรโมชั่นส่วนลด</span>
                                <span className="font-medium">-฿{totalDiscount.toLocaleString()}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">{selectedShippingOption?.name || "ค่าจัดส่ง"}</span>
                            <span className="font-medium text-gray-900">{deliveryFee === 0 ? "ฟรี" : `฿${deliveryFee.toLocaleString()}`}</span>
                        </div>
                        <div className="flex justify-between border-t border-gray-100 pt-3">
                            <span className="font-bold text-gray-900">รวมทั้งหมด</span>
                            <span className="text-xl font-extrabold text-gray-900">฿{grandTotal.toLocaleString()}</span>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-gray-100 bg-white p-4">
                    <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-start gap-3">
                            <User size={16} className="mt-0.5 text-gray-400" />
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">ผู้รับ</p>
                                <p className="font-semibold text-gray-900">{addressData.name}</p>
                                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                                    <Phone size={12} /> {addressData.phone}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                            <MapPin size={16} className="mt-0.5 shrink-0 text-gray-400" />
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{selectedShippingOption?.name || "ที่อยู่จัดส่ง"}</p>
                                <p className="mt-1 text-sm leading-relaxed text-gray-700">{addressData.address}</p>
                            </div>
                        </div>
                    </div>
                </section>

            </main>

            <div className="fixed bottom-0 z-30 w-full max-w-md border-t border-gray-100 bg-white px-4 py-3 pb-6">
                <div className="grid grid-cols-[0.85fr_1.15fr] gap-2">
                    <button
                        type="button"
                        onClick={() => router.push("/checkout/address")}
                        disabled={isSubmitting}
                        className="flex items-center justify-center gap-1 rounded-full border border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-700 disabled:opacity-50"
                    >
                        <ChevronLeft size={16} />
                        กลับ
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push("/checkout/payment")}
                        className="rounded-full bg-orange-500 py-3.5 text-sm font-bold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-[0.98]"
                    >
                        ยืนยันและชำระเงิน
                    </button>
                </div>
            </div>
        </div>
    );
}
