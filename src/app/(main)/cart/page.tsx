"use client";

import { useCart } from "@/context/CartContext";
import { Trash2, Minus, Plus, ShoppingBag, Megaphone, Ticket, Check, X, Truck } from "lucide-react";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";

import { Promotion, usePromotions } from "@/context/PromotionContext";
import { useCoupons } from "@/hooks/useCoupons";
import { useAuth } from "@/context/AuthContext";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ShippingOption, StoreSettings } from "@/types/store";

type DateLike = string | number | Date | { toDate: () => Date };

const toDate = (value: DateLike) => {
    if (value instanceof Date) return value;
    if (typeof value === "object" && "toDate" in value) return value.toDate();
    return new Date(value);
};

export default function CartPage() {
    const { cartItems, updateQuantity, removeFromCart, totalAmount } = useCart();
    const { promotions, settings: promotionSettings } = usePromotions();
    const { myCoupons } = useCoupons();
    const { userProfile } = useAuth();
    const [couponCode, setCouponCode] = useState("");
    const [appliedCoupon, setAppliedCoupon] = useState<Promotion | null>(null);
    const [couponError, setCouponError] = useState("");
    const [showManualInput, setShowManualInput] = useState(false);
    const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
    const [selectedShippingOptionId, setSelectedShippingOptionId] = useState("");

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, "settings", "store"), (doc) => {
            if (doc.exists()) {
                setStoreSettings(doc.data() as StoreSettings);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setSelectedShippingOptionId(sessionStorage.getItem("selected_shipping_option") || "");
    }, []);

    const isCouponExpired = (coupon: Promotion) => {
        const end = toDate(coupon.endDate as DateLike);
        return end < new Date();
    };

    const couponMeetsSubtotal = (coupon: Promotion) => {
        return totalAmount >= coupon.minPurchase;
    };

    const applyCoupon = () => {
        if (!promotionSettings.couponsEnabled) {
            clearCoupon();
            return;
        }

        const normalized = couponCode.trim().toUpperCase();
        if (!normalized) {
            setCouponError("กรุณากรอกรหัสคูปอง");
            return;
        }

        if (!userProfile?.uid) {
            setCouponError("กรุณาเข้าสู่ระบบก่อนใช้คูปอง");
            return;
        }

        const promo = promotions.find(
            p => p.type === "coupon" && (p.code || "").toUpperCase() === normalized
        );

        if (!promo) {
            setAppliedCoupon(null);
            setCouponError("ไม่พบคูปองนี้");
            return;
        }

        const collected = myCoupons.some(c => c.id === promo.id);
        if (!collected) {
            setAppliedCoupon(null);
            setCouponError("คุณยังไม่ได้เก็บคูปองนี้");
            return;
        }

        if (isCouponExpired(promo)) {
            setAppliedCoupon(null);
            setCouponError("คูปองหมดอายุแล้ว");
            return;
        }

        if (!couponMeetsSubtotal(promo)) {
            setAppliedCoupon(null);
            setCouponError("ยอดสินค้าในตะกร้ายังไม่ถึงขั้นต่ำของคูปอง");
            return;
        }

        setAppliedCoupon(promo);
        setCouponError("");
        setCouponCode(normalized);
    };

    const selectCoupon = (coupon: Promotion) => {
        if (!promotionSettings.couponsEnabled) {
            clearCoupon();
            return;
        }

        if (!userProfile?.uid) {
            setCouponError("กรุณาเข้าสู่ระบบก่อนใช้คูปอง");
            return;
        }
        const liveCoupon = promotions.find(p =>
            p.type === "coupon" &&
            (p.id === coupon.id ||
                (p.code && coupon.code &&
                    p.code.toUpperCase() === coupon.code.toUpperCase()))
        );
        if (!liveCoupon) {
            setAppliedCoupon(null);
            setCouponError("คูปองนี้ยังไม่พร้อมใช้งานหรือถูกปิดแล้ว");
            return;
        }
        if (isCouponExpired(liveCoupon)) {
            setAppliedCoupon(null);
            setCouponError("คูปองหมดอายุแล้ว");
            return;
        }
        if (!couponMeetsSubtotal(liveCoupon)) {
            setAppliedCoupon(null);
            setCouponError("ยอดสินค้าในตะกร้ายังไม่ถึงขั้นต่ำของคูปอง");
            return;
        }
        setAppliedCoupon(liveCoupon);
        setCouponError("");
        setCouponCode((liveCoupon.code || "").toUpperCase());
    };

    const clearCoupon = () => {
        setAppliedCoupon(null);
        setCouponError("");
        setCouponCode("");
    };

    const serializeCoupon = (coupon: Promotion) => {
        const start = toDate(coupon.startDate as DateLike);
        const end = toDate(coupon.endDate as DateLike);

        return {
            id: coupon.id,
            type: coupon.type,
            code: coupon.code || null,
            name: coupon.name,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minPurchase: coupon.minPurchase,
            maxDiscount: coupon.maxDiscount ?? null,
            startDate: Number.isNaN(start.getTime()) ? null : start.toISOString(),
            endDate: Number.isNaN(end.getTime()) ? null : end.toISOString(),
            isActive: coupon.isActive !== false
        };
    };

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!appliedCoupon) {
            sessionStorage.removeItem("applied_coupon");
            return;
        }
        sessionStorage.setItem("applied_coupon", JSON.stringify(serializeCoupon(appliedCoupon)));
    }, [appliedCoupon]);

    useEffect(() => {
        if (!userProfile?.uid && appliedCoupon) {
            clearCoupon();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile?.uid]);

    useEffect(() => {
        if (!promotionSettings.couponsEnabled && appliedCoupon) {
            clearCoupon();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promotionSettings.couponsEnabled, appliedCoupon]);

    useEffect(() => {
        if (appliedCoupon && !couponMeetsSubtotal(appliedCoupon)) {
            setCouponError("ยอดสินค้าในตะกร้ายังไม่ถึงขั้นต่ำของคูปอง");
            setAppliedCoupon(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [totalAmount]);

    const handleSelectCoupon = (couponId: string) => {
        if (!couponId) {
            clearCoupon();
            return;
        }
        const coupon = myCoupons.find(c => c.id === couponId);
        if (!coupon) return;
        selectCoupon(coupon);
    };

    const availableMyCoupons = useMemo(() => {
        if (!promotionSettings.couponsEnabled) return [];
        return myCoupons.filter(coupon =>
            promotions.some(p =>
                p.type === "coupon" &&
                (p.id === coupon.id ||
                    (p.code && coupon.code &&
                        p.code.toUpperCase() === coupon.code.toUpperCase()))
            )
        );
    }, [myCoupons, promotionSettings.couponsEnabled, promotions]);

    // Calculate item discounts and total summary
    const { discountedItems, totalDiscount, netTotal } = useMemo(() => {
        let discountSum = 0;

        if (appliedCoupon && couponMeetsSubtotal(appliedCoupon)) {
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

            const couponPromo = appliedCoupon && item.price >= appliedCoupon.minPurchase
                ? appliedCoupon
                : null;

            const bestPromo = (() => {
                if (!couponPromo) return bestAuto;
                if (!bestAuto) return couponPromo;
                const autoDiscount = bestAuto.discountType === 'percentage'
                    ? (item.price * bestAuto.discountValue / 100)
                    : bestAuto.discountValue;
                const couponDiscount = couponPromo.discountType === 'percentage'
                    ? (item.price * couponPromo.discountValue / 100)
                    : couponPromo.discountValue;
                return couponDiscount >= autoDiscount ? couponPromo : bestAuto;
            })();

            let finalPrice = item.price;
            let discountAmount = 0;

            if (bestPromo) {
                finalPrice = bestPromo.discountType === 'percentage'
                    ? item.price * (1 - bestPromo.discountValue / 100)
                    : Math.max(0, item.price - bestPromo.discountValue);

                discountAmount = (item.price - finalPrice) * item.quantity;
            }

            discountSum += discountAmount;

            return {
                ...item,
                finalPrice,
                discountAmountPerUnit: item.price - finalPrice,
                appliedPromo: bestPromo
            };
        });

        return {
            discountedItems: itemsWithDiscount,
            totalDiscount: discountSum,
            netTotal: totalAmount - discountSum
        };
    }, [cartItems, promotions, totalAmount, appliedCoupon]);

    const totalQuantity = useMemo(
        () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
        [cartItems]
    );

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
    }, [activeShippingOptions, netTotal, totalQuantity]);

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
            fee: storeSettings.shippingFee || 0,
            description: "",
            conditionType: "standard",
            isActive: true,
            sortOrder: 0
        }];
    }, [activeShippingOptions, automaticShippingOption, storeSettings]);

    const selectedOption = selectableShippingOptions.find(option => option.id === selectedShippingOptionId) || null;
    const selectedLocationOption = selectedOption?.conditionType === "location" ? selectedOption : null;
    const selectedShippingOption = selectedOption || (hasLocationShippingOptions ? selectableShippingOptions[0] : automaticShippingOption || selectableShippingOptions[0]) || null;

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

        const savedAddress = sessionStorage.getItem("checkout_address");
        if (savedAddress) {
            const parsed = JSON.parse(savedAddress);
            sessionStorage.setItem("checkout_address", JSON.stringify({
                ...parsed,
                address: locationAddress
            }));
        }
    }, [hasLocationShippingOptions, selectableShippingOptions, selectedShippingOptionId]);

    const handleShippingOptionChange = (optionId: string) => {
        setSelectedShippingOptionId(optionId);
        if (typeof window !== "undefined") {
            if (optionId) {
                const selectedOption = selectableShippingOptions.find(option => option.id === optionId);
                sessionStorage.setItem("selected_shipping_option", optionId);
                if (selectedOption?.conditionType === "location") {
                    const locationAddress = selectedOption.description?.trim() || selectedOption.name;
                    sessionStorage.setItem("selected_shipping_location", JSON.stringify({
                        id: selectedOption.id,
                        name: selectedOption.name,
                        address: locationAddress
                    }));

                    const savedAddress = sessionStorage.getItem("checkout_address");
                    if (savedAddress) {
                        const parsed = JSON.parse(savedAddress);
                        sessionStorage.setItem("checkout_address", JSON.stringify({
                            ...parsed,
                            address: locationAddress
                        }));
                    }
                } else {
                    sessionStorage.removeItem("selected_shipping_location");
                }
            } else {
                sessionStorage.removeItem("selected_shipping_option");
                sessionStorage.removeItem("selected_shipping_location");
            }
        }
    };

    const deliveryFee = useMemo(() => {
        if (!storeSettings || cartItems.length === 0) return 0;

        // Legacy free shipping threshold only applies when shipping rules are not configured.
        if (!storeSettings.shippingOptions?.length && storeSettings.freeShippingThreshold && storeSettings.freeShippingThreshold > 0) {
            if (netTotal >= storeSettings.freeShippingThreshold) {
                return 0;
            }
        }

        return selectedShippingOption?.fee || 0;
    }, [storeSettings, cartItems.length, netTotal, selectedShippingOption]);

    const finalTotal = netTotal + deliveryFee;

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            <main className="flex-1 overflow-y-auto pb-[500px]">
                {cartItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-80 text-gray-400 px-6">
                        <ShoppingBag size={48} className="mb-4 opacity-30" />
                        <p className="text-gray-600 font-medium">ตะกร้าว่างเปล่า</p>
                        <Link href="/" className="mt-4 px-6 py-2 bg-gray-900 text-white rounded-full font-medium text-sm hover:bg-gray-800 transition-colors">
                            เลือกซื้อสินค้า
                        </Link>
                    </div>
                ) : (
                    <div className="p-4 space-y-3">
                        {discountedItems.map(item => (
                            <div key={item.cartItemId} className="bg-white p-3 rounded-xl flex gap-3 border border-gray-100 relative overflow-hidden">

                                {/* Image */}
                                <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                    {item.imageUrl ? (
                                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                                            <ShoppingBag size={20} />
                                        </div>
                                    )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 flex flex-col justify-between min-w-0">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0 pr-6">
                                            <h3 className="font-semibold text-sm text-gray-900 truncate">{item.name}</h3>
                                            {/* Show variant info */}
                                            {item.selectedVariant && (
                                                <p className="text-xs text-gray-500 mt-0.5">
                                                    {Object.entries(item.selectedVariant.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                                                </p>
                                            )}
                                            {item.productType === "bundle" && item.bundleItems && item.bundleItems.length > 0 && (
                                                <div className="mt-1 space-y-0.5 rounded-lg bg-gray-50 px-2 py-1.5">
                                                    {item.bundleItems.map(bundleItem => (
                                                        <div key={bundleItem.id} className="text-[11px] text-gray-500">
                                                            <p>{bundleItem.productName}{bundleItem.variantName ? ` (${bundleItem.variantName})` : ""} x{bundleItem.quantity}</p>
                                                            {bundleItem.selectedAddOns && bundleItem.selectedAddOns.length > 0 && (
                                                                <div className="ml-2 mt-0.5 space-y-0.5">
                                                                    {bundleItem.selectedAddOns.map(addOn => (
                                                                        <p key={addOn.id}>
                                                                            {addOn.name}{addOn.value ? `: ${addOn.value}` : ""} {addOn.price > 0 ? `(+฿${addOn.price.toLocaleString()})` : ""}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {item.selectedAddOns && item.selectedAddOns.length > 0 && (
                                                <div className="mt-1 space-y-0.5">
                                                    {item.selectedAddOns.map(addOn => (
                                                        <p key={addOn.id} className="text-[11px] text-gray-500">
                                                            {addOn.name}{addOn.value ? `: ${addOn.value}` : ""} {addOn.price > 0 ? `(+฿${addOn.price.toLocaleString()})` : ""}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                            {item.appliedPromo && (
                                                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 text-red-600 text-[10px] font-semibold px-2 py-0.5">
                                                    ลด {item.appliedPromo.discountType === 'percentage'
                                                        ? `${item.appliedPromo.discountValue}%`
                                                        : `฿${item.appliedPromo.discountValue}`
                                                    }
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => removeFromCart(item.cartItemId)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="flex justify-between items-end mt-2">
                                        <div className="flex flex-row items-center gap-2">
                                            {item.appliedPromo ? (
                                                <>
                                                    <span className="text-xs text-gray-400 line-through">฿{item.price.toLocaleString()}</span>
                                                    <span className="font-bold text-red-600">฿{item.finalPrice.toLocaleString()}</span>
                                                </>
                                            ) : (
                                                <span className="font-bold text-gray-900">฿{item.price.toLocaleString()}</span>
                                            )}
                                        </div>

                                        {/* Quantity Controls */}
                                        <div className="flex items-center gap-2 bg-gray-100 rounded-full px-1 py-1">
                                            <button
                                                onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                                                className="w-7 h-7 flex items-center justify-center bg-white rounded-full shadow-sm text-gray-600 hover:bg-gray-50 transition-colors"
                                            >
                                                <Minus size={12} />
                                            </button>
                                            <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                                                className="w-7 h-7 flex items-center justify-center bg-gray-900 text-white rounded-full shadow-sm hover:bg-gray-800 transition-colors"
                                            >
                                                <Plus size={12} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* --- Empty space inside main is handled by pb-[500px] --- */}
                    </div>
                )}
            </main>

            {/* Summary Footer */}
            {
                cartItems.length > 0 && (
                    <div className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-100 px-4 py-4 pb-6 z-30 shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.1)]">
                        {promotionSettings.couponsEnabled && (
                            <div className="mb-3 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-700 mb-1.5">
                                    <div className="flex items-center gap-2">
                                        <Ticket size={12} className="text-orange-500" />
                                        คูปอง
                                    </div>
                                    {availableMyCoupons.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowManualInput(prev => !prev)}
                                            className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
                                        >
                                            {showManualInput ? "ซ่อนรหัส" : "กรอกรหัส"}
                                        </button>
                                    )}
                                </div>
                                {availableMyCoupons.length > 0 && (
                                    <select
                                        value={appliedCoupon?.id || ""}
                                        onChange={(e) => handleSelectCoupon(e.target.value)}
                                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                                    >
                                        <option value="">เลือกคูปองของฉัน</option>
                                        {availableMyCoupons.map(coupon => {
                                            const expired = isCouponExpired(coupon);
                                            const eligible = couponMeetsSubtotal(coupon);
                                            const suffix = expired ? " • หมดอายุ" : !eligible ? " • ยอดไม่ถึง" : "";
                                            return (
                                                <option key={coupon.id} value={coupon.id} disabled={expired || !eligible}>
                                                    {coupon.discountType === 'percentage'
                                                        ? `ลด ${coupon.discountValue}%`
                                                        : `ลด ฿${coupon.discountValue}`}{" "}
                                                    • ขั้นต่ำ ฿{coupon.minPurchase.toLocaleString()}{suffix}
                                                </option>
                                            );
                                        })}
                                    </select>
                                )}
                                {(showManualInput || availableMyCoupons.length === 0) && (
                                    <div className="mt-2 flex gap-2">
                                        <input
                                            value={couponCode}
                                            onChange={(e) => {
                                                setCouponCode(e.target.value);
                                                if (appliedCoupon) setAppliedCoupon(null);
                                                if (couponError) setCouponError("");
                                            }}
                                            placeholder="กรอกรหัสคูปอง"
                                            className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
                                        />
                                        {appliedCoupon ? (
                                            <button
                                                onClick={clearCoupon}
                                                className="px-2.5 py-1.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center gap-1"
                                            >
                                                ลบ
                                                <X size={14} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={applyCoupon}
                                                className="px-2.5 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-md hover:bg-gray-800"
                                            >
                                                ใช้คูปอง
                                            </button>
                                        )}
                                    </div>
                                )}
                                {appliedCoupon && (
                                    <div className="mt-1.5 text-[11px] text-green-600 flex items-center gap-1">
                                        <Check size={12} />
                                        ใช้คูปอง: {appliedCoupon.name}
                                    </div>
                                )}
                                {couponError && (
                                    <div className="mt-1.5 text-[11px] text-red-500">
                                        {couponError}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-2 mb-4">
                            {(automaticShippingOption || selectableShippingOptions.length > 0) && (
                                <div className="pb-3 border-b border-gray-100">
                                    <div className="mb-2 flex items-center justify-between">
                                        <label className="text-xs font-bold text-gray-900">รูปแบบการจัดส่ง</label>
                                        {automaticShippingOption && !hasLocationShippingOptions && (
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">คำนวณอัตโนมัติ</span>
                                        )}
                                    </div>
                                    <div className="space-y-2 max-h-[25vh] overflow-y-auto">
                                        {automaticShippingOption && !hasLocationShippingOptions && (
                                            <button
                                                type="button"
                                                onClick={() => handleShippingOptionChange("")}
                                                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${!selectedLocationOption
                                                    ? "border-gray-900 bg-gray-900 text-white shadow-sm"
                                                    : "border-gray-200 bg-white text-gray-700"
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Truck size={16} className="shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="truncate text-xs font-bold">{automaticShippingOption.name}</p>
                                                            <p className={`text-[11px] ${!selectedLocationOption ? "text-white/70" : "text-gray-400"}`}>ระบบเลือกจากยอด/จำนวนสินค้า</p>
                                                        </div>
                                                    </div>
                                                    <span className="shrink-0 text-sm font-bold">
                                                        {automaticShippingOption.fee === 0 ? "ฟรี" : `฿${automaticShippingOption.fee.toLocaleString()}`}
                                                    </span>
                                                </div>
                                            </button>
                                        )}
                                        {selectableShippingOptions.map(option => {
                                            const isSelected = selectedShippingOption?.id === option.id;
                                            const isLocationOption = option.conditionType === "location";
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => handleShippingOptionChange(option.id)}
                                                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${isSelected
                                                        ? "border-gray-900 bg-white ring-2 ring-gray-900/10"
                                                        : "border-gray-200 bg-white"
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-xs font-bold text-gray-900">{option.name}</p>
                                                            <p className="text-[11px] text-gray-400">{isLocationOption ? "เลือกเองเฉพาะสถานที่/รับเอง" : "จัดส่งปกติ"}</p>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-2">
                                                            <span className="text-sm font-bold text-gray-900">{option.fee === 0 ? "ฟรี" : `฿${option.fee.toLocaleString()}`}</span>
                                                            {isSelected && <Check size={16} className="text-gray-900" />}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">รวมสินค้า</span>
                                <span className="font-medium text-gray-900">฿{totalAmount.toLocaleString()}</span>
                            </div>
                            {totalDiscount > 0 && (
                                <div className="flex justify-between items-center text-sm text-red-500">
                                    <span className="flex items-center gap-1"><Megaphone size={14} /> ส่วนลดโปรโมชั่น</span>
                                    <span className="font-medium">-฿{totalDiscount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">{selectedShippingOption?.name || "ค่าจัดส่ง"}</span>
                                <span className="font-medium text-gray-900">{deliveryFee === 0 ? "ฟรี" : `฿${deliveryFee.toLocaleString()}`}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                                <span className="font-semibold text-gray-900">รวมทั้งหมด</span>
                                <span className="text-lg font-bold text-gray-900">฿{finalTotal.toLocaleString()}</span>
                            </div>
                        </div>

                        <Link
                            href="/checkout/address"
                            className="block w-full text-center bg-gray-900 text-white font-bold py-3.5 rounded-full hover:bg-gray-800 transition-colors"
                        >
                            ดำเนินการชำระเงิน
                        </Link>
                    </div>
                )
            }
        </div >
    );
}

