"use client";

import { useEffect, useState } from 'react';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import useLiff from './useLiff';
import { UserProfile } from '@/types/user';

interface UseLiffAuthReturn {
    loading: boolean;
    error: string | null;
    needsLink: boolean;
    linkProfile: any | null;
    linkByPhone: (phone: string) => Promise<{ success: boolean; error?: string }>;
    userProfile: UserProfile | null;
}

interface UseLiffAuthOptions {
    enabled?: boolean;
}

export default function useLiffAuth(options?: UseLiffAuthOptions): UseLiffAuthReturn {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [needsLink, setNeedsLink] = useState(false);
    const [linkProfile, setLinkProfile] = useState<any | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const enabled = options?.enabled !== false;

    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    const { liff, loading: liffLoading, error: liffError } = useLiff(liffId, { enabled });

    useEffect(() => {
        let mounted = true;
        async function init() {
            if (!enabled) {
                setLoading(false);
                setError(null);
                setNeedsLink(false);
                setLinkProfile(null);
                setUserProfile(null);
                return;
            }
            try {
                // =====================================================
                // DEVELOPMENT MODE: ใช้ Mock User
                // =====================================================
                const isDev = process.env.NODE_ENV === 'development';
                const useMockLiff = process.env.NEXT_PUBLIC_MOCK_LIFF === 'true';

                if (isDev && useMockLiff) {
                    // Mock user profile สำหรับ development
                    const mockUserProfile: UserProfile = {
                        id: 'dev_user_admin',
                        uid: 'dev_user_admin', // ใช้ ID สมมติที่จำง่าย
                        lineId: 'dev_user_admin',
                        name: 'Dev Admin (ทดสอบ)',
                        displayName: 'My Admin Dev',
                        role: 'admin', // <--- เปลี่ยนเป็น admin
                        phone: '0812345678',
                    };

                    setUserProfile(mockUserProfile);
                    setLoading(false);
                    return;
                }
                // =====================================================

                if (liffLoading) return;
                if (liffError) {
                    setError(liffError);
                    setLoading(false);
                    return;
                }

                if (!liff) {
                    setError('LIFF not available');
                    setLoading(false);
                    return;
                }

                const accessToken = typeof liff.getAccessToken === 'function' ? liff.getAccessToken() : null;
                if (!accessToken) {
                    setError('no access token');
                    setLoading(false);
                    return;
                }

                const resp = await fetch('/api/auth/line', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken }),
                });
                if (!resp.ok) {
                    const errBody = await resp.text();
                    throw new Error(`auth exchange failed: ${resp.status} ${errBody}`);
                }
                const body = await resp.json();
                if (body.needsLink) {
                    // Bypass phone registration: Sign in anonymously but keep Line Profile
                    setLinkProfile(body.profile || null);

                    // Create temporary display profile from Line data
                    if (body.profile) {
                        const tempProfile: UserProfile = {
                            id: body.profile.lineId, // Use Line ID as temporary ID
                            uid: body.profile.lineId,
                            lineId: body.profile.lineId,
                            displayName: body.profile.displayName,
                            pictureUrl: body.profile.pictureUrl,
                            role: 'customer',
                            name: body.profile.displayName,
                            phone: '' // No phone yet
                        };
                        setUserProfile(tempProfile);
                    }

                    const auth = getAuth();
                    try {
                        await signInAnonymously(auth); // Allow Firebase access
                    } catch (anonErr) {
                        console.warn("⚠️ Anonymous auth failed (likely disabled in console). Proceeding with visual-only LIFF profile.", anonErr);
                        // prevent main catch from triggering, so UI still shows profile
                    }

                    setNeedsLink(false); // Don't show register modal
                    setLoading(false);
                    return;
                }
                const { customToken, userProfile: receivedProfile } = body;

                if (receivedProfile) {
                    setUserProfile(receivedProfile);
                }

                const auth = getAuth();
                await signInWithCustomToken(auth, customToken);
                if (!mounted) return;
                setLoading(false);
            } catch (err: any) {
                console.error('useLiffAuth error', err);
                setError(err?.message || 'liff-error');
                setLoading(false);
            }
        }

        init();
        return () => { mounted = false; };
    }, [enabled, liff, liffLoading, liffError]);

    const linkByPhone = async (phone: string) => {
        setLoading(true);
        setError(null);
        try {
            if (!linkProfile?.lineId) throw new Error('no_profile');
            const resp = await fetch('/api/auth/line/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lineId: linkProfile.lineId, phone }),
            });
            const body = await resp.json();
            if (!resp.ok) {
                throw new Error(body?.error || 'link_failed');
            }
            const { customToken, userProfile: receivedProfile } = body;

            if (receivedProfile) {
                setUserProfile(receivedProfile);
            }

            const auth = getAuth();
            await signInWithCustomToken(auth, customToken);
            setNeedsLink(false);
            setLinkProfile(null);
            setLoading(false);
            return { success: true };
        } catch (err: any) {
            console.error('linkByPhone error', err);
            setError(err?.message || 'link-error');
            setLoading(false);
            return { success: false, error: err?.message };
        }
    };

    return { loading, error, needsLink, linkProfile, linkByPhone, userProfile };
}

