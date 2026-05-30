// src/types/product.ts
import { Timestamp } from 'firebase/firestore';

export interface ProductOption {
    id: string;
    name: string; // e.g. "Color", "Size"
    values: string[]; // e.g. ["Red", "Blue"]
    allowCustom?: boolean;
}

export interface ProductVariant {
    id: string;
    name: string; // e.g. "Red - S"
    price: number;
    stock: number;
    sku?: string;
    image?: string;
    attributes: Record<string, string>; // { "Color": "Red", "Size": "S" }
}

export interface ProductBundleItem {
    id: string;
    productId: string;
    productName: string;
    variantId?: string;
    variantName?: string;
    quantity: number;
    unitPrice: number;
    selectedAddOns?: SelectedProductAddOn[];
    status?: 'processing' | 'ready' | 'received' | 'shipped' | 'completed' | 'cancelled' | 'returned';
}

export interface ProductAddOn {
    id: string;
    name: string;
    price: number;
    inputLabel?: string;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
    isActive?: boolean;
}

export interface SelectedProductAddOn {
    id: string;
    name: string;
    price: number;
    value?: string;
}

export interface Product {
    id: string;
    sku?: string;
    name: string;
    description: string;
    guideId?: string;
    guideTitle?: string;
    guideText?: string;
    guideImageBase64?: string;
    guideImageName?: string;
    price: number;
    stock: number;
    category: string;
    imageUrl?: string;
    imageUrls?: string[];
    imageBase64Ids?: string[];
    isActive: boolean;
    productType?: 'single' | 'bundle';
    bundleItems?: ProductBundleItem[];
    hasVariants: boolean;
    options?: ProductOption[];
    variants?: ProductVariant[];
    addOns?: ProductAddOn[];
    createdAt?: Timestamp | Date;
    updatedAt?: Timestamp | Date;
}

export interface ProductGuide {
    id: string;
    title: string;
    text?: string;
    imageBase64?: string;
    imageUrl?: string;
    imageName?: string;
    isActive: boolean;
    createdAt?: Timestamp | Date;
    updatedAt?: Timestamp | Date;
}
