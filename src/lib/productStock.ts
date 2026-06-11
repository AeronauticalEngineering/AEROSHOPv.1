import { Product } from "@/types/product";

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
