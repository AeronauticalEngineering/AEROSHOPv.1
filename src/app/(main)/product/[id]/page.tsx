"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductBundleItem, ProductGuide, ProductVariant, SelectedProductAddOn } from "@/types/product";
import { AlertTriangle, ChevronLeft, Image as ImageIcon, Minus, Plus, ShoppingBag, Check, Package, Megaphone, XCircle } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { useParams } from "next/navigation";
import { usePromotions } from "@/context/PromotionContext";

// Local interface removed, using context type

const formatImageUrl = (url?: string) => {
    const value = url?.trim();
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};


export default function ProductDetailPage() {
    const { id } = useParams();
    const { addToCart, totalItems } = useCart();
    const { promotions } = usePromotions(); // Use global promotions

    const [product, setProduct] = useState<Product | null>(null);
    const [productGuide, setProductGuide] = useState<ProductGuide | null>(null);
    const [bundleProducts, setBundleProducts] = useState<Record<string, Product>>({});
    const [bundleVariantSelections, setBundleVariantSelections] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [qty, setQty] = useState(1);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const touchStartX = useRef<number | null>(null);

    // Selected options state (e.g., { "สี": "แดง", "ไซส์": "M" })
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [customOptionValues, setCustomOptionValues] = useState<Record<string, string>>({});
    const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
    const [addOnValues, setAddOnValues] = useState<Record<string, string>>({});
    const [bundleSelectedAddOnIds, setBundleSelectedAddOnIds] = useState<Record<string, string[]>>({});
    const [bundleAddOnValues, setBundleAddOnValues] = useState<Record<string, Record<string, string>>>({});
    const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
    const [guidePreviewImage, setGuidePreviewImage] = useState<{ src: string; alt: string } | null>(null);

    useEffect(() => {
        if (!id) return;
        const fetchData = async () => {
            try {
                // Prepare queries
                const docRef = doc(db, "products", id as string);

                // Fetch product only
                const docSnap = await getDoc(docRef);

                // Process Product
                if (docSnap.exists()) {
                    const productData = { id: docSnap.id, ...docSnap.data() } as Product;
                    setProduct(productData);
                    setProductGuide(null);
                    setBundleProducts({});
                    setBundleVariantSelections({});
                    setBundleSelectedAddOnIds({});
                    setBundleAddOnValues({});
                    setActiveImageIndex(0);

                    if (productData.guideId) {
                        const guideSnap = await getDoc(doc(db, "product_guides", productData.guideId));
                        if (guideSnap.exists()) {
                            const guideData = { id: guideSnap.id, ...guideSnap.data() } as ProductGuide;
                            if (guideData.isActive !== false) {
                                setProductGuide(guideData);
                            }
                        }
                    }

                    // Initialize selected options
                    if (productData.hasVariants && productData.options) {
                        const initialOptions: Record<string, string> = {};
                        productData.options.forEach(opt => {
                            if (opt.values && opt.values.length > 0) {
                                initialOptions[opt.name] = opt.values[0];
                            }
                        });
                        setSelectedOptions(initialOptions);
                    }

                    if (productData.productType === "bundle" && productData.bundleItems?.length) {
                        const uniqueProductIds = Array.from(new Set(productData.bundleItems.map(item => item.productId).filter(Boolean)));
                        const childSnaps = await Promise.all(
                            uniqueProductIds.map(async (productId) => {
                                const childSnap = await getDoc(doc(db, "products", productId));
                                return childSnap.exists() ? ({ id: childSnap.id, ...childSnap.data() } as Product) : null;
                            })
                        );
                        setBundleProducts(Object.fromEntries(
                            childSnaps.filter(Boolean).map(child => [child!.id, child!])
                        ));
                    }
                }

                // Promotions are now handled by context

            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    const images = useMemo(() => {
        if (!product) return [];
        const urls = product.imageUrls?.length
            ? product.imageUrls
            : product.imageUrl
                ? [product.imageUrl]
                : [];
        return urls.filter(Boolean);
    }, [product]);

    useEffect(() => {
        if (activeImageIndex >= images.length && images.length > 0) {
            setActiveImageIndex(0);
        }
    }, [activeImageIndex, images.length]);

    const goPrevImage = () => {
        if (images.length <= 1) return;
        setActiveImageIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    const goNextImage = () => {
        if (images.length <= 1) return;
        setActiveImageIndex((prev) => (prev + 1) % images.length);
    };

    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
    };

    const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
        if (touchStartX.current === null) return;
        const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
        const delta = endX - touchStartX.current;
        const threshold = 40;
        if (Math.abs(delta) > threshold) {
            if (delta < 0) {
                goNextImage();
            } else {
                goPrevImage();
            }
        }
        touchStartX.current = null;
    };

    // Find the selected variant based on selected options
    const selectedVariant = useMemo(() => {
        if (!product?.hasVariants || !product?.variants) return null;
        if (Object.values(selectedOptions).includes("__custom__")) return null;

        return product.variants.find(variant => {
            if (!variant.attributes) return false;
            return Object.entries(selectedOptions).every(
                ([key, value]) => variant.attributes[key] === value
            );
        });
    }, [product, selectedOptions]);

    const isVariantProduct = Boolean(product?.hasVariants);
    const isBundleProduct = product?.productType === "bundle";
    const resolvedBundleItems = useMemo<ProductBundleItem[]>(() => {
        if (!product?.bundleItems?.length) return [];
        return product.bundleItems.map(item => {
            const childProduct = bundleProducts[item.productId];
            const selectedVariantId = item.variantId || bundleVariantSelections[item.id] || "";
            const selectedVariant = childProduct?.variants?.find(variant => variant.id === selectedVariantId);
            const selectedBundleAddOns = (childProduct?.addOns || [])
                .filter(addOn => addOn.isActive !== false && (bundleSelectedAddOnIds[item.id] || []).includes(addOn.id))
                .map(addOn => ({
                    id: addOn.id,
                    name: addOn.name,
                    price: addOn.price,
                    value: (bundleAddOnValues[item.id]?.[addOn.id] || "").trim()
                }));
            return {
                ...item,
                variantId: selectedVariant?.id || item.variantId || "",
                variantName: selectedVariant?.name || item.variantName || "",
                unitPrice: selectedVariant?.price ?? item.unitPrice,
                selectedAddOns: selectedBundleAddOns
            };
        });
    }, [bundleAddOnValues, bundleProducts, bundleSelectedAddOnIds, bundleVariantSelections, product]);
    const bundleSelectionMissing = Boolean(isBundleProduct && product?.bundleItems?.some(item => {
        const childProduct = bundleProducts[item.productId];
        return childProduct?.hasVariants && !item.variantId && !bundleVariantSelections[item.id];
    }));
    const bundleAvailableStock = useMemo(() => {
        if (!isBundleProduct || !product?.bundleItems?.length || bundleSelectionMissing) return product?.stock || 0;
        return Math.min(...product.bundleItems.map(item => {
            const childProduct = bundleProducts[item.productId];
            if (!childProduct) return 0;
            const selectedVariantId = item.variantId || bundleVariantSelections[item.id] || "";
            const selectedVariant = childProduct.variants?.find(variant => variant.id === selectedVariantId);
            const stock = childProduct.hasVariants ? selectedVariant?.stock || 0 : childProduct.stock || 0;
            return Math.floor(stock / Math.max(1, Number(item.quantity) || 1));
        }));
    }, [bundleProducts, bundleSelectionMissing, bundleVariantSelections, isBundleProduct, product]);
    const hasCustomSelection = Object.values(selectedOptions).includes("__custom__");
    const customSelectionComplete = !product?.options?.some(
        option => selectedOptions[option.name] === "__custom__" && !customOptionValues[option.name]?.trim()
    );
    const isVariantSelectionMissing = isVariantProduct && !selectedVariant && (!hasCustomSelection || !customSelectionComplete);
    const customVariant = useMemo<ProductVariant | null>(() => {
        if (!product || !hasCustomSelection || !customSelectionComplete) return null;
        const attributes = Object.fromEntries(
            Object.entries(selectedOptions).map(([key, value]) => [
                key,
                value === "__custom__" ? (customOptionValues[key] || "").trim() : value
            ])
        );

        return {
            id: `custom-${encodeURIComponent(JSON.stringify(attributes))}`,
            name: Object.values(attributes).join(" / "),
            price: product.price,
            stock: product.stock,
            attributes
        };
    }, [customOptionValues, customSelectionComplete, hasCustomSelection, product, selectedOptions]);

    // Get current price and stock
    const activeVariant = selectedVariant || customVariant;
    const basePrice = activeVariant?.price ?? product?.price ?? 0;
    const bundleAddOnsComplete = !isBundleProduct || (product?.bundleItems || []).every(item => {
        const childProduct = bundleProducts[item.productId];
        const selectedIds = bundleSelectedAddOnIds[item.id] || [];
        return (childProduct?.addOns || []).every(addOn =>
            !selectedIds.includes(addOn.id) || !addOn.required || Boolean(bundleAddOnValues[item.id]?.[addOn.id]?.trim())
        );
    });
    const currentStock = isBundleProduct
        ? bundleAvailableStock
        : activeVariant?.stock ?? (isVariantProduct ? 0 : product?.stock ?? 0);
    const isOutOfStock = currentStock === 0;
    const canPurchase = Boolean(product) && !isVariantSelectionMissing && !bundleSelectionMissing && bundleAddOnsComplete && currentStock > 0 && qty <= currentStock;
    const stockStatusLabel = hasCustomSelection
        ? customSelectionComplete
            ? "ตัวเลือกกำหนดเอง"
            : "กรอกตัวเลือกให้ครบ"
        : bundleSelectionMissing
            ? "เลือกตัวเลือกในเซตให้ครบ"
        : isVariantSelectionMissing
            ? "ไม่มีตัวเลือกนี้"
            : isOutOfStock
                ? "สินค้าหมด"
                : `เหลือ ${currentStock} ชิ้น`;
    const stockStatusClass = hasCustomSelection
        ? "bg-amber-50 text-amber-700"
        : isOutOfStock || isVariantSelectionMissing
            ? "bg-red-50 text-red-600"
            : "bg-green-50 text-green-600";

    useEffect(() => {
        if (currentStock <= 0) {
            setQty(1);
            return;
        }
        setQty(prev => Math.min(Math.max(1, prev), currentStock));
    }, [currentStock]);

    // Calculate Automatic Discount (Flash Sale / Auto)
    const bestAutoPromo = useMemo(() => {
        if (!promotions.length || basePrice === 0) return null;

        return promotions
            .filter(p => p.type === 'auto' && basePrice >= p.minPurchase)
            .sort((a, b) => {
                const discountA = a.discountType === 'percentage'
                    ? (basePrice * a.discountValue / 100)
                    : a.discountValue;
                const discountB = b.discountType === 'percentage'
                    ? (basePrice * b.discountValue / 100)
                    : b.discountValue;
                return discountB - discountA;
            })[0];
    }, [promotions, basePrice]);

    const finalPrice = bestAutoPromo
        ? (bestAutoPromo.discountType === 'percentage'
            ? basePrice * (1 - bestAutoPromo.discountValue / 100)
            : Math.max(0, basePrice - bestAutoPromo.discountValue))
        : basePrice;

    const hasDiscount = bestAutoPromo && finalPrice < basePrice;
    const activeAddOns = useMemo(
        () => (product?.addOns || []).filter(addOn => addOn.isActive !== false),
        [product]
    );
    const selectedAddOns = useMemo<SelectedProductAddOn[]>(() => {
        return activeAddOns
            .filter(addOn => selectedAddOnIds.includes(addOn.id))
            .map(addOn => ({
                id: addOn.id,
                name: addOn.name,
                price: addOn.price,
                value: (addOnValues[addOn.id] || "").trim()
            }));
    }, [activeAddOns, addOnValues, selectedAddOnIds]);
    const addOnTotal = selectedAddOns.reduce((sum, addOn) => sum + addOn.price, 0);
    const addOnsComplete = activeAddOns.every(addOn =>
        !selectedAddOnIds.includes(addOn.id) || !addOn.required || Boolean(addOnValues[addOn.id]?.trim())
    );
    const bundleAddOnTotal = resolvedBundleItems.reduce((sum, item) =>
        sum + ((item.selectedAddOns || []).reduce((itemSum, addOn) => itemSum + addOn.price, 0) * item.quantity),
        0
    );
    const totalUnitPrice = finalPrice + addOnTotal + bundleAddOnTotal;
    const effectiveGuide = useMemo(() => {
        if (productGuide) {
            return {
                title: productGuide.title,
                text: productGuide.text || "",
                imageBase64: productGuide.imageBase64 || "",
                imageUrl: productGuide.imageUrl || "",
                imageName: productGuide.imageName || ""
            };
        }
        if (!product?.guideText?.trim() && !product?.guideImageBase64) return null;
        return {
            title: product.guideTitle || "คำแนะนำสินค้า",
            text: product.guideText || "",
            imageBase64: product.guideImageBase64 || "",
            imageUrl: "",
            imageName: product.guideImageName || ""
        };
    }, [product, productGuide]);
    const effectiveGuideImageSrc = effectiveGuide?.imageBase64 || formatImageUrl(effectiveGuide?.imageUrl);
    const hasProductGuide = Boolean(effectiveGuide?.text?.trim() || effectiveGuideImageSrc);

    const handleOptionSelect = (optionName: string, value: string) => {
        setSelectedOptions(prev => ({
            ...prev,
            [optionName]: value
        }));
    };

    const handleCustomOptionChange = (optionName: string, value: string) => {
        setCustomOptionValues(prev => ({
            ...prev,
            [optionName]: value
        }));
    };

    const toggleAddOn = (addOnId: string) => {
        setSelectedAddOnIds(prev =>
            prev.includes(addOnId)
                ? prev.filter(id => id !== addOnId)
                : [...prev, addOnId]
        );
    };

    const handleAddOnValueChange = (addOnId: string, value: string) => {
        setAddOnValues(prev => ({ ...prev, [addOnId]: value }));
    };

    const handleBundleVariantSelect = (bundleItemId: string, variantId: string) => {
        setBundleVariantSelections(prev => ({
            ...prev,
            [bundleItemId]: variantId
        }));
    };

    const toggleBundleAddOn = (bundleItemId: string, addOnId: string) => {
        setBundleSelectedAddOnIds(prev => {
            const currentIds = prev[bundleItemId] || [];
            return {
                ...prev,
                [bundleItemId]: currentIds.includes(addOnId)
                    ? currentIds.filter(id => id !== addOnId)
                    : [...currentIds, addOnId]
            };
        });
    };

    const handleBundleAddOnValueChange = (bundleItemId: string, addOnId: string, value: string) => {
        setBundleAddOnValues(prev => ({
            ...prev,
            [bundleItemId]: {
                ...(prev[bundleItemId] || {}),
                [addOnId]: value
            }
        }));
    };

    const handleAddToCart = () => {
        if (!product || !canPurchase || !addOnsComplete || !bundleAddOnsComplete) return;
        const productForCart: Product = isBundleProduct
            ? { ...product, price: totalUnitPrice, bundleItems: resolvedBundleItems }
            : product;
        for (let i = 0; i < qty; i++) {
            addToCart(productForCart, activeVariant || undefined, selectedAddOns);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
                <span className="text-sm text-gray-500">กำลังโหลด...</span>
            </div>
        </div>
    );

    if (!product) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
            <Package size={48} className="text-gray-300 mb-4" />
            <p className="text-gray-600 font-medium">ไม่พบสินค้า</p>
            <Link href="/" className="mt-4 text-sm text-blue-600 hover:underline">กลับหน้าหลัก</Link>
        </div>
    );

    return (
        <div className="flex flex-col min-h-screen bg-white">
            <main className="flex-1 pb-28">
                {/* Product Image */}
                <div
                    className="w-full aspect-square bg-gray-50 flex items-center justify-center relative overflow-hidden"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    {images.length > 0 ? (
                        <div
                            className="absolute inset-0 flex transition-transform duration-300 ease-out"
                            style={{ transform: `translateX(-${Math.min(activeImageIndex, images.length - 1) * 100}%)` }}
                        >
                            {images.map((url, index) => (
                                <img
                                    key={`${url}-${index}`}
                                    src={url}
                                    alt={product.name}
                                    className="w-full h-full object-cover flex-shrink-0"
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center text-gray-300">
                            <Package size={64} className="opacity-30" />
                        </div>
                    )}

                    {/* Discount Badge */}
                    {hasDiscount && (
                        <div className="absolute top-4 right-4 bg-red-500 text-white text-sm font-bold px-3 py-1.5 rounded-xl shadow-lg flex items-center gap-1.5 animate-bounce-slow">
                            <Megaphone size={16} className="fill-white" />
                            <span>
                                ลด {bestAutoPromo?.discountType === 'percentage'
                                    ? `${bestAutoPromo.discountValue}%`
                                    : `฿${bestAutoPromo?.discountValue}`
                                }
                            </span>
                        </div>
                    )}

                    {images.length > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={goPrevImage}
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 border border-white/80 text-gray-700 hover:bg-white transition-colors flex items-center justify-center shadow-sm"
                                aria-label="Previous image"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <button
                                type="button"
                                onClick={goNextImage}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 border border-white/80 text-gray-700 hover:bg-white transition-colors flex items-center justify-center shadow-sm"
                                aria-label="Next image"
                            >
                                <ChevronLeft size={18} className="rotate-180" />
                            </button>
                        </>
                    )}

                    {images.length > 1 && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                            <div className="flex gap-2 overflow-x-auto scrollbar-hide  backdrop-blur px-2.5 py-2 ">
                                {images.map((url, index) => {
                                    const isActive = index === activeImageIndex;
                                    return (
                                        <button
                                            key={`${url}-${index}`}
                                            type="button"
                                            onClick={() => setActiveImageIndex(index)}
                                            className={`flex-shrink-0 w-12 h-12 rounded-md border overflow-hidden transition-all ${isActive ? 'border-gray-900 ring-2 ring-gray-900/10' : 'border-gray-200'}`}
                                        >
                                            <img src={url} alt="" className="w-full h-full object-cover" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="px-5 py-5">
                    {/* Category & Name */}
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{product.category}</span>
                            <h2 className="text-xl font-bold text-gray-900 mt-1 leading-tight">{product.name}</h2>
                        </div>
                        {hasProductGuide && (
                            <button
                                type="button"
                                onClick={() => setIsGuideModalOpen(true)}
                                className="mt-1 inline-flex max-w-[150px] shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-700 shadow-sm hover:bg-sky-100"
                                aria-label="ดูคำแนะนำสินค้า"
                            >
                                {effectiveGuideImageSrc ? <ImageIcon size={14} /> : <AlertTriangle size={14} />}
                                <span className="truncate">{effectiveGuide?.title || "คำแนะนำ"}</span>
                            </button>
                        )}
                    </div>

                    {/* Price & Stock */}
                    <div className="mb-5">
                        <div className="flex items-baseline gap-3">
                            {hasDiscount ? (
                                <>
                                    <span className="text-3xl font-bold text-red-600">฿{finalPrice.toLocaleString()}</span>
                                    <span className="text-lg text-gray-400 line-through">฿{basePrice.toLocaleString()}</span>
                                </>
                            ) : (
                                <span className="text-2xl font-bold text-gray-900">฿{basePrice.toLocaleString()}</span>
                            )}
                        </div>

                        {/* Stock & Promo Description */}
                        <div className="flex items-center gap-3 mt-2">
                            {product.hasVariants && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stockStatusClass}`}>
                                    {stockStatusLabel}
                                </span>
                            )}
                            {hasDiscount && (
                                <span className="text-xs text-red-500 flex items-center gap-1">
                                    <Megaphone size={12} />
                                    {bestAutoPromo?.name}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Options Selection */}
                    {product.hasVariants && product.options && product.options.length > 0 && (
                        <div className="space-y-5 mb-6">
                            {product.options.map(option => (
                                <div key={option.id}>
                                    <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 block">
                                        {option.name}
                                        {selectedOptions[option.name] && (
                                            <span className="ml-2 text-gray-400 normal-case font-normal">
                                                : {selectedOptions[option.name] === "__custom__"
                                                    ? customOptionValues[option.name]?.trim() || "กำหนดเอง"
                                                    : selectedOptions[option.name]}
                                            </span>
                                        )}
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {option.values.map(value => {
                                            const isSelected = selectedOptions[option.name] === value;
                                            return (
                                                <button
                                                    key={value}
                                                    onClick={() => handleOptionSelect(option.name, value)}
                                                    className={`
                                                        px-4 py-2 rounded-lg text-sm font-medium transition-all
                                                        ${isSelected
                                                            ? 'bg-gray-900 text-white shadow-md'
                                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                        }
                                                    `}
                                                >
                                                    {isSelected && <Check size={14} className="inline mr-1.5 -mt-0.5" />}
                                                    {value}
                                                </button>
                                            );
                                        })}
                                        {option.allowCustom && (
                                            <button
                                                type="button"
                                                onClick={() => handleOptionSelect(option.name, "__custom__")}
                                                className={`
                                                    px-4 py-2 rounded-lg text-sm font-medium transition-all
                                                    ${selectedOptions[option.name] === "__custom__"
                                                        ? 'bg-gray-900 text-white shadow-md'
                                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                    }
                                                `}
                                            >
                                                {selectedOptions[option.name] === "__custom__" && <Check size={14} className="inline mr-1.5 -mt-0.5" />}
                                                กำหนดเอง
                                            </button>
                                        )}
                                    </div>
                                    {option.allowCustom && selectedOptions[option.name] === "__custom__" && (
                                        <input
                                            type="text"
                                            value={customOptionValues[option.name] || ""}
                                            onChange={(event) => handleCustomOptionChange(option.name, event.target.value)}
                                            placeholder={`โปรดระบุข้อมูลเพิมเติม`}
                                            className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quantity Selector */}
                    <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div>
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">จำนวน</p>
                            <p className="mt-0.5 text-xs text-gray-400">{stockStatusLabel}</p>
                        </div>
                        <div className="flex items-center gap-3 rounded-full bg-white px-3 h-12 shadow-sm">
                            <button
                                type="button"
                                onClick={() => setQty(Math.max(1, qty - 1))}
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                                aria-label="ลดจำนวน"
                            >
                                <Minus size={16} />
                            </button>
                            <span className="w-7 text-center font-bold text-gray-900">{qty}</span>
                            <button
                                type="button"
                                onClick={() => setQty(Math.min(currentStock || 99, qty + 1))}
                                disabled={currentStock <= 0 || qty >= currentStock}
                                className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-30"
                                aria-label="เพิ่มจำนวน"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Add-ons */}
                    {activeAddOns.length > 0 && (
                        <div className="space-y-3 mb-6">
                            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">บริการเสริม</h3>
                            {activeAddOns.map(addOn => {
                                const isSelected = selectedAddOnIds.includes(addOn.id);
                                const maxLength = addOn.maxLength && addOn.maxLength > 0 ? addOn.maxLength : undefined;

                                return (
                                    <div key={addOn.id} className={`rounded-xl border p-3 transition-all ${isSelected ? "border-gray-900 bg-white" : "border-gray-100 bg-gray-50"}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleAddOn(addOn.id)}
                                            className="flex w-full items-center justify-between gap-3 text-left"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900">{addOn.name}</p>
                                                <p className="text-xs text-gray-400">{addOn.price > 0 ? `+฿${addOn.price.toLocaleString()}` : "ฟรี"}</p>
                                            </div>
                                            <div className={`h-6 w-6 rounded-full border flex items-center justify-center ${isSelected ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-200 text-transparent"}`}>
                                                <Check size={14} />
                                            </div>
                                        </button>
                                        {isSelected && (
                                            <div className="mt-3">
                                                <label className="mb-1 block text-xs font-semibold text-gray-500">
                                                    {addOn.inputLabel || "รายละเอียด"}
                                                    {addOn.required && <span className="text-red-500"> *</span>}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={addOnValues[addOn.id] || ""}
                                                    maxLength={maxLength}
                                                    onChange={(event) => handleAddOnValueChange(addOn.id, event.target.value)}
                                                    placeholder={addOn.placeholder || "กรอกรายละเอียด"}
                                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
                                                />
                                                {maxLength && (
                                                    <p className="mt-1 text-right text-[11px] text-gray-400">
                                                        {(addOnValues[addOn.id] || "").length}/{maxLength}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Description */}
                    {isBundleProduct && product.bundleItems && product.bundleItems.length > 0 && (
                        <div className="pt-5 border-t border-gray-100">
                            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">สินค้าในเซต</h3>
                            <div className="space-y-2">
                                {product.bundleItems.map((item) => {
                                    const childProduct = bundleProducts[item.productId];
                                    const selectedVariantId = item.variantId || bundleVariantSelections[item.id] || "";
                                    return (
                                    <div key={item.id} className="rounded-xl bg-gray-50 px-3 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900">{item.productName}</p>
                                                {item.variantName && (
                                                    <p className="mt-0.5 text-xs text-gray-500">{item.variantName}</p>
                                                )}
                                            </div>
                                            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-gray-700">
                                                x {qty.toLocaleString()}
                                            </span>
                                        </div>
                                        {childProduct?.hasVariants && !item.variantId && (
                                            <div className="mt-3">
                                                <label className="mb-1 block text-xs font-semibold text-gray-500">
                                                    เลือกตัวเลือก
                                                </label>
                                                <select
                                                    value={selectedVariantId}
                                                    onChange={(event) => handleBundleVariantSelect(item.id, event.target.value)}
                                                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                                                >
                                                    <option value="">เลือกตัวเลือก</option>
                                                    {(childProduct.variants || []).map((variant) => (
                                                        <option key={variant.id} value={variant.id}>
                                                            {variant.name} · เหลือ {variant.stock} ชิ้น
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        {childProduct?.addOns && childProduct.addOns.filter(addOn => addOn.isActive !== false).length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                <p className="text-xs font-semibold text-gray-500">บริการเสริม</p>
                                                {childProduct.addOns
                                                    .filter(addOn => addOn.isActive !== false)
                                                    .map(addOn => {
                                                        const selectedIds = bundleSelectedAddOnIds[item.id] || [];
                                                        const isSelected = selectedIds.includes(addOn.id);
                                                        const maxLength = addOn.maxLength && addOn.maxLength > 0 ? addOn.maxLength : undefined;
                                                        return (
                                                            <div key={addOn.id} className={`rounded-lg border p-2 ${isSelected ? "border-gray-900 bg-white" : "border-gray-200 bg-white/70"}`}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleBundleAddOn(item.id, addOn.id)}
                                                                    className="flex w-full items-center justify-between gap-2 text-left"
                                                                >
                                                                    <div className="min-w-0">
                                                                        <p className="text-xs font-bold text-gray-900">{addOn.name}</p>
                                                                        <p className="text-[11px] text-gray-400">{addOn.price > 0 ? `+฿${addOn.price.toLocaleString()}` : "ฟรี"}</p>
                                                                    </div>
                                                                    <div className={`h-5 w-5 rounded-full border flex items-center justify-center ${isSelected ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-200 text-transparent"}`}>
                                                                        <Check size={12} />
                                                                    </div>
                                                                </button>
                                                                {isSelected && (
                                                                    <div className="mt-2">
                                                                        <label className="mb-1 block text-[11px] font-semibold text-gray-500">
                                                                            {addOn.inputLabel || "รายละเอียด"}
                                                                            {addOn.required && <span className="text-red-500"> *</span>}
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            value={bundleAddOnValues[item.id]?.[addOn.id] || ""}
                                                                            maxLength={maxLength}
                                                                            onChange={(event) => handleBundleAddOnValueChange(item.id, addOn.id, event.target.value)}
                                                                            placeholder={addOn.placeholder || "กรอกรายละเอียด"}
                                                                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 outline-none focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-100"
                                                                        />
                                                                        {maxLength && (
                                                                            <p className="mt-1 text-right text-[10px] text-gray-400">
                                                                                {(bundleAddOnValues[item.id]?.[addOn.id] || "").length}/{maxLength}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    {product.description && (
                        <div className="pt-5 border-t border-gray-100">
                            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">รายละเอียด</h3>
                            <p className="whitespace-pre-line text-sm text-gray-600 leading-relaxed">{product.description}</p>
                        </div>
                    )}
                </div>
            </main>

            {isGuideModalOpen && hasProductGuide && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
                    <div className="w-full rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
                        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">{effectiveGuide?.title || "คำแนะนำสินค้า"}</h3>
                                <p className="mt-0.5 text-[11px] text-gray-400">{product.name}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsGuideModalOpen(false)}
                                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            >
                                <XCircle size={22} />
                            </button>
                        </div>
                        <div className="max-h-[72vh] overflow-y-auto bg-slate-50 p-4">
                            {effectiveGuideImageSrc && (
                                <button
                                    type="button"
                                    onClick={() => setGuidePreviewImage({
                                        src: effectiveGuideImageSrc,
                                        alt: effectiveGuide?.imageName || effectiveGuide?.title || product.name
                                    })}
                                    className="mb-3 block w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
                                >
                                    <img src={effectiveGuideImageSrc} alt={effectiveGuide?.imageName || "รูปคำแนะนำสินค้า"} className="max-h-80 w-full object-contain" />
                                </button>
                            )}
                            {effectiveGuide?.text?.trim() && (
                                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sky-950">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-sky-600" />
                                        <p className="whitespace-pre-line text-xs leading-6 text-sky-800">{effectiveGuide.text}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {guidePreviewImage && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
                    onClick={() => setGuidePreviewImage(null)}
                >
                    <button
                        type="button"
                        onClick={() => setGuidePreviewImage(null)}
                        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20"
                        aria-label="ปิดรูป"
                    >
                        <XCircle size={24} />
                    </button>
                    <img
                        src={guidePreviewImage.src}
                        alt={guidePreviewImage.alt}
                        onClick={(event) => event.stopPropagation()}
                        className="max-h-[84vh] max-w-full rounded-xl bg-white object-contain shadow-2xl"
                    />
                </div>
            )}

            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-100 px-4 py-3 pb-6 z-30">
                <div className="grid grid-cols-2 items-center gap-3">
                    {/* Add To Cart Button */}
                    <button
                        onClick={handleAddToCart}
                        disabled={!canPurchase || !addOnsComplete || !bundleAddOnsComplete}
                        className={`
                            h-12 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]
                            ${!canPurchase || !addOnsComplete || !bundleAddOnsComplete
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-900 text-white hover:bg-gray-800 shadow-lg shadow-gray-900/20'
                            }
                        `}
                    >
                        {!addOnsComplete || !bundleAddOnsComplete ? 'กรอกบริการเสริมให้ครบ' : bundleSelectionMissing ? 'เลือกตัวเลือกในเซต' : isVariantSelectionMissing ? 'ไม่มีตัวเลือกนี้' : isOutOfStock ? 'สินค้าหมด' : `เพิ่มไปยังตะกร้า • ฿${(totalUnitPrice * qty).toLocaleString()}`}
                    </button>

                    {/* Cart Button */}
                    <Link href="/cart" className="relative h-12 rounded-full bg-gray-100 text-gray-900 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 font-bold text-sm">
                        <ShoppingBag size={18} />
                        <span>ตะกร้า</span>
                        {totalItems > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center border-2 border-white">
                                {totalItems > 9 ? '9+' : totalItems}
                            </span>
                        )}
                    </Link>
                </div>
            </div>
        </div>
    );
}
