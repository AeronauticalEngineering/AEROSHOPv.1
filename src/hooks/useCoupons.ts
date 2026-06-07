"use client";

import { useState, useCallback, useEffect } from 'react';
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDocs, query, where, deleteDoc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { Promotion } from "@/context/PromotionContext";

export interface MyCoupon extends Promotion {
    collectedAt: any;
    isUsed: boolean;
    usedAt?: any;
    orderId?: string;
}

type UseCouponsOptions = {
    includeUsed?: boolean;
};

export function useCoupons(options: UseCouponsOptions = {}) {
    const { userProfile } = useAuth();
    const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([]);
    const [loading, setLoading] = useState(false);
    const includeUsed = options.includeUsed ?? false;

    // Fetch user's collected coupons
    const fetchMyCoupons = useCallback(async () => {
        if (!userProfile?.uid) {
            setMyCoupons([]);
            return;
        }

        try {
            setLoading(true);
            const baseRef = collection(db, "users", userProfile.uid, "my_coupons");
            const q = includeUsed
                ? query(baseRef)
                : query(baseRef, where("isUsed", "==", false)); // Fetch only unused coupons

            const snapshot = await getDocs(q);
            const coupons: MyCoupon[] = [];

            // We need to join with promotion details because my_coupons might only have snapshot data
            // But for simplicity, let's assume we store full promo data when collecting, 
            // OR we fetch promo details. Let's assume we store full snapshot for now.

            snapshot.forEach(doc => {
                coupons.push({ id: doc.id, ...doc.data() } as MyCoupon);
            });

            setMyCoupons(coupons);
        } catch (error) {
            console.error("Error fetching my coupons:", error);
        } finally {
            setLoading(false);
        }
    }, [userProfile, includeUsed]);

    // Initial fetch
    useEffect(() => {
        fetchMyCoupons();
    }, [fetchMyCoupons]);

    // Collect a coupon
    const collectCoupon = async (promotion: Promotion) => {
        if (!userProfile?.uid) {
            alert("กรุณาเข้าสู่ระบบก่อนเก็บคูปอง");
            return false;
        }

        try {
            setLoading(true);
            const couponRef = doc(db, "users", userProfile.uid, "my_coupons", promotion.id);

            // Check if already collected
            const docSnap = await getDoc(couponRef);
            if (docSnap.exists()) {
                alert("คุณมีคูปองนี้แล้ว");
                return false;
            }

            // Save coupon to user's subcollection
            await setDoc(couponRef, {
                ...promotion,
                collectedAt: new Date(),
                isUsed: false
            });

            await fetchMyCoupons(); // Refresh list
            return true;
        } catch (error) {
            console.error("Error collecting coupon:", error);
            alert("เกิดข้อผิดพลาดในการเก็บคูปอง");
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Use a coupon (Mark as used) - This would be called after successful order
    const useCoupon = async (couponId: string, orderId: string) => {
        if (!userProfile?.uid) return false;

        try {
            const couponRef = doc(db, "users", userProfile.uid, "my_coupons", couponId);
            await setDoc(couponRef, {
                isUsed: true,
                usedAt: new Date(),
                orderId: orderId
            }, { merge: true });

            await fetchMyCoupons();
            return true;
        } catch (error) {
            console.error("Error marking coupon as used:", error);
            return false;
        }
    };

    const isCollected = (promotionId: string) => {
        return myCoupons.some(c => c.id === promotionId);
    };

    return {
        myCoupons,
        loading,
        collectCoupon,
        useCoupon,
        isCollected,
        refreshCoupons: fetchMyCoupons
    };
}
