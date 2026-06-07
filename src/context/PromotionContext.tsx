"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Promotion {
    id: string;
    type: 'coupon' | 'auto';
    code?: string;
    name: string;
    description: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    minPurchase: number;
    maxDiscount?: number | null;
    startDate: Timestamp | string | number | Date | { toDate: () => Date };
    endDate: Timestamp | string | number | Date | { toDate: () => Date };
    isActive: boolean;
}

export interface PromotionSettings {
    couponsEnabled: boolean;
    autoPromotionsEnabled: boolean;
}

interface PromotionContextType {
    promotions: Promotion[];
    settings: PromotionSettings;
    loading: boolean;
    refreshPromotions: () => Promise<void>;
}

const PromotionContext = createContext<PromotionContextType | undefined>(undefined);

export function PromotionProvider({ children }: { children: ReactNode }) {
    const [rawPromotions, setRawPromotions] = useState<Promotion[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [settings, setSettings] = useState<PromotionSettings>({
        couponsEnabled: true,
        autoPromotionsEnabled: true
    });
    const [loading, setLoading] = useState(true);

    const fetchPromotions = async () => {
        try {
            setLoading(true);
            const settingsSnap = await getDoc(doc(db, "settings", "promotion"));
            const promotionSettings = settingsSnap.exists()
                ? {
                    couponsEnabled: settingsSnap.data().couponsEnabled !== false,
                    autoPromotionsEnabled: settingsSnap.data().autoPromotionsEnabled !== false
                }
                : {
                    couponsEnabled: true,
                    autoPromotionsEnabled: true
                };
            setSettings(promotionSettings);

            const q = query(
                collection(db, "promotions"),
                where("isActive", "==", true),
                orderBy("createdAt", "desc")
            );

            const snapshot = await getDocs(q);
            const activePromos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promotion));

            setRawPromotions(activePromos);
        } catch (error) {
            console.error("Failed to fetch promotions:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const settingsUnsubscribe = onSnapshot(doc(db, "settings", "promotion"), (snapshot) => {
            if (!snapshot.exists()) {
                setSettings({
                    couponsEnabled: true,
                    autoPromotionsEnabled: true
                });
                return;
            }
            const data = snapshot.data();
            setSettings({
                couponsEnabled: data.couponsEnabled !== false,
                autoPromotionsEnabled: data.autoPromotionsEnabled !== false
            });
        });

        const promotionsQuery = query(
            collection(db, "promotions"),
            where("isActive", "==", true),
            orderBy("createdAt", "desc")
        );
        const promotionsUnsubscribe = onSnapshot(
            promotionsQuery,
            (snapshot) => {
                setRawPromotions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Promotion)));
                setLoading(false);
            },
            (error) => {
                console.error("Failed to subscribe promotions:", error);
                setLoading(false);
            }
        );

        return () => {
            settingsUnsubscribe();
            promotionsUnsubscribe();
        };
    }, []);

    useEffect(() => {
        const now = new Date();
        setPromotions(rawPromotions.filter(p => {
            const start = typeof p.startDate === "object" && "toDate" in p.startDate ? p.startDate.toDate() : new Date(p.startDate);
            const end = typeof p.endDate === "object" && "toDate" in p.endDate ? p.endDate.toDate() : new Date(p.endDate);
            const typeEnabled = p.type === "coupon"
                ? settings.couponsEnabled
                : settings.autoPromotionsEnabled;
            return typeEnabled && now >= start && now <= end;
        }));
    }, [rawPromotions, settings]);

    return (
        <PromotionContext.Provider value={{ promotions, settings, loading, refreshPromotions: fetchPromotions }}>
            {children}
        </PromotionContext.Provider>
    );
}

export function usePromotions() {
    const context = useContext(PromotionContext);
    if (!context) {
        throw new Error("usePromotions must be used within a PromotionProvider");
    }
    return context;
}
