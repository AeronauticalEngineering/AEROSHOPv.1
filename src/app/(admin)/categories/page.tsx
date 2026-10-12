"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { AlertTriangle, BookOpen, CheckCircle, Edit3, Image as ImageIcon, Loader2, Plus, Save, Search, Tag, Trash2, Upload, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { ProductCategory } from "@/types/category";
import { Product, ProductGuide } from "@/types/product";

type CategoryForm = {
    name: string;
    noticeTitle: string;
    noticeText: string;
    noticeImageBase64: string;
    noticeImageUrl: string;
    noticeImageName: string;
    sortOrder: string;
    isActive: boolean;
};

const emptyForm: CategoryForm = {
    name: "",
    noticeTitle: "",
    noticeText: "",
    noticeImageBase64: "",
    noticeImageUrl: "",
    noticeImageName: "",
    sortOrder: "0",
    isActive: true
};

const normalizeImageUrl = (url: string) => {
    const value = url.trim();
    if (!value) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

export default function AdminCategoriesPage() {
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [productGuides, setProductGuides] = useState<ProductGuide[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);
    const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
    const [editingGuide, setEditingGuide] = useState<ProductGuide | null>(null);
    const [deleteGuideTarget, setDeleteGuideTarget] = useState<ProductGuide | null>(null);
    const [deletingGuideId, setDeletingGuideId] = useState<string | null>(null);
    const [guideSaving, setGuideSaving] = useState(false);
    const [guideError, setGuideError] = useState("");
    const [guideForm, setGuideForm] = useState({
        title: "",
        text: "",
        imageBase64: "",
        imageUrl: "",
        imageName: "",
        isActive: true
    });
    const [form, setForm] = useState<CategoryForm>(emptyForm);
    const [imageError, setImageError] = useState("");
    const [error, setError] = useState("");
    const [categorySearch, setCategorySearch] = useState("");

    useEffect(() => {
        const q = query(collection(db, "categories"), orderBy("sortOrder", "asc"), orderBy("name", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data()
            })) as ProductCategory[];
            setCategories(items);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "products"), orderBy("updatedAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data()
            })) as Product[];
            setProducts(items);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "product_guides"), orderBy("updatedAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((item) => ({
                id: item.id,
                ...item.data()
            })) as ProductGuide[];
            setProductGuides(items);
        });

        return () => unsubscribe();
    }, []);

    const stats = useMemo(() => {
        return {
            total: categories.length,
            active: categories.filter((category) => category.isActive !== false).length,
            withNotice: categories.filter((category) => category.noticeText?.trim()).length,
            guidesCount: productGuides.length
        };
    }, [categories, productGuides]);

    const filteredCategories = useMemo(() => {
        if (!categorySearch.trim()) return categories;
        const q = categorySearch.toLowerCase().trim();
        return categories.filter((cat) => cat.name.toLowerCase().includes(q));
    }, [categories, categorySearch]);

    const openCreate = () => {
        setEditingCategory(null);
        setForm(emptyForm);
        setError("");
    };

    const openEdit = (category: ProductCategory) => {
        setEditingCategory(category);
        setForm({
            name: category.name || "",
            noticeTitle: category.noticeTitle || "",
            noticeText: category.noticeText || "",
            noticeImageBase64: category.noticeImageBase64 || "",
            noticeImageUrl: category.noticeImageUrl || "",
            noticeImageName: category.noticeImageName || "",
            sortOrder: String(category.sortOrder ?? 0),
            isActive: category.isActive !== false
        });
        setImageError("");
        setError("");
    };

    const fileToBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
            reader.readAsDataURL(file);
        });

    const handleNoticeImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setImageError("");

        const maxBytes = 700 * 1024;
        if (file.size > maxBytes) {
            setImageError("ไฟล์ใหญ่เกินไป (จำกัด 700KB)");
            event.target.value = "";
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            setForm((prev) => ({
                ...prev,
                noticeImageBase64: base64,
                noticeImageName: file.name
            }));
        } catch (err) {
            console.error("Error reading category image:", err);
            setImageError("อ่านรูปภาพไม่สำเร็จ");
        } finally {
            event.target.value = "";
        }
    };

    const clearNoticeImage = () => {
        setForm((prev) => ({
            ...prev,
            noticeImageBase64: "",
            noticeImageUrl: "",
            noticeImageName: ""
        }));
        setImageError("");
    };

    const handleGuideImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const maxBytes = 700 * 1024;
        if (file.size > maxBytes) {
            setGuideError("ไฟล์ใหญ่เกินไป (จำกัด 700KB)");
            event.target.value = "";
            return;
        }

        try {
            const base64 = await fileToBase64(file);
            setGuideForm((prev) => ({ ...prev, imageBase64: base64, imageName: file.name }));
        } catch (err) {
            console.error("Error reading guide image:", err);
            setGuideError("อ่านรูปภาพไม่สำเร็จ");
        } finally {
            event.target.value = "";
        }
    };

    const clearGuideImage = () => {
        setGuideForm((prev) => ({ ...prev, imageBase64: "", imageUrl: "", imageName: "" }));
    };

    const openCreateGuide = () => {
        setEditingGuide(null);
        setGuideError("");
        setGuideForm({ title: "", text: "", imageBase64: "", imageUrl: "", imageName: "", isActive: true });
        setIsGuideModalOpen(true);
    };

    const openEditGuide = (guide: ProductGuide) => {
        setEditingGuide(guide);
        setGuideError("");
        setGuideForm({
            title: guide.title || "",
            text: guide.text || "",
            imageBase64: guide.imageBase64 || "",
            imageUrl: guide.imageUrl || "",
            imageName: guide.imageName || "",
            isActive: guide.isActive !== false
        });
        setIsGuideModalOpen(true);
    };

    const closeGuideModal = () => {
        setIsGuideModalOpen(false);
        setEditingGuide(null);
        setGuideError("");
        setGuideForm({ title: "", text: "", imageBase64: "", imageUrl: "", imageName: "", isActive: true });
    };

    const saveProductGuide = async (event: React.FormEvent) => {
        event.preventDefault();
        const title = guideForm.title.trim();
        if (!title) {
            setGuideError("กรุณากรอกหัวข้อคำแนะนำ");
            return;
        }

        setGuideSaving(true);
        setGuideError("");
        try {
            const payload = {
                title,
                text: guideForm.text.trim(),
                imageBase64: guideForm.imageBase64,
                imageUrl: guideForm.imageUrl.trim(),
                imageName: guideForm.imageName.trim(),
                isActive: guideForm.isActive,
                updatedAt: serverTimestamp()
            };

            if (editingGuide) {
                await updateDoc(doc(db, "product_guides", editingGuide.id), payload);
            } else {
                await addDoc(collection(db, "product_guides"), {
                    ...payload,
                    createdAt: serverTimestamp()
                });
            }

            closeGuideModal();
        } catch (err) {
            console.error("Error saving product guide:", err);
            setGuideError("บันทึกคำแนะนำไม่สำเร็จ");
        } finally {
            setGuideSaving(false);
        }
    };

    const closeDeleteGuideConfirm = () => {
        if (deletingGuideId) return;
        setDeleteGuideTarget(null);
    };

    const confirmDeleteGuide = async () => {
        if (!deleteGuideTarget || deletingGuideId) return;
        setDeletingGuideId(deleteGuideTarget.id);
        try {
            const affectedProducts = products.filter((product) => product.guideId === deleteGuideTarget.id);
            await Promise.all([
                deleteDoc(doc(db, "product_guides", deleteGuideTarget.id)),
                ...affectedProducts.map((product) =>
                    updateDoc(doc(db, "products", product.id), {
                        guideId: "",
                        updatedAt: serverTimestamp()
                    })
                )
            ]);
            setDeleteGuideTarget(null);
        } catch (err) {
            console.error("Error deleting product guide:", err);
            setGuideError("ลบคำแนะนำไม่สำเร็จ");
        } finally {
            setDeletingGuideId(null);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const name = form.name.trim();
        if (!name) {
            setError("กรุณากรอกชื่อหมวดหมู่");
            return;
        }

        const duplicate = categories.find((category) =>
            category.name.trim().toLowerCase() === name.toLowerCase() &&
            category.id !== editingCategory?.id
        );
        if (duplicate) {
            setError("มีหมวดหมู่นี้อยู่แล้ว");
            return;
        }

        setSaving(true);
        setError("");
        try {
            const payload = {
                name,
                noticeTitle: form.noticeTitle.trim(),
                noticeText: form.noticeText.trim(),
                noticeImageBase64: form.noticeImageBase64,
                noticeImageUrl: form.noticeImageUrl.trim(),
                noticeImageName: form.noticeImageName.trim(),
                sortOrder: Number(form.sortOrder) || 0,
                isActive: form.isActive,
                updatedAt: serverTimestamp()
            };

            if (editingCategory) {
                await updateDoc(doc(db, "categories", editingCategory.id), payload);
            } else {
                await addDoc(collection(db, "categories"), {
                    ...payload,
                    createdAt: serverTimestamp()
                });
            }

            setEditingCategory(null);
            setForm(emptyForm);
        } catch (err) {
            console.error("Error saving category:", err);
            setError("บันทึกหมวดหมู่ไม่สำเร็จ");
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteDoc(doc(db, "categories", deleteTarget.id));
            setDeleteTarget(null);
            if (editingCategory?.id === deleteTarget.id) {
                setEditingCategory(null);
                setForm(emptyForm);
            }
        } catch (err) {
            console.error("Error deleting category:", err);
            setError("ลบหมวดหมู่ไม่สำเร็จ");
        }
    };

    return (
        <div className="mx-auto max-w-7xl space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-3.5">
                <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                        <span>จัดการร้านค้า</span>
                        <span>/</span>
                        <span className="font-medium text-slate-900">หมวดหมู่และระเบียบ</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">หมวดหมู่สินค้าและระเบียบร้าน</h1>
                        <span className="inline-flex items-center rounded-full border border-slate-200/80 bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                            {categories.length} หมวดหมู่
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                        สร้างหมวดหมู่สินค้า กำหนดข้อความแจ้งเตือนระเบียบการสั่งซื้อ และคู่มือคำแนะนำสินค้าสำหรับหน้าร้าน
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={openCreateGuide}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                    >
                        <BookOpen size={13} className="text-slate-500" />
                        เพิ่มคำแนะนำสินค้า
                    </button>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 transition"
                    >
                        <Plus size={14} />
                        เพิ่มหมวดหมู่ใหม่
                    </button>
                </div>
            </div>

            {/* KPI Metrics */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">หมวดหมู่ทั้งหมด</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            <Tag size={12} />
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold tracking-tight text-slate-900">{stats.total}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">เปิดใช้งาน</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <CheckCircle size={12} />
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold tracking-tight text-emerald-600">{stats.active}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">มีระเบียบแจ้งเตือน</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            <AlertTriangle size={12} />
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold tracking-tight text-amber-600">{stats.withNotice}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-500">คำแนะนำสินค้า</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                            <BookOpen size={12} />
                        </div>
                    </div>
                    <p className="mt-1 font-mono text-lg font-bold tracking-tight text-sky-700">{stats.guidesCount}</p>
                </div>
            </div>

            {/* Main Grid: Form on Left, List on Right */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
                {/* Form Card */}
                <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden h-fit">
                    <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <Tag size={14} className="text-slate-500" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                                {editingCategory ? "แก้ไขหมวดหมู่" : "สร้างหมวดหมู่ใหม่"}
                            </span>
                        </div>
                        {editingCategory && (
                            <button
                                type="button"
                                onClick={openCreate}
                                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 transition"
                            >
                                + สร้างใหม่
                            </button>
                        )}
                    </div>
                    <div className="space-y-3 p-3.5">
                        {/* Name */}
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-600">
                                ชื่อหมวดหมู่ <span className="text-rose-500">*</span>
                            </label>
                            <input
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                placeholder="เช่น ชุดนักศึกษา, อุปกรณ์การเรียน"
                            />
                        </div>

                        {/* Sort Order & Active */}
                        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-slate-600">ลำดับแสดงผล (Sort Order)</label>
                                <input
                                    type="number"
                                    value={form.sortOrder}
                                    onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                                    className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                />
                            </div>
                            <label className="flex h-8 items-center gap-2 px-2.5 rounded-lg border border-slate-200/80 bg-slate-50/50 cursor-pointer select-none text-xs font-medium text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                                />
                                เปิดใช้งาน
                            </label>
                        </div>

                        {/* Notice Title */}
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-600">หัวข้อแจ้งเตือนระเบียบ</label>
                            <input
                                value={form.noticeTitle}
                                onChange={(event) => setForm((prev) => ({ ...prev, noticeTitle: event.target.value }))}
                                className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                placeholder="เช่น โปรดอ่านก่อนสั่งซื้อ"
                            />
                        </div>

                        {/* Notice Text */}
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-slate-600">ข้อความระเบียบ / เงื่อนไข</label>
                            <textarea
                                value={form.noticeText}
                                onChange={(event) => setForm((prev) => ({ ...prev, noticeText: event.target.value }))}
                                rows={4}
                                className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition resize-y min-h-[68px]"
                                placeholder="แจ้งเงื่อนไข ขนาดสินค้า การปักชื่อ หรือระยะเวลาจัดเตรียมสินค้า"
                            />
                        </div>

                        {/* Notice Image Card */}
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-2.5">
                            <div className="mb-1.5 flex items-center justify-between">
                                <label className="text-[11px] font-medium text-slate-600">รูปประกอบระเบียบ</label>
                                {(form.noticeImageBase64 || form.noticeImageUrl.trim()) && (
                                    <button
                                        type="button"
                                        onClick={clearNoticeImage}
                                        className="text-[10px] font-medium text-rose-600 hover:text-rose-700 transition"
                                    >
                                        ลบรูปภาพ
                                    </button>
                                )}
                            </div>

                            {(form.noticeImageBase64 || form.noticeImageUrl.trim()) ? (
                                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-1.5">
                                    <img
                                        src={form.noticeImageBase64 || normalizeImageUrl(form.noticeImageUrl)}
                                        alt="รูปประกอบระเบียบ"
                                        className="h-12 w-12 rounded-md border border-slate-100 object-cover"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-slate-900">
                                            {form.noticeImageName || form.noticeImageUrl.trim() || "รูปประกอบ"}
                                        </p>
                                        <p className="text-[10px] text-slate-400">จะแสดงปุ่มเปิดดูรูปในป้ายเตือนหน้าร้าน</p>
                                    </div>
                                </div>
                            ) : (
                                <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                                    <Upload size={13} className="text-slate-500" />
                                    แนบไฟล์รูปภาพ
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleNoticeImageChange}
                                    />
                                </label>
                            )}

                            <div className="mt-2">
                                <input
                                    type="url"
                                    value={form.noticeImageUrl}
                                    onChange={(event) => setForm((prev) => ({ ...prev, noticeImageUrl: event.target.value }))}
                                    className="w-full h-7 px-2 bg-white border border-slate-200 rounded-md text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900/10"
                                    placeholder="หรือวาง URL รูปภาพ (https://...)"
                                />
                            </div>
                            <p className="mt-1 text-[10px] text-slate-400">ขนาดไฟล์ไม่เกิน 700KB</p>
                            {imageError && <p className="mt-1 text-[11px] text-rose-500">{imageError}</p>}
                        </div>

                        {error && (
                            <div className="rounded-lg border border-rose-200/80 bg-rose-50/60 px-3 py-2 text-xs font-medium text-rose-600">
                                {error}
                            </div>
                        )}

                        {/* Submit Buttons */}
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                            {editingCategory && (
                                <button
                                    type="button"
                                    onClick={openCreate}
                                    className="h-8 flex-1 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                                >
                                    ยกเลิก
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={saving}
                                className="h-8 flex-[2] rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                            >
                                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                {editingCategory ? "บันทึกการแก้ไข" : "สร้างหมวดหมู่"}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Categories List Card */}
                <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden flex flex-col">
                    {/* List Header Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">รายการหมวดหมู่</span>
                            <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                                {filteredCategories.length} / {categories.length}
                            </span>
                        </div>
                        <div className="relative w-full sm:w-56">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                            <input
                                type="text"
                                value={categorySearch}
                                onChange={(e) => setCategorySearch(e.target.value)}
                                placeholder="ค้นหาชื่อหมวดหมู่..."
                                className="w-full h-7 pl-7 pr-7 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900/10"
                            />
                            {categorySearch && (
                                <button
                                    type="button"
                                    onClick={() => setCategorySearch("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* List Content */}
                    {loading ? (
                        <div className="p-10 text-center text-slate-400">
                            <Loader2 className="mx-auto mb-2 animate-spin text-slate-500" size={20} />
                            <p className="text-xs">กำลังโหลดข้อมูลหมวดหมู่...</p>
                        </div>
                    ) : filteredCategories.length === 0 ? (
                        <div className="p-10 text-center text-slate-400">
                            <Tag size={32} className="mx-auto mb-2 text-slate-300" />
                            <p className="text-xs font-medium text-slate-600">
                                {categorySearch ? "ไม่พบหมวดหมู่ที่ตรงกับคำค้นหา" : "ยังไม่มีหมวดหมู่สินค้า"}
                            </p>
                            {categorySearch && (
                                <button
                                    type="button"
                                    onClick={() => setCategorySearch("")}
                                    className="mt-1 text-[11px] text-slate-500 underline"
                                >
                                    ล้างคำค้นหา
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredCategories.map((category) => {
                                const productCount = products.filter((p) => p.category === category.name).length;
                                return (
                                    <div
                                        key={category.id}
                                        className={`flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/60 ${
                                            editingCategory?.id === category.id ? "bg-slate-50/80" : ""
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500" title="ลำดับแสดงผล">
                                                    #{category.sortOrder ?? 0}
                                                </span>
                                                <p className="font-semibold text-xs text-slate-900">{category.name}</p>
                                                
                                                {/* Product count pill */}
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                                                    {productCount} สินค้า
                                                </span>

                                                {/* Active status pill */}
                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                                    category.isActive !== false
                                                        ? "border-emerald-200/60 bg-emerald-50 text-emerald-700"
                                                        : "border-slate-200/60 bg-slate-100 text-slate-500"
                                                }`}>
                                                    {category.isActive !== false ? "เปิดใช้งาน" : "ปิด"}
                                                </span>

                                                {/* Notice pill */}
                                                {category.noticeText?.trim() && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                                        <AlertTriangle size={9} />
                                                        มีระเบียบ
                                                    </span>
                                                )}

                                                {/* Image pill */}
                                                {(category.noticeImageBase64 || category.noticeImageUrl?.trim()) && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/60 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                                                        <ImageIcon size={9} />
                                                        มีรูป
                                                    </span>
                                                )}
                                            </div>

                                            {/* Notice Preview */}
                                            {category.noticeText?.trim() && (
                                                <p className="line-clamp-1 text-[11px] text-slate-500">
                                                    <span className="font-medium text-slate-700">{category.noticeTitle || "ข้อความแจ้งเตือน"}:</span>{" "}
                                                    {category.noticeText}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 pt-0.5">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(category)}
                                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                                title="แก้ไขหมวดหมู่"
                                            >
                                                <Edit3 size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteTarget(category)}
                                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                title="ลบหมวดหมู่"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Product Guides Section (คู่มือคำแนะนำสินค้า) */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
                    <div>
                        <div className="flex items-center gap-2">
                            <BookOpen size={14} className="text-slate-500" />
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                                รายการคำแนะนำสินค้า (Product Guides)
                            </span>
                            <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                                {productGuides.length} รายการ
                            </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                            สร้างไว้ครั้งเดียว แล้วเลือกใช้จาก Dropdown ในหน้าจัดการสินค้า เพื่อแสดงคำแนะนำ/วิธีวัดไซซ์ให้ลูกค้า
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openCreateGuide}
                        className="inline-flex h-7.5 items-center gap-1 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition self-start sm:self-auto"
                    >
                        <Plus size={12} className="text-slate-500" />
                        เพิ่มคำแนะนำใหม่
                    </button>
                </div>

                {productGuides.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        <BookOpen size={28} className="mx-auto mb-1.5 text-slate-300" />
                        <p className="text-xs">ยังไม่มีคู่มือคำแนะนำสินค้า</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {productGuides.map((guide) => {
                            const usedCount = products.filter((product) => product.guideId === guide.id).length;
                            return (
                                <div key={guide.id} className="flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/60">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <p className="font-semibold text-xs text-slate-900">{guide.title}</p>
                                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                                guide.isActive !== false
                                                    ? "border-emerald-200/60 bg-emerald-50 text-emerald-700"
                                                    : "border-slate-200/60 bg-slate-100 text-slate-500"
                                            }`}>
                                                {guide.isActive !== false ? "เปิดใช้งาน" : "ปิด"}
                                            </span>
                                            {(guide.imageBase64 || guide.imageUrl?.trim()) && (
                                                <span className="rounded-full border border-sky-200/60 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                                                    มีรูปประกอบ
                                                </span>
                                            )}
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                                                ใช้กับ {usedCount} สินค้า
                                            </span>
                                        </div>
                                        {guide.text && (
                                            <p className="line-clamp-1 text-[11px] text-slate-500">{guide.text}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 pt-0.5">
                                        <button
                                            type="button"
                                            onClick={() => openEditGuide(guide)}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                            title="แก้ไขคำแนะนำ"
                                        >
                                            <Edit3 size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleteGuideTarget(guide)}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                            title="ลบคำแนะนำ"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Product Guide Modal */}
            {isGuideModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <form onSubmit={saveProductGuide} className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                                    <BookOpen size={13} />
                                </span>
                                <div>
                                    <h3 className="text-xs font-semibold text-slate-900">
                                        {editingGuide ? "แก้ไขคำแนะนำสินค้า" : "เพิ่มคำแนะนำสินค้า"}
                                    </h3>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeGuideModal}
                                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="space-y-3 p-4">
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                                    หัวข้อคำแนะนำ <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    value={guideForm.title}
                                    onChange={(event) => setGuideForm((prev) => ({ ...prev, title: event.target.value }))}
                                    placeholder="เช่น วิธีวัดไซซ์เสื้อ / ข้อควรรู้ก่อนสั่ง"
                                    className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-slate-600">ข้อความคำแนะนำ</label>
                                <textarea
                                    value={guideForm.text}
                                    onChange={(event) => setGuideForm((prev) => ({ ...prev, text: event.target.value }))}
                                    rows={4}
                                    placeholder="ระบุคำแนะนำ เช่น วิธีเลือกไซซ์ วิธีแจ้งชื่อปัก หรือข้อควรทราบ"
                                    className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition resize-y min-h-[70px]"
                                />
                            </div>
                            <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-2.5">
                                <div className="mb-1.5 flex items-center justify-between">
                                    <label className="text-[11px] font-medium text-slate-600">รูปภาพประกอบ</label>
                                    {(guideForm.imageBase64 || guideForm.imageUrl.trim()) && (
                                        <button
                                            type="button"
                                            onClick={clearGuideImage}
                                            className="text-[10px] font-medium text-rose-600 hover:text-rose-700 transition"
                                        >
                                            ลบรูป
                                        </button>
                                    )}
                                </div>
                                {(guideForm.imageBase64 || guideForm.imageUrl.trim()) ? (
                                    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-1.5">
                                        <img
                                            src={guideForm.imageBase64 || normalizeImageUrl(guideForm.imageUrl)}
                                            alt="รูปคำแนะนำสินค้า"
                                            className="h-12 w-12 rounded-md border border-slate-100 object-cover"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium text-slate-900">
                                                {guideForm.imageName || guideForm.imageUrl.trim() || "รูปคำแนะนำ"}
                                            </p>
                                            <p className="text-[10px] text-slate-400">แสดงใน Modal คำแนะนำหน้าร้าน</p>
                                        </div>
                                    </div>
                                ) : (
                                    <label className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                                        <Upload size={13} className="text-slate-500" />
                                        แนบรูปภาพ
                                        <input type="file" accept="image/*" className="hidden" onChange={handleGuideImageChange} />
                                    </label>
                                )}
                                <div className="mt-2">
                                    <input
                                        type="url"
                                        value={guideForm.imageUrl}
                                        onChange={(event) => setGuideForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                                        placeholder="หรือวางลิงก์รูปภาพ (https://...)"
                                        className="w-full h-7 px-2 bg-white border border-slate-200 rounded-md text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900/10"
                                    />
                                </div>
                                <p className="mt-1 text-[10px] text-slate-400">ขนาดไฟล์ไม่เกิน 700KB</p>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={guideForm.isActive}
                                    onChange={(event) => setGuideForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                                />
                                เปิดใช้งานคำแนะนำนี้
                            </label>
                            {guideError && (
                                <div className="rounded-lg border border-rose-200/80 bg-rose-50/60 px-3 py-2 text-xs font-medium text-rose-600">
                                    {guideError}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
                            <button
                                type="button"
                                onClick={closeGuideModal}
                                className="h-7.5 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                disabled={guideSaving}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="submit"
                                className="h-7.5 px-3 rounded-lg bg-slate-900 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 disabled:opacity-50 transition flex items-center gap-1.5"
                                disabled={guideSaving}
                            >
                                {guideSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                {editingGuide ? "บันทึกการแก้ไข" : "เพิ่มคำแนะนำ"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Delete Guide Confirmation Modal */}
            {deleteGuideTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                                    <Trash2 size={13} />
                                </span>
                                <h3 className="text-xs font-semibold text-slate-900">ยืนยันการลบคำแนะนำ</h3>
                            </div>
                            <button
                                type="button"
                                onClick={closeDeleteGuideConfirm}
                                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="p-4 space-y-1.5">
                            <p className="text-xs text-slate-700">
                                ต้องการลบคำแนะนำ <span className="font-semibold text-slate-900">&quot;{deleteGuideTarget.title}&quot;</span> ใช่หรือไม่?
                            </p>
                            <p className="text-[11px] text-rose-500">
                                สินค้าที่เคยผูกคำแนะนำนี้จะถูกล้างค่าออกโดยอัตโนมัติ
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
                            <button
                                type="button"
                                onClick={closeDeleteGuideConfirm}
                                className="h-7.5 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                                disabled={deletingGuideId === deleteGuideTarget.id}
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteGuide}
                                className="h-7.5 px-3 rounded-lg bg-rose-600 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-1.5"
                                disabled={deletingGuideId === deleteGuideTarget.id}
                            >
                                {deletingGuideId === deleteGuideTarget.id && <Loader2 size={12} className="animate-spin" />}
                                {deletingGuideId === deleteGuideTarget.id ? "กำลังลบ..." : "ลบคำแนะนำ"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Category Confirmation Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                                    <Trash2 size={13} />
                                </span>
                                <h3 className="text-xs font-semibold text-slate-900">ยืนยันการลบหมวดหมู่</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="p-4 space-y-1.5">
                            <p className="text-xs text-slate-700">
                                ต้องการลบหมวดหมู่ <span className="font-semibold text-slate-900">&quot;{deleteTarget.name}&quot;</span> ใช่หรือไม่?
                            </p>
                            <p className="text-[11px] text-rose-500">
                                สินค้าที่มีอยู่ในหมวดหมู่นี้จะไม่ถูกลบ แต่จะยังคงชื่อหมวดหมู่เดิมไว้
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="h-7.5 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                className="h-7.5 px-3 rounded-lg bg-rose-600 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 transition"
                            >
                                ลบหมวดหมู่
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
