"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, MapPin, User, Phone, Book, CreditCard } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface SavedAddress {
    name: string;
    linename?: string;
    lineName?: string;
    phone: string;
    citizenId?: string;
    address: string;
    usedAt: string;
}

type SelectedShippingLocation = {
    id: string;
    name: string;
    address: string;
};

type ProfileWithLineName = {
    linename?: string;
    lineName?: string;
    displayName?: string;
    name?: string;
};

const getProfileLineName = (profile?: ProfileWithLineName | null) =>
    profile?.linename || profile?.lineName || profile?.displayName || profile?.name || "";

export default function CheckoutAddressPage() {
    const router = useRouter();
    const { userProfile } = useAuth();

    const [formData, setFormData] = useState({
        linename: "",
        name: "",
        phone: "",
        citizenId: "",
        address: ""
    });
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
    const [showSaved, setShowSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saveToBook, setSaveToBook] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState<SelectedShippingLocation | null>(null);

    // Load customer's saved addresses
    useEffect(() => {
        const loadCustomerData = async () => {
            const customerId = userProfile?.lineId || userProfile?.uid || userProfile?.id;

            // First check session storage
            const saved = sessionStorage.getItem('checkout_address');
            const savedLocation = sessionStorage.getItem('selected_shipping_location');
            let location: SelectedShippingLocation | null = null;
            const profileName = getProfileLineName(userProfile);
            if (savedLocation) {
                try {
                    location = JSON.parse(savedLocation) as SelectedShippingLocation;
                    setSelectedLocation(location);
                } catch {
                    sessionStorage.removeItem('selected_shipping_location');
                }
            }

            if (saved) {
                const parsed = JSON.parse(saved);
                parsed.linename = parsed.linename || parsed.lineName || profileName;
                parsed.name = parsed.name || "";
                if (location && !parsed.address) {
                    parsed.address = location.address;
                }
                setFormData(parsed);
            } else if (profileName) {
                setFormData(prev => ({
                    ...prev,
                    linename: profileName,
                    address: location?.address || prev.address
                }));
            } else if (location) {
                setFormData(prev => ({
                    ...prev,
                    address: location.address
                }));
            }

            // Load from Firestore if logged in (Only for Address Book)
            if (customerId) {
                try {
                    const customerRef = doc(db, "customers", customerId);
                    const customerSnap = await getDoc(customerRef);

                    if (customerSnap.exists()) {
                        const data = customerSnap.data();

                        // Set saved addresses from history
                        if (data.addressHistory && Array.isArray(data.addressHistory)) {
                            // Sort by usage date (newest first)
                            const sorted = [...data.addressHistory]
                                .sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime());
                            setSavedAddresses(sorted);
                        }
                    }
                } catch (err) {
                    console.error("Error loading customer data:", err);
                }
            }

            setLoading(false);
        };

        loadCustomerData();
    }, [userProfile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === "phone") {
            setFormData(prev => ({ ...prev, phone: value.replace(/\D/g, "").slice(0, 10) }));
            return;
        }
        if (name === "citizenId") {
            setFormData(prev => ({ ...prev, citizenId: value.replace(/\D/g, "").slice(0, 13) }));
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isFormValid) return;

        // Save to session for next steps
        const sessionData = {
            ...formData,
            linename: formData.linename.trim(),
            name: formData.name.trim(),
            saveToBook
        };
        sessionStorage.setItem('checkout_address', JSON.stringify(sessionData));

        // Save to Firestore History only if checked
        if (saveToBook) {
            const customerId = userProfile?.lineId || userProfile?.uid || userProfile?.id;
            if (customerId) {
                try {
                    // Check if address already exists in loaded savedAddresses
                    const isDuplicate = savedAddresses.some(addr =>
                        addr.name.trim() === formData.name.trim() &&
                        addr.phone.trim() === formData.phone.trim() &&
                        addr.address.trim() === formData.address.trim()
                    );

                    if (!isDuplicate) {
                        const customerRef = doc(db, "customers", customerId);
                        const addressEntry = {
                            linename: formData.linename.trim(),
                            name: formData.name.trim(),
                            phone: formData.phone.trim(),
                            ...(formData.citizenId.trim() ? { citizenId: formData.citizenId.trim() } : {}),
                            address: formData.address.trim(),
                            usedAt: new Date().toISOString()
                        };

                        await updateDoc(customerRef, {
                            addressHistory: arrayUnion(addressEntry)
                        });
                    }
                } catch (err) {
                    console.error("Error saving address history:", err);
                }
            }
        }

        router.push('/checkout/summary');
    };

    const selectSavedAddress = (addr: SavedAddress) => {
        if (selectedLocation) return;
        setFormData({
            linename: addr.linename || addr.lineName || formData.linename || getProfileLineName(userProfile),
            name: addr.name,
            phone: addr.phone,
            citizenId: addr.citizenId || formData.citizenId || "",
            address: addr.address
        });
        setShowSaved(false);
    };

    const isFormValid =
        formData.name.trim().length > 0 &&
        formData.phone.trim().length === 10 &&
        formData.citizenId.trim().length === 13 &&
        formData.address.trim().length > 0;

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen bg-gray-50">
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white px-4 py-3 sticky top-0 z-20 border-b border-gray-100">


                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-2 mt-4 pb-1">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">1</div>
                        <span className="text-xs font-medium text-gray-900">ที่อยู่</span>
                    </div>
                    <div className="w-8 h-0.5 bg-gray-200"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-xs font-bold">2</div>
                        <span className="text-xs font-medium text-gray-400">สรุปรายการ</span>
                    </div>
                    <div className="w-8 h-0.5 bg-gray-200"></div>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-xs font-bold">3</div>
                        <span className="text-xs font-medium text-gray-400">ชำระเงิน</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 p-4 pb-28 space-y-4">
                {/* Saved Addresses */}
                {savedAddresses.length > 0 && !selectedLocation && (
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <button
                            onClick={() => setShowSaved(!showSaved)}
                            className="w-full px-4 py-3 flex items-center justify-between text-left"
                        >
                            <div className="flex items-center gap-2">
                                <Book size={16} className="text-gray-400" />
                                <span className="text-sm font-medium text-gray-700">สมุดที่อยู่ ({savedAddresses.length})</span>
                            </div>
                            <ChevronLeft size={18} className={`text-gray-400 transition-transform ${showSaved ? 'rotate-90' : '-rotate-90'}`} />
                        </button>

                        {showSaved && (
                            <div className="border-t border-gray-100 divide-y divide-gray-50">
                                {savedAddresses.map((addr, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => selectSavedAddress(addr)}
                                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                                    >
                                        <p className="font-medium text-sm text-gray-900">{addr.name}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{addr.phone}</p>
                                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{addr.address}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Form */}
                <form id="address-form" onSubmit={handleSubmit} className="space-y-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-100 space-y-5">
                        {/* LINE name */}
                        <div>
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                <User size={14} className="text-gray-400" />
                                <span>LINE Name</span>
                                <span className="min-w-0 truncate text-sm font-medium normal-case tracking-normal text-gray-500">
                                    {formData.linename || "-"}
                                </span>
                            </div>
                        </div>

                        {/* Name */}
                        <div>
                            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-2">
                                <User size={14} className="text-gray-400" />
                                ชื่อ-นามสกุล
                            </label>
                            <input
                                required
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="เช่น นายสมชาย ใจดี"
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition-all"
                            />
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-2">
                                <Phone size={14} className="text-gray-400" />
                                เบอร์โทรศัพท์
                            </label>
                            <input
                                required
                                type="tel"
                                inputMode="numeric"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                maxLength={10}
                                placeholder="เช่น 0812345678"
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition-all"
                            />
                            <p className="mt-1 text-[11px] text-gray-400">กรอกเบอร์โทร 10 หลัก</p>
                        </div>

                        {/* Citizen ID */}
                        <div>
                            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-2">
                                <CreditCard size={14} className="text-gray-400" />
                                เลขบัตรประชาชน
                            </label>
                            <input
                                required
                                inputMode="numeric"
                                type="text"
                                name="citizenId"
                                value={formData.citizenId}
                                onChange={handleChange}
                                maxLength={13}
                                placeholder="เช่น 1234567890123"
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition-all"
                            />
                            <p className="mt-1 text-[11px] text-gray-400">กรอกเฉพาะตัวเลข 13 หลัก หากต้องใช้สำหรับยืนยันตัวตน</p>
                        </div>

                        {/* Address */}
                        <div>
                            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2 mb-2">
                                <MapPin size={14} className="text-gray-400" />
                                {selectedLocation ? "สถานที่รับสินค้า" : "ที่อยู่จัดส่ง"}
                            </label>
                            {selectedLocation && (
                                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                    <p className="text-xs text-gray-400">เลือกจากรูปแบบการจัดส่ง</p>
                                    <p className="text-sm font-semibold text-gray-900">{selectedLocation.name}</p>
                                </div>
                            )}
                            <textarea
                                required
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                rows={4}
                                placeholder="บ้านเลขที่, ถนน, แขวง/ตำบล, เขต/อำเภอ, จังหวัด, รหัสไปรษณีย์"
                                className="w-full border border-gray-200 rounded-lg bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 transition-all resize-none"
                            />
                        </div>

                        {/* Save to Book Checkbox */}
                        {!selectedLocation && (
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-50 mt-2">
                            <input
                                type="checkbox"
                                id="saveToBook"
                                checked={saveToBook}
                                onChange={(e) => setSaveToBook(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                            />
                            <label htmlFor="saveToBook" className="text-sm text-gray-600 cursor-pointer select-none">
                                บันทึกที่อยู่นี้ลงสมุดที่อยู่
                            </label>
                        </div>
                        )}
                    </div>
                </form>
            </main>

            {/* Bottom Button */}
            <div className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-100 px-4 py-3 pb-6 z-30">
                <button
                    form="address-form"
                    type="submit"
                    disabled={!isFormValid}
                    className={`w-full py-3.5 rounded-full font-bold text-base transition-all ${isFormValid
                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    ถัดไป
                </button>
            </div>
        </div>
    );
}
