"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { collection, query, where, getDocs, orderBy, limit, startAfter, QueryDocumentSnapshot, onSnapshot, QueryConstraint, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product } from "@/types/product";
import { ProductCategory } from "@/types/category";
import Link from "next/link";
import { Search, ShoppingBag, Package, User, Ticket, Megaphone, Check, Bell, AlertTriangle, Image as ImageIcon, XCircle, ClipboardList } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Promotion, usePromotions } from "@/context/PromotionContext";
import { useCoupons } from "@/hooks/useCoupons";
import { fetchProductBase64Images, getPrimaryProductImage } from "@/lib/productImages";
import { getProductDisplayStock } from "@/lib/productStock";

const formatImageUrl = (url?: string) => {
    const value = url?.trim();
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const toDate = (value: Promotion["startDate"] | Promotion["endDate"]) => {
    if (value instanceof Date) return value;
    if (typeof value === "object" && "toDate" in value) return value.toDate();
    return new Date(value);
};

type PendingOrderAlert = {
    id: string;
    totalAmount: number;
};

const ALL_CATEGORY = "ทั้งหมด";

export default function ShopHome() {
    const [products, setProducts] = useState<Product[]>([]);
    const [productBase64Images, setProductBase64Images] = useState<Record<string, string[]>>({});
    const [bundleProducts, setBundleProducts] = useState<Record<string, Product>>({});
    const [categoryDocs, setCategoryDocs] = useState<ProductCategory[]>([]);
    const { promotions } = usePromotions();
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryPreviewImage, setCategoryPreviewImage] = useState<{ src: string; alt: string } | null>(null);
    const { myCoupons, collectCoupon } = useCoupons({ includeUsed: true });

    // Pagination State
    const lastVisibleRef = useRef<QueryDocumentSnapshot | null>(null);
    const fetchRequestIdRef = useRef(0);
    const isFetchingMoreRef = useRef(false);
    const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const PRODUCTS_PER_PAGE = 10;
    const { totalItems } = useCart();
    const { userProfile, loading: authLoading } = useAuth();
    const [pendingOrders, setPendingOrders] = useState<PendingOrderAlert[]>([]);

    const fetchProducts = useCallback(async (isLoadMore = false, category = selectedCategory) => {
        if (isLoadMore && isFetchingMoreRef.current) return;

        const requestId = ++fetchRequestIdRef.current;
        try {
            if (isLoadMore) {
                isFetchingMoreRef.current = true;
                setIsFetchingMore(true);
            }
            else {
                setLoading(true);
                setProducts([]);
                lastVisibleRef.current = null;
            }

            const constraints: QueryConstraint[] = [
                where("isActive", "==", true)
            ];

            if (category !== ALL_CATEGORY) {
                constraints.push(where("category", "==", category));
            }

            constraints.push(orderBy("updatedAt", "desc"));

            if (isLoadMore && lastVisibleRef.current) {
                constraints.push(startAfter(lastVisibleRef.current));
            }

            constraints.push(limit(PRODUCTS_PER_PAGE));

            const productsQuery = query(collection(db, "products"), ...constraints);
            const documentSnapshots = await getDocs(productsQuery);
            if (requestId !== fetchRequestIdRef.current) return;

            if (!documentSnapshots.empty) {
                const newProducts = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];

                const nextLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
                lastVisibleRef.current = nextLastVisible;

                if (isLoadMore) {
                    setProducts(prev => [...prev, ...newProducts]);
                } else {
                    setProducts(newProducts);
                }

                if (documentSnapshots.docs.length < PRODUCTS_PER_PAGE) {
                    setHasMore(false);
                } else {
                    setHasMore(true);
                }
            } else {
                lastVisibleRef.current = null;
                setHasMore(false);
                if (!isLoadMore) {
                    setProducts([]);
                }
            }

        } catch (error) {
            console.error("Error fetching products:", error);
        } finally {
            if (isLoadMore) {
                isFetchingMoreRef.current = false;
            }

            if (requestId === fetchRequestIdRef.current) {
                setLoading(false);
                setIsFetchingMore(false);
            }
        }
    }, [selectedCategory]);

    useEffect(() => {
        fetchProducts(false, selectedCategory);
    }, [fetchProducts, selectedCategory]);

    useEffect(() => {
        const trigger = loadMoreTriggerRef.current;
        if (!trigger || loading || isFetchingMore || !hasMore || searchTerm) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    fetchProducts(true, selectedCategory);
                }
            },
            { rootMargin: "320px 0px" }
        );

        observer.observe(trigger);

        return () => observer.disconnect();
    }, [fetchProducts, hasMore, isFetchingMore, loading, searchTerm, selectedCategory]);

    useEffect(() => {
        let isCancelled = false;
        const loadBase64Images = async () => {
            const productsWithBase64 = products.filter((product) => product.imageBase64Ids?.length);
            if (productsWithBase64.length === 0) {
                setProductBase64Images({});
                return;
            }

            const entries = await Promise.all(
                productsWithBase64.map(async (product) => [
                    product.id,
                    await fetchProductBase64Images(product)
                ] as const)
            );

            if (!isCancelled) {
                setProductBase64Images(Object.fromEntries(entries));
            }
        };

        loadBase64Images().catch((error) => {
            console.error("Error loading product base64 images:", error);
        });

        return () => {
            isCancelled = true;
        };
    }, [products]);

    useEffect(() => {
        let isCancelled = false;
        const loadBundleProducts = async () => {
            const productIds = Array.from(new Set(
                products
                    .filter((product) => product.productType === "bundle")
                    .flatMap((product) => product.bundleItems?.map((item) => item.productId).filter(Boolean) || [])
            ));
            const missingProductIds = productIds.filter((productId) => !bundleProducts[productId]);
            if (missingProductIds.length === 0) return;

            const childProducts = await Promise.all(
                missingProductIds.map(async (productId) => {
                    const childSnap = await getDoc(doc(db, "products", productId));
                    return childSnap.exists() ? ({ id: childSnap.id, ...childSnap.data() } as Product) : null;
                })
            );

            if (!isCancelled) {
                setBundleProducts((prev) => ({
                    ...prev,
                    ...Object.fromEntries(childProducts.filter(Boolean).map((product) => [product!.id, product!]))
                }));
            }
        };

        loadBundleProducts().catch((error) => {
            console.error("Error loading bundle products:", error);
        });

        return () => {
            isCancelled = true;
        };
    }, [bundleProducts, products]);

    useEffect(() => {
        const q = query(
            collection(db, "categories"),
            orderBy("sortOrder", "asc"),
            orderBy("name", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            })) as ProductCategory[];
            setCategoryDocs(items.filter((category) => category.isActive !== false));
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const customerId = userProfile?.lineId || userProfile?.uid || userProfile?.id;
        if (!customerId) return;

        const pendingQuery = query(
            collection(db, "orders"),
            where("customerId", "==", customerId),
            where("status", "==", "pending")
        );

        const unsubscribe = onSnapshot(
            pendingQuery,
            (snapshot) => {
                setPendingOrders(snapshot.docs.map((doc) => ({
                    id: doc.id,
                    totalAmount: Number(doc.data().totalAmount || 0)
                })));
            },
            (error) => {
                console.error("Error fetching pending orders:", error);
                setPendingOrders([]);
            }
        );

        return () => unsubscribe();
    }, [userProfile]);

    const handleCollectCoupon = async (promo: Promotion) => {
        const success = await collectCoupon(promo);
        if (success && promo.code) {
            navigator.clipboard.writeText(promo.code);
        }
    };

    const categories = useMemo(() => {
        const savedCategories = categoryDocs.map((category) => category.name).filter(Boolean);
        const productCategories = products.map(p => p.category).filter(Boolean);
        return [ALL_CATEGORY, ...Array.from(new Set([...savedCategories, ...productCategories]))];
    }, [categoryDocs, products]);

    const selectedCategoryNotice = useMemo(() => {
        if (selectedCategory === ALL_CATEGORY) return null;
        const category = categoryDocs.find((item) => item.name === selectedCategory);
        if (!category?.noticeText?.trim() && !category?.noticeImageBase64 && !category?.noticeImageUrl?.trim()) return null;
        return category;
    }, [categoryDocs, selectedCategory]);
    const selectedCategoryNoticeImageSrc = selectedCategoryNotice
        ? selectedCategoryNotice.noticeImageBase64 || formatImageUrl(selectedCategoryNotice.noticeImageUrl)
        : "";


    // Filter products
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchCategory = selectedCategory === ALL_CATEGORY || p.category === selectedCategory;
            const matchSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase());
            return matchCategory && matchSearch;
        });
    }, [products, selectedCategory, searchTerm]);

    // Get user display info
    const userPic = userProfile?.pictureUrl || userProfile?.photoURL;
    const userName = userProfile?.displayName || userProfile?.name || 'คุณลูกค้า';
    const pendingTotal = pendingOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const pendingHref = pendingOrders.length === 1 ? `/myorder/${pendingOrders[0].id}` : "/myorder";

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            {/* Header */}
            <header className="relative z-20 overflow-hidden bg-gradient-to-br from-emerald-100 via-cyan-100 to-blue-200">
                <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 bg-sky-200/50 rounded-full blur-2xl" />
                <div className="relative p-4">
                    <div className="flex items-center justify-between">
                        <Link href="/profile" className="flex items-center gap-2.5">
                            {authLoading ? (
                                <>
                                    <div className="w-9 h-9 rounded-full bg-white/70 animate-pulse border border-white/80" />
                                    <div className="flex flex-col gap-1.5">
                                        <div className="w-12 h-2 bg-white/70 rounded animate-pulse" />
                                        <div className="w-20 h-3 bg-white/70 rounded animate-pulse" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    {userPic ? (
                                        <img
                                            src={userPic}
                                            alt={userName}
                                            className="w-9 h-9 rounded-full object-cover border border-white/80"
                                        />
                                    ) : (
                                        <div className="w-9 h-9 bg-white/70 rounded-full flex items-center justify-center border border-white/80">
                                            <User size={18} className="text-gray-500" />
                                        </div>
                                    )}
                                    <div className="sm:block">
                                        <p className="text-[10px] text-gray-500 leading-none">สวัสดี</p>
                                        <p className="text-sm font-semibold text-gray-900 leading-tight">{userName}</p>
  
                                    </div>
                                </>
                            )}
                        </Link>

                        <div className="flex items-center gap-2">
                            {pendingOrders.length > 0 && (
                                <Link
                                    href={pendingHref}
                                    className="flex h-9 max-w-[142px] items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 text-amber-800 shadow-sm"
                                >
                                    <Bell size={15} className="shrink-0" />
                                    <div className="min-w-0 leading-none">
                                        <p className="truncate text-[10px] font-bold">รอชำระ</p>
                                        <p className="truncate text-[9px] text-amber-700/80">
                                            {pendingOrders.length} รายการ · ฿{pendingTotal.toLocaleString()}
                                        </p>
                                    </div>
                                </Link>
                            )}

                            <Link href="/myorder" className="w-9 h-9 rounded-full bg-white/80 border border-white/80 text-gray-700 hover:bg-white transition-colors flex items-center justify-center">
                                <ClipboardList size={18} />
                            </Link>

                            <Link href="/cart" className="w-9 h-9 rounded-full bg-white/80 border border-white/80 text-gray-700 hover:bg-white transition-colors flex items-center justify-center relative">
                                <ShoppingBag size={18} />
                                {totalItems > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center border-2 border-white">
                                        {totalItems > 9 ? '9+' : totalItems}
                                    </span>
                                )}
                            </Link>
                        </div>
                    </div>
               

                    <div className="mt-4 space-y-4">
                        <div className="relative z-10">
                            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="ค้นหาสินค้า..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300/60 transition-all"
                            />
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                            {categories.map((cat) => {
                                const active = selectedCategory === cat;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`rounded-full border px-4 py-2 text-[11px] font-medium whitespace-nowrap transition-all ${active
                                            ? 'bg-gray-900 border-gray-900 text-white shadow-sm'
                                            : 'bg-white border-gray-200 text-gray-700 hover:bg-white'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>

                        {selectedCategoryNotice && (
                            <div className="relative rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 pr-12 text-sky-950">
                                {selectedCategoryNoticeImageSrc && (
                                    <button
                                        type="button"
                                        onClick={() => setCategoryPreviewImage({
                                            src: selectedCategoryNoticeImageSrc,
                                            alt: selectedCategoryNotice.noticeImageName || selectedCategoryNotice.name
                                        })}
                                        className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-sky-700 bg-sky-600 text-white shadow-md shadow-sky-900/20 transition-colors hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-sky-50"
                                        aria-label="ดูรูปประกอบ"
                                    >
                                        <ImageIcon size={15} />
                                    </button>
                                )}
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={16} className="shrink-0 text-sky-600" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold">
                                            {selectedCategoryNotice.noticeTitle || "อ่านระเบียบก่อนสั่งซื้อ"}
                                        </p>
                                        <p className="mt-1 whitespace-pre-line text-[11px] leading-5 text-sky-800">
                                            {selectedCategoryNotice.noticeText}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                          {promotions.some(p => p.type === 'auto') && (
                    <div className="bg-gray-900 text-white py-2.5 px-4 shadow-sm overflow-hidden relative border-b border-gray-800 rounded-sm">
                        <div className="flex items-center gap-2 animate-marquee whitespace-nowrap">
                            {promotions.filter(p => p.type === 'auto').map((promo, i) => (
                                <span key={promo.id} className="flex items-center gap-2 mx-4 text-sm font-medium">
                                    <Megaphone size={14} className="text-yellow-400 animate-pulse" />
                                    {promo.name}
                                    <span className="bg-white/10 px-2 py-0.5 rounded text-xs text-yellow-300 border border-white/10">
                                        {promo.discountType === 'percentage' ? `ลด ${promo.discountValue}%` : `ลด ฿${promo.discountValue}`}
                                    </span>
                                    <span className="text-gray-400 text-xs font-light">
                                        {promo.minPurchase > 0 ? `(ขั้นต่ำ ฿${promo.minPurchase.toLocaleString()})` : '(ไม่มีขั้นต่ำ)'}
                                    </span>
                                    {i !== promotions.filter(p => p.type === 'auto').length - 1 && <span className="opacity-30 text-gray-600">|</span>}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Coupon Promotions (Click to Collect & Disappear) */}
                {promotions.some(p => p.type === 'coupon') && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                            <Ticket size={16} className="text-orange-500" />
                            <h2 className="font-bold text-gray-900 text-sm">คูปองส่วนลด</h2>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                            {promotions
                                .filter(p => p.type === 'coupon')
                                .map((promo) => {
                                    const myCoupon = myCoupons.find(c => c.id === promo.id);
                                    const isCollected = Boolean(myCoupon);
                                    return (
                                        <div
                                            key={promo.id}
                                            className="flex-shrink-0 w-56 h-16 bg-white rounded-lg border border-orange-100 shadow-sm flex overflow-hidden relative group"
                                        >
                                        {/* Left Side: Discount */}
                                        <div className="w-16 bg-gradient-to-br from-orange-500 to-red-500 flex flex-col items-center justify-center p-1.5 gap-0.5 text-white shrink-0 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_0%,rgba(255,255,255,0.2)_0%,transparent_50%)]"></div>
                                            <Ticket size={12} className="opacity-90 relative z-10" />
                                            <div className="text-center relative z-10">
                                                <span className="text-base font-bold block leading-none shadow-black/10 drop-shadow-md">
                                                    {promo.discountType === 'percentage'
                                                        ? `${promo.discountValue}%`
                                                        : `฿${promo.discountValue}`
                                                    }
                                                </span>
                                                <span className="text-[8px] opacity-90 font-medium">คูปอง</span>
                                            </div>
                                        </div>

                                        {/* Right Side: Details */}
                                        <div className="flex-1 p-2 flex flex-col justify-between min-w-0 relative bg-[radial-gradient(#f5f5f5_1px,transparent_1px)] [background-size:8px_8px]">
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-gray-900 text-[11px] truncate leading-tight">{promo.name}</h3>
                                                <p className="text-[9px] text-gray-500 mt-0.5 truncate">
                                                    ขั้นต่ำ ฿{promo.minPurchase.toLocaleString()}
                                                </p>
                                                <p className="text-[9px] text-gray-400">
                                                    หมดเขต {format(toDate(promo.endDate), 'd MMM yy', { locale: th })}
                                                </p>
                                            </div>

                                            <button
                                                onClick={() => handleCollectCoupon(promo)}
                                                disabled={isCollected}
                                                className={`absolute bottom-1 right-1 flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold shadow-lg transition-all active:scale-95 
                                                ${isCollected
                                                        ? 'bg-gray-200 text-gray-500 shadow-none cursor-default'
                                                        : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-200'
                                                    }`}
                                            >
                                                {isCollected ? 'รับแล้ว' : 'เก็บโค้ด'}
                                                <Check size={10} />
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })}
                        </div>
                    </div>
                )}
                    </div>

                    
                </div>
                
            </header>

            <main className="flex-1 overflow-y-auto pb-8">
                <div className="px-4 py-4 space-y-5">
                {/* Auto Promotions Ticker */}
              
                {/* Products Grid */}
                {loading ? (
                    <div className="grid grid-cols-2 gap-3">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="bg-white rounded-xl aspect-[3/4] animate-pulse"></div>
                        ))}
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <Package size={48} className="mb-4 opacity-30" />
                        <p className="text-gray-600 font-medium">ไม่พบสินค้า</p>
                        <p className="text-sm text-gray-400 mt-1">ลองค้นหาด้วยคำอื่น</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className="grid grid-cols-2 gap-3">
                            {filteredProducts.map(product => {
                                // Calculate best discount
                                const bestPromo = promotions
                                    .filter(p => p.type === 'auto' && product.price >= p.minPurchase)
                                    .sort((a, b) => {
                                        const discountA = a.discountType === 'percentage'
                                            ? (product.price * a.discountValue / 100)
                                            : a.discountValue;
                                        const discountB = b.discountType === 'percentage'
                                            ? (product.price * b.discountValue / 100)
                                            : b.discountValue;
                                        return discountB - discountA;
                                    })[0];

                                const finalPrice = bestPromo
                                    ? (bestPromo.discountType === 'percentage'
                                        ? product.price * (1 - bestPromo.discountValue / 100)
                                        : Math.max(0, product.price - bestPromo.discountValue))
                                    : product.price;

                                const hasDiscount = bestPromo && finalPrice < product.price;
                                const primaryImage = getPrimaryProductImage(product, productBase64Images[product.id]);
                                const displayStock = getProductDisplayStock(product, bundleProducts);

                                return (
                                    <Link href={`/product/${product.id}`} key={product.id} className="block group">
                                        <div className="bg-white rounded-xl overflow-hidden border border-gray-200 transition-all hover:shadow hover:border-gray-100 relative">
                                            {/* Image */}
                                            <div className="aspect-square bg-white flex items-center justify-center p-4 relative overflow-hidden">
                                                {primaryImage ? (
                                                    <img
                                                        src={primaryImage}
                                                        alt={product.name}
                                                        className="w-full h-full object-contain transition-transform group-hover:scale-105"
                                                    />
                                                ) : (
                                                    <Package size={32} className="text-gray-200" />
                                                )}

                                                {/* Badges Container */}
                                                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                                                    {/* Stock Badge */}
                                                    {displayStock === 0 && (
                                                        <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                                            หมด
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Sale Tag */}
                                                {hasDiscount && (
                                                    <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-sm leading-none">
                                                        ลด {bestPromo.discountType === 'percentage'
                                                            ? `${bestPromo.discountValue}%`
                                                            : `฿${bestPromo.discountValue}`
                                                        }
                                                    </div>
                                                )}
                                            </div>
                                            {/* Info */}
                                            <div className="p-3">
                                                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{product.category}</span>
                                                <h3 className="font-semibold text-sm text-gray-900 mt-0.5 line-clamp-1">{product.name}</h3>

                                                <div className="flex items-end justify-between mt-2">
                                                    <div className="flex flex-row items-baseline gap-1">
                                                        {hasDiscount ? (
                                                            <>
                                                                <span className="text-xs text-gray-400 line-through">฿{product.price.toLocaleString()}</span>
                                                                <span className="font-bold text-red-600 text-base">฿{finalPrice.toLocaleString()}</span>
                                                            </>
                                                        ) : (
                                                            <span className="font-bold text-gray-900 text-base">฿{product.price.toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                    {product.hasVariants && product.variants && product.variants.length > 0 && (
                                                        <span className="text-[10px] text-gray-400 mb-1">{product.variants.length} แบบ</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Auto Load More Trigger */}
                        {hasMore && !searchTerm && (
                            <div
                                ref={loadMoreTriggerRef}
                                className="flex min-h-12 items-center justify-center gap-2 py-3 text-sm font-medium text-gray-500"
                            >
                                {isFetchingMore ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                                        กำลังโหลด...
                                    </>
                                ) : (
                                    'โหลดเพิ่มเติม'
                                )}
                            </div>
                        )}

                        {!hasMore && products.length > 0 && !searchTerm && (
                            <div className="text-center text-xs text-gray-400 py-4">
                                - แสดงสินค้าครบแล้ว -
                            </div>
                        )}
                    </div>
                )}
                </div>
            </main>

            {categoryPreviewImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
                    onClick={() => setCategoryPreviewImage(null)}
                >
                    <button
                        type="button"
                        onClick={() => setCategoryPreviewImage(null)}
                        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur hover:bg-white/20"
                        aria-label="ปิดรูป"
                    >
                        <XCircle size={24} />
                    </button>
                    <img
                        src={categoryPreviewImage.src}
                        alt={categoryPreviewImage.alt}
                        onClick={(event) => event.stopPropagation()}
                        className="max-h-[84vh] max-w-full rounded-xl bg-white object-contain shadow-2xl"
                    />
                </div>
            )}
        </div>
    );
}
