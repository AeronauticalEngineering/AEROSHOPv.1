"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { Product, ProductVariant, SelectedProductAddOn } from '@/types/product';

export interface CartItem extends Product {
    quantity: number;
    selectedVariant?: ProductVariant;  // Track which variant was selected
    selectedAddOns?: SelectedProductAddOn[];
    cartItemId: string;  // Unique ID for cart item (product + variant)
}

interface CartContextType {
    cartItems: CartItem[];
    addToCart: (product: Product, variant?: ProductVariant, addOns?: SelectedProductAddOn[]) => void;
    removeFromCart: (cartItemId: string) => void;
    updateQuantity: (cartItemId: string, quantity: number) => void;
    clearCart: () => void;
    totalAmount: number;
    totalItems: number;
    isCartOpen: boolean;
    setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Generate unique cart item ID based on product and variant
const generateCartItemId = (product: Product, variant?: ProductVariant, addOns: SelectedProductAddOn[] = []): string => {
    const addOnKey = addOns.length
        ? addOns.map(addOn => `${addOn.id}:${addOn.value || ""}`).join("|")
        : "";
    const bundleKey = product.bundleItems?.length
        ? product.bundleItems.map(item => {
            const addOnKey = item.selectedAddOns?.length
                ? item.selectedAddOns.map(addOn => `${addOn.id}:${addOn.value || ""}`).join(",")
                : "";
            return `${item.id}:${item.variantId || ""}:${addOnKey}`;
        }).join("|")
        : "";
    return [product.id, variant?.id, bundleKey, addOnKey].filter(Boolean).join("_");
};

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [hasLoadedCart, setHasLoadedCart] = useState(false);

    useEffect(() => {
        let isCancelled = false;

        queueMicrotask(() => {
            if (isCancelled) return;
            const savedCart = localStorage.getItem('eshop_cart');
            if (savedCart) {
                try {
                    setCartItems(JSON.parse(savedCart) as CartItem[]);
                } catch (e) {
                    console.error("Failed to parse cart", e);
                }
            }
            setHasLoadedCart(true);
        });

        return () => {
            isCancelled = true;
        };
    }, []);

    // Save cart to localStorage whenever it changes
    useEffect(() => {
        if (!hasLoadedCart) return;
        localStorage.setItem('eshop_cart', JSON.stringify(cartItems));
    }, [cartItems, hasLoadedCart]);

    const addToCart = useCallback((product: Product, variant?: ProductVariant, addOns: SelectedProductAddOn[] = []) => {
        const cartItemId = generateCartItemId(product, variant, addOns);

        // Get the correct price from variant if exists
        const addOnPrice = addOns.reduce((sum, addOn) => sum + addOn.price, 0);
        const itemPrice = (variant?.price ?? product.price) + addOnPrice;

        setCartItems(prev => {
            const existing = prev.find(item => item.cartItemId === cartItemId);
            if (existing) {
                return prev.map(item =>
                    item.cartItemId === cartItemId
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, {
                ...product,
                price: itemPrice,
                quantity: 1,
                selectedVariant: variant,
                selectedAddOns: addOns,
                cartItemId
            }];
        });
        setIsCartOpen(true);
    }, []);

    const removeFromCart = useCallback((cartItemId: string) => {
        setCartItems(prev => prev.filter(item => item.cartItemId !== cartItemId));
    }, []);

    const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(cartItemId);
            return;
        }
        setCartItems(prev => prev.map(item =>
            item.cartItemId === cartItemId ? { ...item, quantity } : item
        ));
    }, [removeFromCart]);

    const clearCart = useCallback(() => {
        setCartItems([]);
    }, []);

    const totalAmount = useMemo(() => {
        return cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cartItems]);

    const totalItems = useMemo(() => {
        return cartItems.reduce((sum, item) => sum + item.quantity, 0);
    }, [cartItems]);

    return (
        <CartContext.Provider value={{
            cartItems,
            addToCart,
            removeFromCart,
            updateQuantity,
            clearCart,
            totalAmount,
            totalItems,
            isCartOpen,
            setIsCartOpen
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within CartProvider');
    }
    return context;
};
