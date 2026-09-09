"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { AlertTriangle, CheckCircle, Edit3, Image as ImageIcon, Loader2, Plus, Save, Tag, Trash2, Upload, X } from "lucide-react";
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
            withNotice: categories.filter((category) => category.noticeText?.trim()).length
        };
    }, [categories]);

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
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">หมวดหมู่สินค้า</h1>
                    <p className="mt-1 text-sm text-gray-500">สร้างหมวดหมู่และข้อความแจ้งระเบียบสำหรับหน้าร้าน</p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                >
                    <Plus size={16} />
                    เพิ่มหมวดหมู่
                </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-100 bg-white p-3">
                    <p className="text-xs text-gray-500">ทั้งหมด</p>
                    <p className="mt-1 text-lg font-bold text-gray-900">{stats.total}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-3">
                    <p className="text-xs text-gray-500">เปิดใช้งาน</p>
                    <p className="mt-1 text-lg font-bold text-green-600">{stats.active}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-3">
                    <p className="text-xs text-gray-500">มีระเบียบแจ้งเตือน</p>
                    <p className="mt-1 text-lg font-bold text-amber-600">{stats.withNotice}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
                <form onSubmit={handleSubmit} className="rounded-xl border border-gray-100 bg-white">
                    <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
                        <Tag size={16} className="text-gray-500" />
                        <p className="text-sm font-semibold text-gray-900">{editingCategory ? "แก้ไขหมวดหมู่" : "สร้างหมวดหมู่ใหม่"}</p>
                    </div>
                    <div className="space-y-3 p-4">
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-500">ชื่อหมวดหมู่ *</label>
                            <input
                                value={form.name}
                                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                placeholder="เช่น ชุดนักศึกษา"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-500">หัวข้อแจ้งเตือน</label>
                            <input
                                value={form.noticeTitle}
                                onChange={(event) => setForm((prev) => ({ ...prev, noticeTitle: event.target.value }))}
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                placeholder="เช่น อ่านก่อนสั่งซื้อ"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-500">ข้อความระเบียบ</label>
                            <textarea
                                value={form.noticeText}
                                onChange={(event) => setForm((prev) => ({ ...prev, noticeText: event.target.value }))}
                                rows={5}
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                placeholder="แจ้งเงื่อนไข ขนาดสินค้า การปักชื่อ หรือระยะเวลาจัดเตรียม"
                            />
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <label className="text-xs font-semibold text-gray-500">รูปประกอบระเบียบ</label>
                                {(form.noticeImageBase64 || form.noticeImageUrl.trim()) && (
                                    <button
                                        type="button"
                                        onClick={clearNoticeImage}
                                        className="text-[11px] font-semibold text-red-600 hover:text-red-700"
                                    >
                                        ลบรูป
                                    </button>
                                )}
                            </div>
                            {(form.noticeImageBase64 || form.noticeImageUrl.trim()) ? (
                                <div className="flex items-center gap-3">
                                    <img
                                        src={form.noticeImageBase64 || normalizeImageUrl(form.noticeImageUrl)}
                                        alt="รูปประกอบระเบียบ"
                                        className="h-16 w-16 rounded-lg border border-gray-200 bg-white object-cover"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold text-gray-900">{form.noticeImageName || form.noticeImageUrl.trim() || "รูปประกอบ"}</p>
                                        <p className="mt-0.5 text-[11px] text-gray-500">ลูกค้าจะเห็นปุ่มดูรูปในป้ายแจ้งเตือน</p>
                                    </div>
                                </div>
                            ) : (
                                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                                    <Upload size={14} />
                                    แนบรูปภาพ
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleNoticeImageChange}
                                    />
                                </label>
                            )}
                            <div className="mt-2">
                                <label className="mb-1 block text-[11px] font-semibold text-gray-500">หรือใส่ลิงก์รูปภาพ</label>
                                <input
                                    type="url"
                                    value={form.noticeImageUrl}
                                    onChange={(event) => setForm((prev) => ({ ...prev, noticeImageUrl: event.target.value }))}
                                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                    placeholder="https://.../image.jpg"
                                />
                            </div>
                            <p className="mt-2 text-[10px] text-gray-400">รองรับรูปภาพไม่เกิน 700KB</p>
                            {imageError && <p className="mt-1 text-xs font-medium text-red-600">{imageError}</p>}
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-500">ลำดับแสดงผล</label>
                                <input
                                    type="number"
                                    value={form.sortOrder}
                                    onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                />
                            </div>
                            <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                เปิดใช้งาน
                            </label>
                        </div>

                        {error && (
                            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-2 pt-1">
                            {editingCategory && (
                                <button
                                    type="button"
                                    onClick={openCreate}
                                    className="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    ยกเลิก
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {editingCategory ? "บันทึก" : "สร้างหมวดหมู่"}
                            </button>
                        </div>
                    </div>
                </form>

                <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">รายการหมวดหมู่</p>
                        <p className="text-xs text-gray-500">{categories.length} รายการ</p>
                    </div>

                    {loading ? (
                        <div className="p-8 text-center text-gray-500">
                            <Loader2 className="mx-auto mb-2 animate-spin" size={24} />
                            <p className="text-sm">กำลังโหลด...</p>
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <Tag size={40} className="mx-auto mb-3 text-gray-300" />
                            <p className="text-sm font-medium">ยังไม่มีหมวดหมู่</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {categories.map((category) => (
                                <div key={category.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-semibold text-gray-900">{category.name}</p>
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${category.isActive !== false ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                {category.isActive !== false ? <CheckCircle size={10} /> : <X size={10} />}
                                                {category.isActive !== false ? "เปิด" : "ปิด"}
                                            </span>
                                            {category.noticeText?.trim() && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                                    <AlertTriangle size={10} />
                                                    มีระเบียบ
                                                </span>
                                            )}
                                        </div>
                                        {category.noticeText?.trim() && (
                                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                                                {category.noticeTitle || "อ่านก่อนสั่งซื้อ"}: {category.noticeText}
                                            </p>
                                        )}
                                        {(category.noticeImageBase64 || category.noticeImageUrl?.trim()) && (
                                            <div className="mt-2 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600">
                                                <ImageIcon size={12} />
                                                มีรูปประกอบ
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => openEdit(category)}
                                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                        >
                                            <Edit3 size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(category)}
                                            className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                    <div>
                        <p className="text-sm font-semibold text-gray-900">รายการคำแนะนำสินค้า</p>
                        <p className="text-xs text-gray-400">สร้างไว้แล้วเลือกใช้จาก dropdown ในฟอร์มสินค้า</p>
                    </div>
                    <button
                        type="button"
                        onClick={openCreateGuide}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                    >
                        <Plus size={13} />
                        เพิ่มคำแนะนำ
                    </button>
                </div>
                {productGuides.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-400">
                        ยังไม่มีคำแนะนำสินค้า
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {productGuides.map((guide) => {
                            const usedCount = products.filter((product) => product.guideId === guide.id).length;
                            return (
                                <div key={guide.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-semibold text-sm text-gray-900">{guide.title}</p>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${guide.isActive !== false ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                                {guide.isActive !== false ? "เปิด" : "ปิด"}
                                            </span>
                                            {(guide.imageBase64 || guide.imageUrl?.trim()) && (
                                                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                                    มีรูป
                                                </span>
                                            )}
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                                ใช้กับ {usedCount} สินค้า
                                            </span>
                                        </div>
                                        {guide.text && (
                                            <p className="mt-1 line-clamp-1 text-xs text-gray-500">{guide.text}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => openEditGuide(guide)}
                                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                            title="แก้ไขคำแนะนำ"
                                        >
                                            <Edit3 size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDeleteGuideTarget(guide)}
                                            className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                                            title="ลบคำแนะนำ"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {isGuideModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
                    <form onSubmit={saveProductGuide} className="w-full overflow-hidden rounded-t-xl bg-white shadow-2xl sm:max-w-md sm:rounded-xl">
                        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">{editingGuide ? "แก้ไขคำแนะนำสินค้า" : "เพิ่มคำแนะนำสินค้า"}</h3>
                                <p className="mt-0.5 text-xs text-gray-400">สร้างครั้งเดียว แล้วเลือกใช้ได้หลายสินค้า</p>
                            </div>
                            <button type="button" onClick={closeGuideModal} className="rounded p-1 hover:bg-gray-100">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-3 bg-gray-50 p-5">
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-500">หัวข้อคำแนะนำ *</label>
                                <input
                                    value={guideForm.title}
                                    onChange={(event) => setGuideForm((prev) => ({ ...prev, title: event.target.value }))}
                                    placeholder="เช่น วิธีวัดไซซ์ / อ่านก่อนสั่งซื้อ"
                                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500/10"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-gray-500">ข้อความคำแนะนำ</label>
                                <textarea
                                    value={guideForm.text}
                                    onChange={(event) => setGuideForm((prev) => ({ ...prev, text: event.target.value }))}
                                    rows={4}
                                    placeholder="ระบุคำแนะนำ เช่น วิธีเลือกไซซ์ วิธีส่งชื่อปัก หรือข้อควรทราบ"
                                    className="min-h-[80px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500/10"
                                />
                            </div>
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-xs font-semibold text-gray-500">รูปคำแนะนำ</label>
                                    {(guideForm.imageBase64 || guideForm.imageUrl.trim()) && (
                                        <button type="button" onClick={clearGuideImage} className="text-[11px] font-semibold text-red-600 hover:text-red-700">
                                            ลบรูป
                                        </button>
                                    )}
                                </div>
                                {(guideForm.imageBase64 || guideForm.imageUrl.trim()) ? (
                                    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2">
                                        <img src={guideForm.imageBase64 || normalizeImageUrl(guideForm.imageUrl)} alt="รูปคำแนะนำสินค้า" className="h-14 w-14 rounded-lg border border-gray-100 object-cover" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-semibold text-gray-900">{guideForm.imageName || guideForm.imageUrl.trim() || "รูปคำแนะนำสินค้า"}</p>
                                            <p className="text-[11px] text-gray-400">จะแสดงใน modal คำแนะนำสินค้า</p>
                                        </div>
                                    </div>
                                ) : (
                                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-sky-200 bg-white px-3 py-3 text-xs font-semibold text-sky-700 hover:bg-sky-50">
                                        <Upload size={14} />
                                        แนบรูปคำแนะนำ
                                        <input type="file" accept="image/*" className="hidden" onChange={handleGuideImageChange} />
                                    </label>
                                )}
                                <div className="mt-2">
                                    <label className="mb-1 block text-[11px] font-semibold text-gray-500">หรือใส่ลิงก์รูปภาพ</label>
                                    <input
                                        type="url"
                                        value={guideForm.imageUrl}
                                        onChange={(event) => setGuideForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
                                        placeholder="https://.../image.jpg"
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500/10"
                                    />
                                </div>
                                <p className="mt-1 text-[10px] text-gray-400">รองรับรูปภาพไม่เกิน 700KB</p>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={guideForm.isActive}
                                    onChange={(event) => setGuideForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                เปิดใช้งาน
                            </label>
                            {guideError && (
                                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                                    {guideError}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 border-t border-gray-100 bg-white p-4">
                            <button
                                type="button"
                                onClick={closeGuideModal}
                                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                disabled={guideSaving}
                            >
                                ปิด
                            </button>
                            <button
                                type="submit"
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                                disabled={guideSaving}
                            >
                                {guideSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {editingGuide ? "บันทึก" : "เพิ่ม"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {deleteGuideTarget && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
                    <div className="w-full overflow-hidden rounded-t-xl bg-white shadow-2xl sm:max-w-md sm:rounded-xl">
                        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
                            <h3 className="text-sm font-semibold text-gray-900">ลบคำแนะนำสินค้า</h3>
                            <button type="button" onClick={closeDeleteGuideConfirm} className="rounded p-1 hover:bg-gray-100">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-2 bg-gray-50 p-5">
                            <p className="text-sm text-gray-700">
                                ต้องการลบคำแนะนำ “{deleteGuideTarget.title}” ใช่หรือไม่?
                            </p>
                            <p className="text-xs text-red-600">
                                สินค้าที่เลือกคำแนะนำนี้จะถูกล้างคำแนะนำออกโดยอัตโนมัติ
                            </p>
                        </div>
                        <div className="flex gap-3 border-t border-gray-100 bg-white p-4">
                            <button
                                type="button"
                                onClick={closeDeleteGuideConfirm}
                                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                disabled={deletingGuideId === deleteGuideTarget.id}
                            >
                                ปิด
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteGuide}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                                disabled={deletingGuideId === deleteGuideTarget.id}
                            >
                                {deletingGuideId === deleteGuideTarget.id && <Loader2 size={16} className="animate-spin" />}
                                ลบ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
                    <div className="w-full rounded-t-xl bg-white shadow-2xl sm:max-w-md sm:rounded-xl">
                        <div className="border-b border-gray-100 px-5 py-4">
                            <h3 className="text-sm font-semibold text-gray-900">ลบหมวดหมู่</h3>
                        </div>
                        <div className="space-y-2 bg-gray-50 p-5">
                            <p className="text-sm text-gray-700">ต้องการลบหมวดหมู่ “{deleteTarget.name}” ใช่หรือไม่?</p>
                            <p className="text-xs text-red-600">สินค้าที่เคยใช้ชื่อหมวดหมู่นี้จะยังคงชื่อเดิมไว้</p>
                        </div>
                        <div className="flex gap-3 border-t border-gray-100 p-4">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                                ปิด
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
                            >
                                ลบ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
