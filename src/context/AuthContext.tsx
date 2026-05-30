"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { UserProfile } from '@/types/user';

interface AuthContextType {
    user: User | null;
    userProfile: UserProfile | null;
    loading: boolean;
    logout: () => Promise<void>;
    setUserProfileFromAuth: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children, initialUserProfile = null }: { children: React.ReactNode, initialUserProfile?: UserProfile | null }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(initialUserProfile);
    const [loading, setLoading] = useState<boolean>(true);

    // ฟังก์ชันสำหรับ set userProfile จากภายนอก (จาก useLiffAuth)
    const setUserProfileFromAuth = useCallback((profile: UserProfile) => {
        setUserProfile(profile);
    }, []);

    // ใช้ useRef เพื่อเก็บค่า userProfile ล่าสุด โดยไม่ต้องใส่ใน dependency ของ useEffect
    const userProfileRef = useRef<UserProfile | null>(userProfile);

    useEffect(() => {
        userProfileRef.current = userProfile;
    }, [userProfile]);

    useEffect(() => {
        if (!auth) return;
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);

                // [OPTIMIZATION] ตรวจสอบก่อนว่ามี userProfile อยู่แล้วหรือไม่ (จากการ Login ผ่าน LIFF)
                // ใช้ current value จาก ref แทน state โดยตรง
                const currentProfile = userProfileRef.current;

                if (currentProfile && (currentProfile.uid === firebaseUser.uid)) {
                    setLoading(false);
                    return;
                }

                // ถ้ายังไม่มี Profile ถึงค่อยไปดึงจาก Firestore
                try {
                    if (db) {
                        const userDocRef = doc(db, 'users', firebaseUser.uid);
                        const userDocSnap = await getDoc(userDocRef);

                        if (userDocSnap.exists()) {
                            setUserProfile({ uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile);
                        } else {
                            console.warn("No user profile found in Firestore for UID:", firebaseUser.uid);
                            setUserProfile(null);
                        }
                    }
                } catch (err) {
                    console.error("Error fetching user profile:", err);
                    setUserProfile(null);
                }

            } else {
                setUser(null);
                setUserProfile(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const logout = useCallback(async () => {
        try {
            if (auth) await signOut(auth);
            setUser(null);
            setUserProfile(null);
        } catch (err) {
            console.error('Logout error', err);
        }
    }, []);

    const contextValue = useMemo(() => ({
        user,
        userProfile,
        loading,
        logout,
        setUserProfileFromAuth
    }), [user, userProfile, loading, logout, setUserProfileFromAuth]);

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
