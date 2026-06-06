"use client";

import { useEffect, useState } from "react";
import { CreditCard, Home, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";

interface AddressItem {
    linename?: string;
    lineName?: string;
    name: string;
    phone: string;
    citizenId?: string;
    address: string;
    usedAt: string;
}

type ProfileWithLineName = {
    linename?: string;
    lineName?: string;
    displayName?: string;
    name?: string;
};

const getProfileLineName = (profile?: ProfileWithLineName | null) =>
    profile?.linename || profile?.lineName || profile?.displayName || profile?.name || "";

const normalizePhone = (value: string) => value.replace(/\D/g, "").slice(0, 10);
const normalizeCitizenId = (value: string) => value.replace(/\D/g, "").slice(0, 13);

export default function AddressBookPage() {
    const { userProfile } = useAuth();
    const [addresses, setAddresses] = useState<AddressItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [formData, setFormData] = useState({
        linename: "",
        name: "",
        phone: "",
        citizenId: "",
        address: ""
    });

    const getCustomerId = () => userProfile?.lineId || userProfile?.uid || userProfile?.id;

    const resetForm = () => {
        setFormData({
            linename: getProfileLineName(userProfile),
            name: "",
            phone: "",
            citizenId: "",
            address: ""
        });
        setEditingIndex(null);
    };

    const fetchAddresses = async () => {
        const customerId = getCustomerId();
        if (!customerId) {
            setLoading(false);
            return;
        }

        try {
            const docRef = doc(db, "customers", customerId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (Array.isArray(data.addressHistory)) {
                    const sorted = [...data.addressHistory].sort((a, b) =>
                        new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime()
                    ) as AddressItem[];
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
            resetForm();
            fetchAddresses();
            return;
        }

        const timer = setTimeout(() => setLoading(false), 2000);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile]);

    const handleDelete = async (indexToDelete: number) => {
        if (!confirm("ต้องการลบที่อยู่นี้?")) return;

        const customerId = getCustomerId();
        if (!customerId) return;

        const previousAddresses = addresses;
        const newAddresses = addresses.filter((_, idx) => idx !== indexToDelete);
        setAddresses(newAddresses);

        try {
            const docRef = doc(db, "customers", customerId);
            await updateDoc(docRef, {
                addressHistory: newAddresses
            });
        } catch (error) {
            console.error("Error deleting address:", error);
            alert("เกิดข้อผิดพลาดในการลบ");
            setAddresses(previousAddresses);
        }
    };

    const isFormValid =
        formData.name.trim().length > 0 &&
        formData.phone.trim().length === 10 &&
        formData.citizenId.trim().length === 13 &&
        formData.address.trim().length > 0;

    const startEdit = (address: AddressItem, index: number) => {
        setEditingIndex(index);
        setFormData({
            linename: address.linename || address.lineName || getProfileLineName(userProfile),
            name: address.name || "",
            phone: normalizePhone(address.phone || ""),
            citizenId: normalizeCitizenId(address.citizenId || ""),
            address: address.address || ""
        });
        setShowForm(true);
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!isFormValid || submitting) return;

        const customerId = getCustomerId();
        if (!customerId) return;

        setSubmitting(true);
        try {
            const newAddress: AddressItem = {
                linename: formData.linename.trim(),
                name: formData.name.trim(),
                phone: formData.phone.trim(),
                citizenId: formData.citizenId.trim(),
                address: formData.address.trim(),
                usedAt: new Date().toISOString()
            };

            const isDuplicate = addresses.some((addr, index) =>
                index !== editingIndex &&
                addr.name.trim() === newAddress.name &&
                addr.phone.trim() === newAddress.phone &&
                (addr.citizenId || "").trim() === (newAddress.citizenId || "").trim() &&
                addr.address.trim() === newAddress.address
            );
            const newAddresses = editingIndex == null
                ? (isDuplicate ? addresses : [newAddress, ...addresses])
                : addresses.map((addr, index) => index === editingIndex ? newAddress : addr);

            const docRef = doc(db, "customers", customerId);
            await setDoc(docRef, {
                id: customerId,
                name: newAddress.name,
                linename: newAddress.linename || null,
                phone: newAddress.phone,
                citizenId: newAddress.citizenId || null,
                address: newAddress.address,
                addressHistory: newAddresses
            }, { merge: true });

            setAddresses(newAddresses);
            setShowForm(false);
            resetForm();
        } catch (error) {
            console.error("Error adding address:", error);
            alert("เกิดข้อผิดพลาดในการบันทึก");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <Loader2 className="animate-spin text-gray-400" size={32} />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-gray-50">
            <main className="flex-1 space-y-4 p-4 pb-24">
                {showForm && (
                    <div className="mb-4 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
                        <h3 className="mb-4 font-bold text-gray-900">{editingIndex == null ? "เพิ่มที่อยู่ใหม่" : "แก้ไขที่อยู่"}</h3>
                        <form onSubmit={handleSave} className="space-y-3">
                            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">LINE Name</p>
                                <p className="mt-0.5 truncate text-sm font-medium text-gray-700">{formData.linename || "-"}</p>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-gray-500">ชื่อ-นามสกุล</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={(event) => setFormData(prev => ({ ...prev, name: event.target.value }))}
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="ระบุชื่อผู้รับ"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-gray-500">เบอร์โทรศัพท์</label>
                                <input
                                    required
                                    type="tel"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={formData.phone}
                                    onChange={(event) => setFormData(prev => ({ ...prev, phone: normalizePhone(event.target.value) }))}
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="08xxxxxxxx"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">กรอกเบอร์โทร 10 หลัก</p>
                            </div>

                            <div>
                                <label className="mb-1 flex items-center gap-1 text-xs text-gray-500">
                                    <CreditCard size={13} className="text-gray-400" />
                                    เลขบัตรประชาชน
                                </label>
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={13}
                                    value={formData.citizenId}
                                    onChange={(event) => setFormData(prev => ({ ...prev, citizenId: normalizeCitizenId(event.target.value) }))}
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="1234567890123"
                                />
                                <p className="mt-1 text-[11px] text-gray-400">กรอกเฉพาะตัวเลข 13 หลัก</p>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-gray-500">ที่อยู่จัดส่ง</label>
                                <textarea
                                    required
                                    rows={3}
                                    value={formData.address}
                                    onChange={(event) => setFormData(prev => ({ ...prev, address: event.target.value }))}
                                    className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                                    placeholder="บ้านเลขที่, ถนน..."
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false);
                                        resetForm();
                                    }}
                                    className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !isFormValid}
                                    className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {submitting ? "กำลังบันทึก..." : editingIndex == null ? "บันทึก" : "บันทึกการแก้ไข"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {!loading && addresses.length === 0 && !showForm && (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <MapPin size={48} className="mb-4 opacity-20" />
                        <p>ไม่มีที่อยู่ที่บันทึกไว้</p>
                    </div>
                )}

                <div className="space-y-3">
                    {addresses.map((addr, idx) => (
                        <div key={`${addr.usedAt}-${idx}`} className="group flex gap-4 rounded-xl border border-gray-100 bg-white p-4">
                            <div className="mt-1">
                                <Home size={18} className="text-gray-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-gray-900">{addr.name}</p>
                                <p className="mb-2 text-xs text-gray-500">{addr.phone}</p>
                                {addr.citizenId && (
                                    <p className="mb-2 text-xs text-gray-400">เลขบัตร: {addr.citizenId}</p>
                                )}
                                <p className="text-sm leading-relaxed text-gray-600">{addr.address}</p>
                            </div>
                            <div className="flex flex-col gap-1">
                                <button
                                    type="button"
                                    onClick={() => startEdit(addr, idx)}
                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
                                    title="แก้ไข"
                                >
                                    <Pencil size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(idx)}
                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                    title="ลบ"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </main>

            {!showForm && (
                <div className="fixed bottom-0 z-30 w-full max-w-md border-t border-gray-100 bg-white p-4">
                    <button
                        onClick={() => {
                            resetForm();
                            setShowForm(true);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 py-3.5 font-bold text-white shadow-lg transition-colors hover:bg-gray-800"
                    >
                        <Plus size={20} />
                        เพิ่มที่อยู่ใหม่
                    </button>
                </div>
            )}
        </div>
    );
}
