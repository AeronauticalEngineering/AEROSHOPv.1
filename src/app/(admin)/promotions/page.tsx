"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Plus, Pencil, Trash2, Search, X, Tag, Percent, Gift,
    Calendar, Users, Copy, Check, Loader2, ChevronLeft, ChevronRight,
    Ticket, Clock, Ban, CheckCircle, Megaphone
} from "lucide-react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { format } from "date-fns";
import { th } from "date-fns/locale";

interface Promotion {
    id: string;
    type: 'coupon' | 'auto'; // coupon = ต้องใส่รหัส, auto = อัตโนมัติ
    code?: string;
    name: string;
    description: string;
    discountType: 'percentage' | 'fixed'
    discountValue: number;
    minPurchase: number;
    maxDiscount: number | null;
    usageLimit: number | null;
    usedCount: number;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    createdAt: Date;
}

type PromotionSettings = {
    couponsEnabled: boolean;
    autoPromotionsEnabled: boolean;
};

const promotionSchema = z.object({
    type: z.enum(['coupon', 'auto']),
    code: z.string().optional(),
    name: z.string().min(1, "กรุณาระบุชื่อโปรโมชั่น"),
    description: z.string().optional(),
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: z.coerce.number().min(1, "กรุณาระบุส่วนลด"),
    minPurchase: z.coerce.number().min(0),
    maxDiscount: z.preprocess(
        (val) => (val === "" || val === null || val === undefined ? null : Number(val)),
        z.number().min(0).nullable()
    ),
    usageLimit: z.preprocess(
        (val) => (val === "" || val === null || val === undefined ? null : Number(val)),
        z.number().min(0).nullable()
    ),
    startDate: z.string(),
    endDate: z.string(),
    isActive: z.boolean()
}).superRefine((data, ctx) => {
    if (data.type === 'coupon') {
        if (!data.code || data.code.length < 3) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "รหัสคูปองต้องมีอย่างน้อย 3 ตัวอักษร",
                path: ["code"]
            });
        }
    }
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        if (end < start) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "วันหมดอายุต้องไม่น้อยกว่าวันเริ่มใช้งาน",
                path: ["endDate"]
            });
        }
    }
});

type PromotionForm = z.infer<typeof promotionSchema>;

export default function PromotionsPage() {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'inactive'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null);
    const [deletingPromotionId, setDeletingPromotionId] = useState<string | null>(null);
    const [promotionSettings, setPromotionSettings] = useState<PromotionSettings>({
        couponsEnabled: true,
        autoPromotionsEnabled: true
    });
    const [savingSettingKey, setSavingSettingKey] = useState<keyof PromotionSettings | null>(null);
    const [togglingPromotionId, setTogglingPromotionId] = useState<string | null>(null);
    const itemsPerPage = 10;

    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<PromotionForm>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(promotionSchema) as any,
        defaultValues: {
            type: 'coupon',
            discountType: 'percentage',
            discountValue: 10,
            minPurchase: 0,
            isActive: true,
            startDate: format(new Date(), 'yyyy-MM-dd'),
            endDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
        }
    });

    const discountType = watch("discountType");
    const promoType = watch("type");

    useEffect(() => {
        const q = query(collection(db, "promotions"), orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                startDate: doc.data().startDate?.toDate() || new Date(),
                endDate: doc.data().endDate?.toDate() || new Date(),
                createdAt: doc.data().createdAt?.toDate() || new Date()
            })) as Promotion[];
            setPromotions(items);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, "settings", "promotion"), (snapshot) => {
            if (!snapshot.exists()) {
                setPromotionSettings({
                    couponsEnabled: true,
                    autoPromotionsEnabled: true
                });
                return;
            }
            const data = snapshot.data();
            setPromotionSettings({
                couponsEnabled: data.couponsEnabled !== false,
                autoPromotionsEnabled: data.autoPromotionsEnabled !== false
            });
        });
        return () => unsubscribe();
    }, []);

    const generateCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setValue("code", code);
    };

    const copyCode = (code: string, id: string) => {
        navigator.clipboard.writeText(code);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const openModal = (promotion?: Promotion) => {
        if (promotion) {
            setEditingPromotion(promotion);
            reset({
                type: promotion.type,
                code: promotion.code,
                name: promotion.name,
                description: promotion.description || "",
                discountType: promotion.discountType,
                discountValue: promotion.discountValue,
                minPurchase: promotion.minPurchase,
                maxDiscount: promotion.maxDiscount,
                usageLimit: promotion.usageLimit,
                startDate: format(promotion.startDate, 'yyyy-MM-dd'),
                endDate: format(promotion.endDate, 'yyyy-MM-dd'),
                isActive: promotion.isActive !== false
            });
        } else {
            setEditingPromotion(null);
            reset({
                type: 'coupon',
                code: "",
                name: "",
                description: "",
                discountType: 'percentage',
                discountValue: 10,
                minPurchase: 0,
                maxDiscount: null,
                usageLimit: null,
                startDate: format(new Date(), 'yyyy-MM-dd'),
                endDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
                isActive: true
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingPromotion(null);
        reset();
    };

    const onSubmit = async (data: PromotionForm) => {
        setIsSaving(true);
        try {
            const promotionData = {
                type: data.type,
                code: data.type === 'coupon' ? data.code?.toUpperCase() : null,
                name: data.name,
                description: data.description || "",
                discountType: data.discountType,
                discountValue: data.discountValue,
                minPurchase: data.minPurchase,
                maxDiscount: data.maxDiscount || null,
                usageLimit: data.usageLimit || null,
                startDate: new Date(data.startDate),
                endDate: new Date(data.endDate),
                isActive: data.isActive,
                updatedAt: serverTimestamp()
            };

            if (editingPromotion) {
                await updateDoc(doc(db, "promotions", editingPromotion.id), promotionData);
            } else {
                await addDoc(collection(db, "promotions"), {
                    ...promotionData,
                    usedCount: 0,
                    createdAt: serverTimestamp()
                });
            }
            closeModal();
        } catch (error) {
            console.error("Error saving promotion:", error);
        }
        setIsSaving(false);
    };

    const openDeleteConfirm = (promotion: Promotion) => {
        if (deletingPromotionId) return;
        setDeleteTarget(promotion);
        setIsDeleteConfirmOpen(true);
    };

    const closeDeleteConfirm = () => {
        if (deletingPromotionId) return;
        setIsDeleteConfirmOpen(false);
        setDeleteTarget(null);
    };

    const deletePromotion = async (id: string) => {
        try {
            setDeletingPromotionId(id);
            await deleteDoc(doc(db, "promotions", id));
        } finally {
            setDeletingPromotionId(null);
        }
    };

    const confirmDeletePromotion = async () => {
        if (!deleteTarget) return;
        await deletePromotion(deleteTarget.id);
        closeDeleteConfirm();
    };

    const updatePromotionSetting = async (key: keyof PromotionSettings, value: boolean) => {
        try {
            setSavingSettingKey(key);
            await setDoc(doc(db, "settings", "promotion"), {
                ...promotionSettings,
                [key]: value,
                updatedAt: serverTimestamp()
            }, { merge: true });
        } finally {
            setSavingSettingKey(null);
        }
    };

    const togglePromotionActive = async (promotion: Promotion) => {
        try {
            setTogglingPromotionId(promotion.id);
            await updateDoc(doc(db, "promotions", promotion.id), {
                isActive: promotion.isActive === false,
                updatedAt: serverTimestamp()
            });
        } finally {
            setTogglingPromotionId(null);
        }
    };

    const getStatus = (promo: Promotion) => {
        const now = new Date();
        if (promo.isActive === false) return { label: "ปิดใช้งาน", color: "bg-gray-100 text-gray-600", icon: Ban };
        if (now < promo.startDate) return { label: "รอเริ่ม", color: "bg-blue-100 text-blue-700", icon: Clock };
        if (now > promo.endDate) return { label: "หมดอายุ", color: "bg-red-100 text-red-700", icon: Ban };
        if (promo.usageLimit && promo.usedCount >= promo.usageLimit) return { label: "ใช้ครบแล้ว", color: "bg-orange-100 text-orange-700", icon: CheckCircle };
        return { label: "ใช้งานได้", color: "bg-green-100 text-green-700", icon: CheckCircle };
    };

    // Filter and paginate
    const filteredPromotions = useMemo(() => {
        return promotions.filter(promo => {
            const matchesSearch = (promo.code || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                promo.name.toLowerCase().includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;

            const status = getStatus(promo);
            if (filterStatus === 'all') return true;
            if (filterStatus === 'active') return status.label === "ใช้งานได้";
            if (filterStatus === 'expired') return status.label === "หมดอายุ";
            if (filterStatus === 'inactive') return status.label === "ปิดใช้งาน";
            return true;
        });
    }, [promotions, searchTerm, filterStatus]);

    const totalPages = Math.ceil(filteredPromotions.length / itemsPerPage);
    const paginatedPromotions = filteredPromotions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Stats
    const stats = {
        total: promotions.length,
        active: promotions.filter(p => getStatus(p).label === "ใช้งานได้").length,
        expired: promotions.filter(p => getStatus(p).label === "หมดอายุ").length,
        totalUsed: promotions.reduce((sum, p) => sum + (p.usedCount || 0), 0)
    };

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">โปรโมชั่น</h1>
                    <p className="text-sm text-gray-500">{promotions.length} รายการ</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-gray-800"
                >
                    <Plus size={16} />
                    สร้างโปรโมชั่น
                </button>
            </div>

            {/* Promotion System Status */}
            <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${promotionSettings.couponsEnabled ? "bg-orange-50 text-orange-600" : "bg-gray-100 text-gray-400"}`}>
                            <Ticket size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">คูปองส่วนลด</p>
                            <p className="text-xs text-gray-500">
                                {promotionSettings.couponsEnabled ? "แสดงช่องใส่คูปองในหน้าตะกร้า" : "ซ่อนช่องใส่คูปองในหน้าตะกร้า"}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => updatePromotionSetting("couponsEnabled", !promotionSettings.couponsEnabled)}
                        disabled={savingSettingKey === "couponsEnabled"}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${promotionSettings.couponsEnabled ? "bg-gray-900" : "bg-gray-200"}`}
                        aria-label="เปิดปิดคูปอง"
                    >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${promotionSettings.couponsEnabled ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${promotionSettings.autoPromotionsEnabled ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                            <Megaphone size={18} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">โปรโมชั่นอัตโนมัติ</p>
                            <p className="text-xs text-gray-500">
                                {promotionSettings.autoPromotionsEnabled ? "แสดงและคำนวณส่วนลดอัตโนมัติ" : "ปิดการแสดงและคำนวณส่วนลดอัตโนมัติ"}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => updatePromotionSetting("autoPromotionsEnabled", !promotionSettings.autoPromotionsEnabled)}
                        disabled={savingSettingKey === "autoPromotionsEnabled"}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${promotionSettings.autoPromotionsEnabled ? "bg-gray-900" : "bg-gray-200"}`}
                        aria-label="เปิดปิดโปรโมชั่นอัตโนมัติ"
                    >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${promotionSettings.autoPromotionsEnabled ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                        <Ticket size={14} /> ทั้งหมด
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-green-500 text-xs mb-2">
                        <CheckCircle size={14} /> ใช้งานได้
                    </div>
                    <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-red-500 text-xs mb-2">
                        <Ban size={14} /> หมดอายุ
                    </div>
                    <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-blue-500 text-xs mb-2">
                        <Users size={14} /> ใช้ไปแล้ว
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{stats.totalUsed} ครั้ง</p>
                </div>
            </div>

            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="ค้นหารหัสหรือชื่อ..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    />
                </div>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                    {(['all', 'active', 'expired', 'inactive'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => { setFilterStatus(status); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${filterStatus === status ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                                }`}
                        >
                            {status === 'all' ? 'ทั้งหมด' : status === 'active' ? 'ใช้งานได้' : status === 'expired' ? 'หมดอายุ' : 'ปิดใช้งาน'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="animate-spin text-gray-400" size={24} />
                    </div>
                ) : paginatedPromotions.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Ticket size={40} className="mx-auto mb-2 opacity-50" />
                        <p>ไม่พบโปรโมชั่น</p>
                    </div>
                ) : (
                    <>
                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
                            <div className="col-span-2">รูปแบบ/รหัส</div>
                            <div className="col-span-3">ชื่อ</div>
                            <div className="col-span-2">ส่วนลด</div>
                            <div className="col-span-2">ระยะเวลา</div>
                            <div className="col-span-1 text-center">ใช้แล้ว</div>
                            <div className="col-span-1">สถานะ</div>
                            <div className="col-span-1"></div>
                        </div>

                        {/* Table Body */}
                        {paginatedPromotions.map(promo => {
                            const status = getStatus(promo);
                            const StatusIcon = status.icon;
                            return (
                                <div key={promo.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 items-center">
                                    <div className="col-span-2">
                                        {promo.type === 'coupon' ? (
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded text-gray-700 font-mono text-xs font-bold border border-gray-200">
                                                    <Ticket size={12} className="text-gray-500" />
                                                    {promo.code}
                                                </div>
                                                <button
                                                    onClick={() => copyCode(promo.code || "", promo.id)}
                                                    className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                                                >
                                                    {copiedId === promo.id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 rounded text-blue-700 font-medium text-xs border border-blue-100">
                                                    <Megaphone size={12} />
                                                    อัตโนมัติ
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-span-3">
                                        <p className="font-medium text-sm text-gray-900 truncate">{promo.name}</p>
                                        {promo.description && <p className="text-xs text-gray-400 truncate">{promo.description}</p>}
                                    </div>
                                    <div className="col-span-2">
                                        <div className="flex items-center gap-1">
                                            {promo.discountType === 'percentage' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded-full">
                                                    <Percent size={10} /> {promo.discountValue}%
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                                                    ฿{promo.discountValue.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                        {promo.minPurchase > 0 && (
                                            <p className="text-xs text-gray-400 mt-0.5">ขั้นต่ำ ฿{promo.minPurchase.toLocaleString()}</p>
                                        )}
                                    </div>
                                    <div className="col-span-2 text-xs text-gray-500">
                                        <p>{format(promo.startDate, 'd MMM', { locale: th })} - {format(promo.endDate, 'd MMM yy', { locale: th })}</p>
                                    </div>
                                    <div className="col-span-1 text-center">
                                        <span className="text-sm font-bold text-gray-900">
                                            {promo.usedCount || 0}
                                            {promo.usageLimit && <span className="text-gray-400 font-normal">/{promo.usageLimit}</span>}
                                        </span>
                                    </div>
                                    <div className="col-span-1">
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                                            <StatusIcon size={10} />
                                            {status.label}
                                        </span>
                                    </div>
                                    <div className="col-span-1 flex justify-end gap-1">
                                        <button
                                            type="button"
                                            onClick={() => togglePromotionActive(promo)}
                                            disabled={togglingPromotionId === promo.id}
                                            className={`h-8 rounded-full px-3 text-xs font-bold transition-colors disabled:opacity-60 ${promo.isActive === false
                                                ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                : "bg-green-50 text-green-700 hover:bg-green-100"
                                                }`}
                                            title={promo.isActive === false ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                                        >
                                            {promo.isActive === false ? "ปิด" : "เปิด"}
                                        </button>
                                        <button
                                            onClick={() => openModal(promo)}
                                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            onClick={() => openDeleteConfirm(promo)}
                                            className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
                                <span className="text-xs text-gray-500">
                                    แสดง {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredPromotions.length)} จาก {filteredPromotions.length}
                                </span>
                                <div className="flex items-center gap-1 text-sm">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="px-3 py-1">{currentPage} / {totalPages}</span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-xl overflow-hidden flex flex-col">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                            <span className="font-semibold text-sm text-gray-900">
                                {editingPromotion ? 'แก้ไขโปรโมชั่น' : 'สร้างคูปองใหม่'}
                            </span>
                            <button onClick={closeModal} className="p-1 hover:bg-gray-200 rounded">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-4">
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                {/* Type Selector */}
                                <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 rounded-lg">
                                    <button
                                        type="button"
                                        onClick={() => setValue("type", "coupon")}
                                        className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${promoType === 'coupon' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        <Ticket size={16} />
                                        คูปองส่วนลด
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setValue("type", "auto")}
                                        className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${promoType === 'auto' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        <Megaphone size={16} />
                                        โปรโมชั่นอัตโนมัติ
                                    </button>
                                </div>

                                {/* Code - Show only if Coupon */}
                                {promoType === 'coupon' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">รหัสคูปอง *</label>
                                        <div className="flex gap-2">
                                            <input
                                                {...register("code")}
                                                placeholder="เช่น SALE50"
                                                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                            />
                                            <button
                                                type="button"
                                                onClick={generateCode}
                                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700"
                                            >
                                                สุ่มรหัส
                                            </button>
                                        </div>
                                        {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>}
                                    </div>
                                )}

                                {/* Name */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อโปรโมชั่น *</label>
                                    <input
                                        {...register("name")}
                                        placeholder="เช่น ลด 50% ต้อนรับปีใหม่"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                    />
                                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">รายละเอียด</label>
                                    <textarea
                                        {...register("description")}
                                        rows={2}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-y"
                                    />
                                </div>

                                {/* Discount Type & Value */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">ประเภทส่วนลด</label>
                                        <select
                                            {...register("discountType")}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                        >
                                            <option value="percentage">ลดเปอร์เซ็นต์ (%)</option>
                                            <option value="fixed">ลดเงินบาท (฿)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                                            {discountType === 'percentage' ? 'เปอร์เซ็นต์ส่วนลด' : 'จำนวนเงินส่วนลด'}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                {...register("discountValue")}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 pr-8"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                                {discountType === 'percentage' ? '%' : '฿'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Min Purchase & Max Discount */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">ยอดสั่งซื้อขั้นต่ำ</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">฿</span>
                                            <input
                                                type="number"
                                                {...register("minPurchase")}
                                                className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                            />
                                        </div>
                                    </div>
                                    {discountType === 'percentage' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 mb-1">ส่วนลดสูงสุด</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">฿</span>
                                                <input
                                                    type="number"
                                                    {...register("maxDiscount")}
                                                    placeholder="ไม่จำกัด"
                                                    className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Dates */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">เริ่มใช้งาน</label>
                                        <input
                                            type="date"
                                            {...register("startDate")}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">หมดอายุ</label>
                                        <input
                                            type="date"
                                            {...register("endDate")}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                        />
                                    </div>
                                </div>

                                {/* Usage Limit */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">จำกัดการใช้งาน (ครั้ง)</label>
                                    <input
                                        type="number"
                                        {...register("usageLimit")}
                                        placeholder="ไม่จำกัด"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                    />
                                </div>

                                {/* Active Toggle */}
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <span className="text-sm text-gray-700">เปิดใช้งาน</span>
                                    <input type="checkbox" {...register("isActive")} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20" />
                                </div>

                                {/* Submit */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="flex-1 py-2 border border-gray-200 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="flex-1 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Tag size={16} />}
                                        {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteConfirmOpen && deleteTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <h3 className="font-semibold text-gray-900 text-sm">ลบโปรโมชั่น</h3>
                            <button onClick={closeDeleteConfirm} className="p-1 hover:bg-gray-100 rounded">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 bg-[#F8F9FA] space-y-2">
                            <p className="text-sm text-gray-700">
                                ต้องการลบโปรโมชั่น {deleteTarget.name} ใช่หรือไม่?
                            </p>
                            <p className="text-xs text-red-600">ลบแล้วไม่สามารถกู้คืนได้</p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
                            <button
                                onClick={closeDeleteConfirm}
                                className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                disabled={deletingPromotionId === deleteTarget.id}
                            >
                                ปิด
                            </button>
                            <button
                                onClick={confirmDeletePromotion}
                                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                                disabled={deletingPromotionId === deleteTarget.id}
                            >
                                {deletingPromotionId === deleteTarget.id ? "กำลังลบ..." : "ยืนยันลบ"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
