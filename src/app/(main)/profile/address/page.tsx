"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, MapPin, Trash2, Home, Phone, User, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface AddressItem {
    name: string;
    phone: string;
    address: string;
    usedAt: string;
}

export default function AddressBookPage() {
    const router = useRouter();
    const { userProfile } = useAuth();
    const [addresses, setAddresses] = useState<AddressItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        address: ""
    });

    const getCustomerId = () => userProfile?.lineId || userProfile?.uid || userProfile?.id;

    const fetchAddresses = async () => {
        const customerId = getCustomerId();
        if (!customerId) return;

        try {
            const docRef = doc(db, "customers", customerId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.addressHistory && Array.isArray(data.addressHistory)) {
                    // Sort by newest first
                    const sorted = [...data.addressHistory].sort((a, b) =>
                        new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime()
                    );
                    setAddresses(sorted);
                }
            }
        } catch (error) {
            console.error("Error fetching addresses:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (userProfile) {
            fetchAddresses();
        } else {
            // Wait a bit for auth, if still no user stop loading
            const timer = setTimeout(() => setLoading(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [userProfile]);

    const handleDelete = async (indexToDelete: number) => {
        if (!confirm("ต้องการลบที่อยู่นี้?")) return;

        const customerId = getCustomerId();
        if (!customerId) return;

        try {
            const newAddresses = addresses.filter((_, idx) => idx !== indexToDelete);

            // Optimistic update
            setAddresses(newAddresses);

            const docRef = doc(db, "customers", customerId);
            await updateDoc(docRef, {
                addressHistory: newAddresses
            });
        } catch (error) {
            console.error("Error deleting address:", error);
            alert("เกิดข้อผิดพลาดในการลบ");
            fetchAddresses(); // Revert
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const customerId = getCustomerId();
        if (!customerId) return;

        setSubmitting(true);
        try {
            const newAddress: AddressItem = {
                name: formData.name,
                phone: formData.phone,
                address: formData.address,
                usedAt: new Date().toISOString()
            };

            const newAddresses = [newAddress, ...addresses];

            // Update Firestore (use setDoc to create if not exists)
            const docRef = doc(db, "customers", customerId);
            await setDoc(docRef, {
                addressHistory: newAddresses
            }, { merge: true });

            setAddresses(newAddresses);
            setShowForm(false);
            setFormData({ name: "", phone: "", address: "" });
        } catch (error) {
            console.error("Error adding address:", error);
            alert("เกิดข้อผิดพลาดในการบันทึก");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="animate-spin text-gray-400" size={32} />
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">


            <main className="flex-1 p-4 space-y-4 pb-24">
                {/* Add Form */}
                {showForm && (
                    <div className="bg-white rounded-xl p-4 border border-blue-100 shadow-sm mb-4">
                        <h3 className="font-bold text-gray-900 mb-4">เพิ่มที่อยู่ใหม่</h3>
                        <form onSubmit={handleAdd} className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">ชื่อ-นามสกุล</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="ระบุชื่อผู้รับ"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">เบอร์โทรศัพท์</label>
                                <input
                                    required
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="08xxxxxxxx"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">ที่อยู่จัดส่ง</label>
                                <textarea
                                    required
                                    rows={3}
                                    value={formData.address}
                                    onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 resize-none"
                                    placeholder="บ้านเลขที่, ถนน..."
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="flex-1 py-2 text-gray-600 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-2 text-white bg-blue-600 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Empty State */}
                {!loading && addresses.length === 0 && !showForm && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <MapPin size={48} className="opacity-20 mb-4" />
                        <p>ไม่มีที่อยู่ที่บันทึกไว้</p>
                    </div>
                )}

                {/* List */}
                <div className="space-y-3">
                    {addresses.map((addr, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-gray-100 flex gap-4 group">
                            <div className="mt-1">
                                <Home size={18} className="text-gray-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 text-sm truncate">{addr.name}</p>
                                <p className="text-xs text-gray-500 mb-2">{addr.phone}</p>
                                <p className="text-sm text-gray-600 leading-relaxed">{addr.address}</p>
                            </div>
                            <div>
                                <button
                                    onClick={() => handleDelete(idx)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="ลบ"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            {/* Bottom Floating Action Button */}
            {!showForm && (
                <div className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-100 p-4 z-30">
                    <button
                        onClick={() => setShowForm(true)}
                        className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-bold py-3.5 rounded-full hover:bg-gray-800 transition-colors shadow-lg"
                    >
                        <Plus size={20} />
                        เพิ่มที่อยู่ใหม่
                    </button>
                </div>
            )}
        </div>
    );
}
