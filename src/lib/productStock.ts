import { Product, ProductBundleItem } from "@/types/product";

type ProductLookup = Record<string, Product> | Product[];

const findProduct = (products: ProductLookup | undefined, productId?: string) => {
    if (!products || !productId) return undefined;
    return Array.isArray(products)
        ? products.find((product) => product.id === productId)
        : products[productId];
};

export const getProductDisplayStock = (product: Product, products?: ProductLookup) => {
    if (product.productType !== "bundle" || !product.bundleItems?.length) {
        return Number(product.stock) || 0;
    }

    const bundleStocks = product.bundleItems.map((item) => {
        const childProduct = findProduct(products, item.productId);
        if (!childProduct) return Number(product.stock) || 0;

        const childStock = childProduct.hasVariants
            ? item.variantId
                ? childProduct.variants?.find((variant) => variant.id === item.variantId)?.stock || 0
                : childProduct.stock || 0
            : childProduct.stock || 0;

        return Math.floor((Number(childStock) || 0) / Math.max(1, Number(item.quantity) || 1));
    });

    return bundleStocks.length ? Math.min(...bundleStocks) : 0;
};

export type StockCheckableItem = {
    id?: string;
    productId?: string;
    name?: string;
    productName?: string;
    quantity: number;
    stock?: number;
    variantId?: string | null;
    selectedVariant?: { id: string; name?: string; stock?: number } | null;
    bundleItems?: ProductBundleItem[];
};

export const getItemLiveAvailableStock = (
    item: StockCheckableItem,
    liveProducts: Record<string, Product>
): number => {
    const variantId = item.variantId || item.selectedVariant?.id || "";
    if (variantId.startsWith("custom-")) return 9999;

    if (item.bundleItems && item.bundleItems.length > 0) {
        const stocks = item.bundleItems.map((bItem) => {
            if (bItem.variantId && bItem.variantId.startsWith("custom-")) return 9999;
            const childProd = liveProducts[bItem.productId];
            if (!childProd) return 9999;
            if (childProd.isActive === false) return 0;
            const rawStock = bItem.variantId
                ? childProd.variants?.find((v) => v.id === bItem.variantId)?.stock ?? 0
                : childProd.stock ?? 0;
            return Math.floor(Math.max(0, Number(rawStock) || 0) / Math.max(1, Number(bItem.quantity) || 1));
        });
        return stocks.length ? Math.min(...stocks) : 0;
    }

    const prodId = item.productId || item.id || "";
    const liveProd = prodId ? liveProducts[prodId] : undefined;
    if (!liveProd) {
        return Number(item.selectedVariant?.stock ?? item.stock ?? 9999);
    }
    if (liveProd.isActive === false) return 0;

    if (variantId) {
        const matchedVariant = liveProd.variants?.find((v) => v.id === variantId);
        return Math.max(0, Number(matchedVariant?.stock ?? 0));
    }

    return Math.max(0, Number(liveProd.stock ?? 0));
};

export const validateItemsStockAgainstLive = (
    items: StockCheckableItem[],
    liveProducts: Record<string, Product>
): { isAvailable: boolean; outOfStockNames: string[] } => {
    const requiredMap = new Map<
        string,
        { productId: string; variantId?: string; quantity: number; displayName: string }
    >();

    for (const item of items) {
        const itemQty = Math.max(1, Number(item.quantity) || 1);
        if (item.bundleItems && item.bundleItems.length > 0) {
            for (const bItem of item.bundleItems) {
                if (!bItem.productId) continue;
                if (bItem.variantId && bItem.variantId.startsWith("custom-")) continue;
                const key = `${bItem.productId}::${bItem.variantId || ""}`;
                const existing = requiredMap.get(key) || {
                    productId: bItem.productId,
                    variantId: bItem.variantId || undefined,
                    quantity: 0,
                    displayName: bItem.productName || item.productName || item.name || "สินค้า"
                };
                existing.quantity += itemQty * Math.max(1, Number(bItem.quantity) || 1);
                requiredMap.set(key, existing);
            }
        } else {
            const prodId = item.productId || item.id || "";
            if (!prodId) continue;
            const variantId = item.variantId || item.selectedVariant?.id || undefined;
            if (variantId && variantId.startsWith("custom-")) continue;
            const key = `${prodId}::${variantId || ""}`;
            const existing = requiredMap.get(key) || {
                productId: prodId,
                variantId,
                quantity: 0,
                displayName: item.productName || item.name || "สินค้า"
            };
            existing.quantity += itemQty;
            requiredMap.set(key, existing);
        }
    }

    const outOfStockNames: string[] = [];

    for (const req of requiredMap.values()) {
        const liveProd = liveProducts[req.productId];
        if (!liveProd) continue;
        const prodName = liveProd.name || req.displayName;

        if (liveProd.isActive === false) {
            outOfStockNames.push(prodName);
            continue;
        }

        if (req.variantId) {
            const matchedVariant = liveProd.variants?.find((v) => v.id === req.variantId);
            const available = Math.max(0, Number(matchedVariant?.stock ?? 0));
            if (available < req.quantity) {
                const vName = matchedVariant?.name ? ` (${matchedVariant.name})` : "";
                outOfStockNames.push(`${prodName}${vName}`);
            }
        } else {
            const available = Math.max(0, Number(liveProd.stock ?? 0));
            if (available < req.quantity) {
                outOfStockNames.push(prodName);
            }
        }
    }

    return {
        isAvailable: outOfStockNames.length === 0,
        outOfStockNames: Array.from(new Set(outOfStockNames))
    };
};
