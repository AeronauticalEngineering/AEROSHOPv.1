"use client";

import { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { StoreSettings } from "@/types/store";
import { Save, CreditCard, Truck, Upload, QrCode, Loader2, Check, Banknote, Globe } from "lucide-react";

export default function PaymentSettingsPage() {
    const [settings, setSettings] = useState<Partial<StoreSettings>>({
        enableBankTransfer: true,
        enablePromptPay: true,
        enableCOD: true,
        enableSlipVerify: false,
        slipokBranchId: "",
        slipokApiKey: "",
        bankName: "",
        bankAccountName: "",
        bankAccountNumber: "",
        promptPayQrUrl: "",
        promptPayId: "",
        enableStripe: false,
        stripePublishableKey: "",
        stripeSecretKey: "",
        enableOmise: false,
        omisePublicKey: "",
        omiseSecretKey: "",
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [qrFile, setQrFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, "settings", "store");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data() as StoreSettings;
                    setSettings({
                        enableBankTransfer: data.enableBankTransfer ?? true,
                        enablePromptPay: data.enablePromptPay ?? true,
                        enableCOD: data.enableCOD ?? true,
                        enableSlipVerify: data.enableSlipVerify ?? false,
                        slipokBranchId: data.slipokBranchId || "",
                        slipokApiKey: data.slipokApiKey || "",
                        bankName: data.bankName || "",
                        bankAccountName: data.bankAccountName || "",
                        bankAccountNumber: data.bankAccountNumber || "",
                        promptPayQrUrl: data.promptPayQrUrl || "",
                        promptPayId: data.promptPayId || "",
                        enableStripe: data.enableStripe || false,
                        stripePublishableKey: data.stripePublishableKey || "",
                        stripeSecretKey: data.stripeSecretKey || "",
                        enableOmise: data.enableOmise || false,
                        omisePublicKey: data.omisePublicKey || "",
                        omiseSecretKey: data.omiseSecretKey || "",
                    });
                    if (data.promptPayQrUrl) setPreviewUrl(data.promptPayQrUrl);
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setQrFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            let qrUrl = settings.promptPayQrUrl;

            // Upload QR Code if new file selected
            if (qrFile) {
                const storageRef = ref(storage, `settings/promptpay-qr-${Date.now()}`);
                await uploadBytes(storageRef, qrFile);
                qrUrl = await getDownloadURL(storageRef);
            }

            const docRef = doc(db, "settings", "store");
            await setDoc(docRef, {
                ...settings,
                promptPayQrUrl: qrUrl,
                updatedAt: serverTimestamp()
            }, { merge: true });

            setSettings(prev => ({ ...prev, promptPayQrUrl: qrUrl }));
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-gray-400" size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">ตั้งค่าการชำระเงิน</h1>
                    <p className="text-sm text-gray-500">จัดการช่องทางการชำระเงินของร้านค้า</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${showSuccess
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                        } disabled:opacity-50`}
                >
                    {isSaving ? (
                        <Loader2 className="animate-spin" size={16} />
                    ) : showSuccess ? (
                        <Check size={16} />
                    ) : (
                        <Save size={16} />
                    )}
                    {showSuccess ? 'บันทึกแล้ว' : 'บันทึก'}
                </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                {/* Bank Transfer Section */}
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                                <Banknote size={18} />
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900">โอนเงินผ่านบัญชีธนาคาร</h2>
                                <p className="text-xs text-gray-500">Bank Transfer</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                name="enableBankTransfer"
                                checked={settings.enableBankTransfer}
                                onChange={handleChange}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {settings.enableBankTransfer && (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Bank Details */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <CreditCard size={16} /> รายละเอียดบัญชี
                                </h3>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อธนาคาร</label>
                                    <input
                                        type="text"
                                        name="bankName"
                                        value={settings.bankName}
                                        onChange={handleChange}
                                        placeholder="เช่น กสิกรไทย, ไทยพาณิชย์"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">เลขที่บัญชี</label>
                                    <input
                                        type="text"
                                        name="bankAccountNumber"
                                        value={settings.bankAccountNumber}
                                        onChange={handleChange}
                                        placeholder="xxx-x-xxxxx-x"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อบัญชี</label>
                                    <input
                                        type="text"
                                        name="bankAccountName"
                                        value={settings.bankAccountName}
                                        onChange={handleChange}
                                        placeholder="ชื่อ-นามสกุล หรือ บริษัท"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                    />
                                </div>
                            </div>

                        </div>
                    )}
                </section>

                {/* PromptPay Section */}
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                                <QrCode size={18} />
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900">พร้อมเพย์ (PromptPay)</h2>
                                <p className="text-xs text-gray-500">QR Code / PromptPay ID</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                name="enablePromptPay"
                                checked={settings.enablePromptPay}
                                onChange={handleChange}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                    </div>

                    {settings.enablePromptPay && (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <QrCode size={16} /> รายละเอียดพร้อมเพย์
                                </h3>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">PromptPay ID (เบอร์โทร/เลขผู้เสียภาษี)</label>
                                    <input
                                        type="text"
                                        name="promptPayId"
                                        value={settings.promptPayId}
                                        onChange={handleChange}
                                        placeholder="08xxxxxxxx หรือ 1xxxxxxxxxxxx"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                    <Upload size={16} /> QR Code (PromptPay)
                                </h3>
                                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors h-[250px] relative">
                                    {previewUrl ? (
                                        <div className="relative w-full h-full flex items-center justify-center">
                                            <img
                                                src={previewUrl}
                                                alt="QR Code Preview"
                                                className="max-h-full max-w-full object-contain"
                                            />
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                                                >
                                                    <Upload size={16} /> เปลี่ยนรูปภาพ
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                                                <Upload size={24} />
                                            </div>
                                            <p className="text-sm font-medium text-gray-900">อัปโหลดรูปภาพ QR Code</p>
                                            <p className="text-xs text-gray-500 mt-1">รองรับ JPG, PNG</p>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept="image/*"
                                        className="hidden"
                                    />
                                </div>
                                <p className="text-xs text-center text-gray-400 mt-2">
                                    *แนะนำให้ใช้รูปที่มีแต่ QR Code อย่างเดียวเพื่อความชัดเจน
                                </p>
                            </div>
                        </div>
                    )}
                </section>

                {/* Slip Verification Section */}
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                                <Check size={18} />
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900">Slip Verification (SlipOK)</h2>
                                <p className="text-xs text-gray-500">Automatic slip verification</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                name="enableSlipVerify"
                                checked={settings.enableSlipVerify}
                                onChange={handleChange}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                        </label>
                    </div>
                    {settings.enableSlipVerify && (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">SlipOK Branch ID</label>
                                <input
                                    type="text"
                                    name="slipokBranchId"
                                    value={settings.slipokBranchId}
                                    onChange={handleChange}
                                    placeholder="Branch ID"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">SlipOK API Key</label>
                                <input
                                    type="password"
                                    name="slipokApiKey"
                                    value={settings.slipokApiKey}
                                    onChange={handleChange}
                                    placeholder="API Key"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                />
                            </div>
                        </div>
                    )}
                </section>

                {/* COD Section */}
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                                <Truck size={18} />
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900">เก็บเงินปลายทาง (COD)</h2>
                                <p className="text-xs text-gray-500">Cash on Delivery</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                name="enableCOD"
                                checked={settings.enableCOD}
                                onChange={handleChange}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                        </label>
                    </div>
                    {settings.enableCOD && (
                        <div className="p-6">
                            <p className="text-sm text-gray-600 flex items-center gap-2">
                                <Check size={16} className="text-green-500" />
                                เปิดใช้งานการเก็บเงินปลายทางแล้ว
                            </p>
                        </div>
                    )}
                </section>

                {/* Payment Gateways Section */}
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
                        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                            <Globe size={18} />
                        </div>
                        <div>
                            <h2 className="font-semibold text-gray-900">Payment Gateway</h2>
                            <p className="text-xs text-gray-500">Stripe, Omise</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-8">
                        {/* Stripe */}
                        <div className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-800">Stripe</span>
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">Global</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="enableStripe"
                                        checked={settings.enableStripe}
                                        onChange={handleChange}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                </label>
                            </div>
                            {settings.enableStripe && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Publishable Key</label>
                                        <input
                                            type="text"
                                            name="stripePublishableKey"
                                            value={settings.stripePublishableKey}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Secret Key</label>
                                        <input
                                            type="password"
                                            name="stripeSecretKey"
                                            value={settings.stripeSecretKey}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Omise */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-800">Omise</span>
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">Thailand</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="enableOmise"
                                        checked={settings.enableOmise}
                                        onChange={handleChange}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                            {settings.enableOmise && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Public Key</label>
                                        <input
                                            type="text"
                                            name="omisePublicKey"
                                            value={settings.omisePublicKey}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Secret Key</label>
                                        <input
                                            type="password"
                                            name="omiseSecretKey"
                                            value={settings.omiseSecretKey}
                                            onChange={handleChange}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </form>
        </div>
    );
}
