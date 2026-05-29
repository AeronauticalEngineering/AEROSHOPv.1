"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search, X, Box, Layers, Image as ImageIcon, Save, ChevronLeft, ChevronRight, Loader2, Package, Upload, CheckCircle, AlertTriangle } from "lucide-react";
import { Product, ProductGuide } from "@/types/product";
import { ProductCategory } from "@/types/category";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

// --- Schema Validation ---
const productSchema = z.object({
    sku: z.string().optional(),
    name: z.string().min(1, "กรุณากรอกชื่อสินค้า"),
    description: z.string().optional(),
    guideId: z.string().optional(),
    guideTitle: z.string().optional(),
    guideText: z.string().optional(),
    guideImageBase64: z.string().optional(),
    guideImageName: z.string().optional(),
    productType: z.enum(["single", "bundle"]).default("single"),
    price: z.preprocess((val) => Number(val) || 0, z.number().min(0, "ราคาต้องไม่ต่ำกว่า 0")),
    stock: z.preprocess((val) => Number(val) || 0, z.number().min(0, "จำนวนต้องไม่ติดลบ")),
    category: z.string().min(1, "กรุณาระบุหมวดหมู่"),
    imageUrls: z.array(z.object({
        url: z.string().optional()
    })).optional().default([]),
    isActive: z.boolean().default(true),
    hasVariants: z.boolean().default(false),
    options: z.array(z.object({
        id: z.string(),
        name: z.string().min(1, "ระบุชื่อตัวเลือก"),
        values: z.array(z.string()).min(1, "ระบุอย่างน้อย 1 ค่า"),
        allowCustom: z.boolean().optional().default(false)
    })).default([]),
    variants: z.array(z.object({
        id: z.string(),
        name: z.string(),
        price: z.preprocess((val) => Number(val) || 0, z.number().min(0)),
        stock: z.preprocess((val) => Number(val) || 0, z.number().min(0)),
        sku: z.string().optional(),
        attributes: z.any()
    })).default([]),
    bundleItems: z.array(z.object({
        id: z.string(),
        productId: z.string().min(1, "เลือกสินค้า"),
        productName: z.string().optional().default(""),
        variantId: z.string().optional(),
        variantName: z.string().optional(),
        quantity: z.preprocess((val) => Number(val) || 1, z.number().min(1)),
        unitPrice: z.preprocess((val) => Number(val) || 0, z.number().min(0))
    })).default([]),
    addOns: z.array(z.object({
        id: z.string(),
        name: z.string().min(1, "ระบุชื่อบริการเสริม"),
        price: z.preprocess((val) => Number(val) || 0, z.number().min(0)),
        inputLabel: z.string().optional(),
        placeholder: z.string().optional(),
        required: z.boolean().optional().default(false),
        maxLength: z.preprocess((val) => Number(val) || 0, z.number().min(0)).optional(),
        isActive: z.boolean().optional().default(true)
    })).default([])
});

type ProductFormValues = z.infer<typeof productSchema>;

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function AdminProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [productGuides, setProductGuides] = useState<ProductGuide[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [imageFileError, setImageFileError] = useState("");
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
    const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
    const itemsPerPage = 10;

    const { register, control, handleSubmit, reset, setValue, watch, getValues, formState: { errors } } = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema) as unknown as Resolver<ProductFormValues>,
        defaultValues: {
            sku: "",
            isActive: true,
            productType: "single",
            hasVariants: false,
            price: 0,
            stock: 0,
            guideId: "",
            guideTitle: "",
            guideText: "",
            guideImageBase64: "",
            guideImageName: "",
            imageUrls: [],
            options: [],
            variants: [],
            bundleItems: [],
            addOns: []
        }
    });

    const productType = watch("productType");
    const isBundle = productType === "bundle";
    const hasVariants = watch("hasVariants");
    const watchedPrice = watch("price");
    const watchedVariants = watch("variants");
    const watchedOptions = watch("options");
    const watchedBundleItems = watch("bundleItems");

    const { fields: optionFields, append: appendOption, remove: removeOption, update: updateOption } = useFieldArray({
        control,
        name: "options"
    });

    const { fields: variantFields, replace: replaceVariants } = useFieldArray({
        control,
        name: "variants"
    });

    const { fields: bundleItemFields, append: appendBundleItem, remove: removeBundleItem } = useFieldArray({
        control,
        name: "bundleItems"
    });

    const { fields: addOnFields, append: appendAddOn, remove: removeAddOn } = useFieldArray({
        control,
        name: "addOns"
    });

    const { fields: imageUrlFields, append: appendImageUrl, remove: removeImageUrl } = useFieldArray({
        control,
        name: "imageUrls"
    });

    useEffect(() => {
        const q = query(collection(db, "products"), orderBy("updatedAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Product[];
            setProducts(items);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "categories"), orderBy("sortOrder", "asc"), orderBy("name", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ProductCategory[];
            setCategories(items);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "product_guides"), orderBy("updatedAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ProductGuide[];
            setProductGuides(items);
        });
        return () => unsubscribe();
    }, []);

    const generateVariants = () => {
        const currentOptions = getValues("options") || [];
        const validOptions = currentOptions
            .map((opt, idx) => ({
                name: opt.name?.trim() || `ตัวเลือก ${idx + 1}`,
                values: Array.from(new Set((opt.values || []).map(value => value.trim()).filter(Boolean))),
                allowCustom: Boolean(opt.allowCustom)
            }))
            .filter(opt => opt.values.length > 0);

        if (validOptions.length === 0) {
            setValue("variants", []);
            return;
        }

        const cartesian = (arrays: string[][]): string[][] => {
            if (arrays.length === 0) return [[]];
            const result: string[][] = [];
            const restCartesian = cartesian(arrays.slice(1));
            for (const item of arrays[0]) {
                for (const rest of restCartesian) {
                    result.push([item, ...rest]);
                }
            }
            return result;
        };

        const optionValues = validOptions.map(opt => opt.values);
        const combinations = cartesian(optionValues);
        const basePrice = getValues("price") || 0;
        const existingVariants = getValues("variants") || [];

        const newVariants = combinations.map(combo => {
            const attributes: Record<string, string> = {};
            validOptions.forEach((opt, index) => {
                attributes[opt.name] = combo[index];
            });

            const name = combo.join(" / ");
            const attributeKey = JSON.stringify(attributes);

            const match = existingVariants.find(v =>
                JSON.stringify(v.attributes || {}) === attributeKey
            );

            if (match) {
                return { ...match, name, attributes };
            }

            const sku = `SKU-${combo.map(c => c.substring(0, 2).toUpperCase()).join('-')}-${Date.now().toString(36).slice(-4)}`;
            return { id: generateId(), name, price: basePrice, stock: 0, sku, attributes };
        });

        replaceVariants(newVariants);
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const input = e.target as HTMLInputElement;
            const val = input.value.trim();

            if (val) {
                const currentOption = getValues(`options.${index}`);
                const currentValues = currentOption?.values || [];

                if (!currentValues.includes(val)) {
                    updateOption(index, { ...currentOption, values: [...currentValues, val] });
                    input.value = '';
                    setTimeout(() => generateVariants(), 50);
                }
            }
        }
    };

    const removeValue = (optIndex: number, valToRemove: string) => {
        const currentOption = getValues(`options.${optIndex}`);
        if (!currentOption) return;
        updateOption(optIndex, { ...currentOption, values: currentOption.values.filter(v => v !== valToRemove) });
        setTimeout(() => generateVariants(), 50);
    };

    const clearImageSelection = () => {
        imagePreviews.forEach((url) => URL.revokeObjectURL(url));
        setImageFiles([]);
        setImagePreviews([]);
        setImageFileError("");
    };

    const handleImageFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const maxBytes = 700 * 1024;
        const tooLarge = files.find((file) => file.size > maxBytes);
        if (tooLarge) {
            setImageFileError("ไฟล์ใหญ่เกินไป (จำกัด 700KB) โปรดบีบอัดรูป");
            return;
        }
        setImageFileError("");
        const nextFiles = [...imageFiles, ...files];
        imagePreviews.forEach((url) => URL.revokeObjectURL(url));
        setImageFiles(nextFiles);
        setImagePreviews(nextFiles.map((file) => URL.createObjectURL(file)));
        e.target.value = "";
    };

    const removeImageFile = (index: number) => {
        const nextFiles = imageFiles.filter((_, i) => i !== index);
        imagePreviews.forEach((url) => URL.revokeObjectURL(url));
        setImageFiles(nextFiles);
        setImagePreviews(nextFiles.map((file) => URL.createObjectURL(file)));
    };

    const fileToBase64 = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
            reader.readAsDataURL(file);
        });

    const bundleCandidateProducts = useMemo(
        () => products.filter((product) => product.id !== editingProduct?.id && product.productType !== "bundle"),
        [editingProduct?.id, products]
    );

    const getBundleProduct = useCallback((productId?: string) =>
        bundleCandidateProducts.find((product) => product.id === productId), [bundleCandidateProducts]);

    const getBundleVariant = useCallback((productId?: string, variantId?: string) =>
        getBundleProduct(productId)?.variants?.find((variant) => variant.id === variantId), [getBundleProduct]);

    const getBundleItemStock = useCallback((item: ProductFormValues["bundleItems"][number]) => {
        const product = getBundleProduct(item.productId);
        if (!product) return 0;
        if (product.hasVariants) {
            return item.variantId ? getBundleVariant(item.productId, item.variantId)?.stock || 0 : product.stock || 0;
        }
        return product.stock || 0;
    }, [getBundleProduct, getBundleVariant]);

    const bundleRegularPrice = useMemo(
        () => (watchedBundleItems || []).reduce((sum, item) => sum + ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)), 0),
        [watchedBundleItems]
    );

    const bundleAvailableStock = useMemo(() => {
        const items = watchedBundleItems || [];
        if (items.length === 0) return 0;
        return Math.min(...items.map((item) => Math.floor(getBundleItemStock(item) / Math.max(1, Number(item.quantity) || 1))));
    }, [getBundleItemStock, watchedBundleItems]);

    const handleBundleProductChange = (index: number, productId: string) => {
        const product = getBundleProduct(productId);
        setValue(`bundleItems.${index}.productId`, productId);
        setValue(`bundleItems.${index}.productName`, product?.name || "");
        setValue(`bundleItems.${index}.variantId`, "");
        setValue(`bundleItems.${index}.variantName`, "");
        setValue(`bundleItems.${index}.unitPrice`, product?.price ?? 0);
    };

    const handleBundleVariantChange = (index: number, variantId: string) => {
        const productId = getValues(`bundleItems.${index}.productId`);
        const variant = getBundleVariant(productId, variantId);
        setValue(`bundleItems.${index}.variantId`, variantId);
        setValue(`bundleItems.${index}.variantName`, variant?.name || "");
        if (variant) setValue(`bundleItems.${index}.unitPrice`, variant.price);
    };

    const saveBase64Images = async (productId: string) => {
        if (imageFiles.length === 0) return [];
        const ids: string[] = [];
        for (const file of imageFiles) {
            const base64 = await fileToBase64(file);
            const imageRef = await addDoc(collection(db, "product_images"), {
                productId,
                base64,
                mimeType: file.type,
                size: file.size,
                createdAt: serverTimestamp()
            });
            ids.push(imageRef.id);
        }
        return ids;
    };

    const onSubmit = async (data: ProductFormValues) => {
        const isBundleProduct = data.productType === "bundle";
        const normalizedOptions = (data.options || []).map((option, index) => ({
            ...option,
            id: option.id || generateId(),
            name: option.name.trim() || `ตัวเลือก ${index + 1}`,
            values: Array.from(new Set((option.values || []).map(value => value.trim()).filter(Boolean))),
            allowCustom: Boolean(option.allowCustom)
        }));
        const normalizedVariants = (data.variants || []).map((variant) => ({
            ...variant,
            sku: (variant.sku || "").trim(),
            price: Number(variant.price) || 0,
            stock: Number(variant.stock) || 0
        }));
        const normalizedAddOns = (data.addOns || [])
            .map((addOn) => ({
                ...addOn,
                id: addOn.id || generateId(),
                name: addOn.name.trim(),
                price: Number(addOn.price) || 0,
                inputLabel: (addOn.inputLabel || "").trim(),
                placeholder: (addOn.placeholder || "").trim(),
                required: Boolean(addOn.required),
                maxLength: Number(addOn.maxLength) || 0,
                isActive: addOn.isActive !== false
            }))
            .filter(addOn => addOn.name);
        const normalizedBundleItems = (data.bundleItems || [])
            .map((item) => {
                const product = getBundleProduct(item.productId);
                const variant = product?.hasVariants ? getBundleVariant(item.productId, item.variantId) : undefined;
                return {
                    id: item.id || generateId(),
                    productId: item.productId,
                    productName: product?.name || item.productName || "",
                    variantId: variant?.id || "",
                    variantName: variant?.name || "",
                    quantity: Math.max(1, Number(item.quantity) || 1),
                    unitPrice: Number(item.unitPrice) || variant?.price || product?.price || 0
                };
            })
            .filter(item => item.productId && item.productName);

        if (isBundleProduct) {
            if (normalizedBundleItems.length === 0) {
                alert("กรุณาเพิ่มสินค้าในเซตอย่างน้อย 1 รายการ");
                return;
            }
        }

        if (!isBundleProduct && data.hasVariants) {
            if (normalizedOptions.length === 0 || normalizedOptions.some(option => option.values.length === 0)) {
                alert("กรุณาเพิ่มตัวเลือกสินค้าอย่างน้อย 1 รายการ");
                return;
            }
            if (normalizedVariants.length === 0) {
                alert("กรุณาตรวจสอบรายการสินค้า");
                return;
            }
        }

        setIsSaving(true);
        try {
            const sanitizedData = JSON.parse(JSON.stringify(data));
            const cleanedImageUrls = (data.imageUrls || [])
                .map((item) => (item?.url || "").trim())
                .filter(Boolean);
            const existingBase64Ids = editingProduct?.imageBase64Ids || [];
            const productData = {
                ...sanitizedData,
                sku: (data.sku || "").trim(),
                guideId: data.guideId || "",
                guideTitle: "",
                guideText: "",
                guideImageBase64: "",
                guideImageName: "",
                imageUrls: cleanedImageUrls,
                imageUrl: cleanedImageUrls[0] || "",
                imageBase64Ids: existingBase64Ids,
                productType: data.productType,
                bundleItems: isBundleProduct ? normalizedBundleItems : [],
                options: !isBundleProduct && data.hasVariants ? normalizedOptions : [],
                variants: !isBundleProduct && data.hasVariants ? normalizedVariants : [],
                addOns: isBundleProduct ? [] : normalizedAddOns,
                hasVariants: isBundleProduct ? false : data.hasVariants,
                stock: isBundleProduct
                    ? bundleAvailableStock
                    : data.hasVariants
                    ? normalizedVariants.reduce((sum, v) => sum + v.stock, 0)
                    : data.stock,
                updatedAt: serverTimestamp()
            };

            if (editingProduct) {
                await updateDoc(doc(db, "products", editingProduct.id), productData);
                const newBase64Ids = await saveBase64Images(editingProduct.id);
                if (newBase64Ids.length > 0) {
                    await updateDoc(doc(db, "products", editingProduct.id), {
                        imageBase64Ids: [...existingBase64Ids, ...newBase64Ids]
                    });
                }
            } else {
                const docRef = await addDoc(collection(db, "products"), { ...productData, createdAt: serverTimestamp() });
                const newBase64Ids = await saveBase64Images(docRef.id);
                if (newBase64Ids.length > 0) {
                    await updateDoc(docRef, { imageBase64Ids: newBase64Ids });
                }
            }
            closeModal();
        } catch (error) {
            console.error("Error saving product:", error);
            alert("เกิดข้อผิดพลาดในการบันทึก");
        } finally {
            setIsSaving(false);
        }
    };

    const openDeleteConfirm = (product: Product, e: React.MouseEvent) => {
        e.stopPropagation();
        if (deletingProductId) return;
        setDeleteTarget(product);
        setIsDeleteConfirmOpen(true);
    };

    const closeDeleteConfirm = () => {
        if (deletingProductId) return;
        setIsDeleteConfirmOpen(false);
        setDeleteTarget(null);
    };

    const handleDelete = async (id: string) => {
        try {
            setDeletingProductId(id);
            await deleteDoc(doc(db, "products", id));
        } catch (error) {
            console.error("Error deleting product:", error);
        } finally {
            setDeletingProductId(null);
        }
    };

    const confirmDeleteProduct = async () => {
        if (!deleteTarget) return;
        await handleDelete(deleteTarget.id);
        closeDeleteConfirm();
    };

    const openEditModal = (product: Product) => {
        setEditingProduct(product);
        clearImageSelection();
        reset({
            sku: product.sku || "",
            name: product.name,
            description: product.description,
            price: product.price,
            stock: product.stock,
            productType: product.productType || "single",
            guideId: product.guideId || "",
            guideTitle: product.guideTitle || "",
            guideText: product.guideText || "",
            guideImageBase64: product.guideImageBase64 || "",
            guideImageName: product.guideImageName || "",
            category: product.category,
            imageUrls: (product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [])
                .map((url) => ({ url })),
            isActive: product.isActive,
            hasVariants: product.hasVariants || false,
            options: (product.options || []).map((option) => ({
                ...option,
                allowCustom: Boolean(option.allowCustom)
            })),
            variants: product.variants || [],
            bundleItems: (product.bundleItems || []).map((item) => ({
                ...item,
                variantId: item.variantId || "",
                variantName: item.variantName || "",
                quantity: Number(item.quantity) || 1,
                unitPrice: Number(item.unitPrice) || 0
            })),
            addOns: (product.addOns || []).map((addOn) => ({
                ...addOn,
                required: Boolean(addOn.required),
                isActive: addOn.isActive !== false
            }))
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
        clearImageSelection();
        reset({ sku: '', isActive: true, productType: 'single', stock: 0, price: 0, name: '', description: '', guideId: '', guideTitle: '', guideText: '', guideImageBase64: '', guideImageName: '', category: '', imageUrls: [], hasVariants: false, options: [], variants: [], bundleItems: [], addOns: [] });
    };

    const categoryOptions = useMemo(() => {
        const savedCategories = categories.map((category) => category.name?.trim()).filter(Boolean);
        const legacyProductCategories = products.map((product) => product.category?.trim()).filter(Boolean);
        return Array.from(new Set([...savedCategories, ...legacyProductCategories])).sort((a, b) => a.localeCompare(b, "th"));
    }, [categories, products]);

    const activeCategoryOptions = useMemo(() => {
        const activeNames = categories
            .filter((category) => category.isActive !== false)
            .map((category) => category.name?.trim())
            .filter(Boolean);
        const currentCategory = editingProduct?.category?.trim();
        return Array.from(new Set(currentCategory ? [...activeNames, currentCategory] : activeNames));
    }, [categories, editingProduct]);

    const filteredProducts = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return products.filter((product) => {
            const productName = product.name.toLowerCase();
            const productSku = product.sku?.toLowerCase() || "";
            const productCategory = product.category?.toLowerCase() || "";
            const matchesSearch =
                !normalizedSearch ||
                productName.includes(normalizedSearch) ||
                productSku.includes(normalizedSearch) ||
                productCategory.includes(normalizedSearch);
            const matchesCategory =
                selectedCategory === "all" ||
                product.category === selectedCategory;

            return matchesSearch && matchesCategory;
        });
    }, [products, searchTerm, selectedCategory]);

    const productStats = useMemo(() => {
        const activeProducts = products.filter((product) => product.isActive).length;
        const variantProducts = products.filter((product) => product.hasVariants).length;
        const bundleProducts = products.filter((product) => product.productType === "bundle").length;
        const outOfStock = products.filter((product) => product.stock === 0).length;
        const lowStock = products.filter((product) => product.stock > 0 && product.stock <= 5).length;

        return {
            total: products.length,
            activeProducts,
            variantProducts,
            bundleProducts,
            stockWarning: outOfStock + lowStock,
            outOfStock,
            lowStock
        };
    }, [products]);

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">
                        {isModalOpen ? (editingProduct ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่") : "สินค้า"}
                    </h1>
                    {isModalOpen && (
                        <p className="mt-1 text-xs text-gray-500">จัดการข้อมูลสินค้า ราคา สต็อก ตัวเลือก และสินค้าเซต</p>
                    )}
                </div>
                {isModalOpen ? (
                    <button
                        type="button"
                        onClick={closeModal}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg font-semibold text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                        <ChevronLeft size={16} />
                        กลับไปหน้าสินค้า
                    </button>
                ) : (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold text-sm hover:bg-gray-800 transition-colors"
                    >
                        <Plus size={16} />
                        เพิ่มสินค้า
                    </button>
                )}
            </div>

            {!isModalOpen && (
                <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <Package size={14} /> สินค้าทั้งหมด
                    </div>
                    <p className="text-lg font-bold text-gray-900">{productStats.total.toLocaleString()}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-green-600 text-xs mb-1">
                        <CheckCircle size={14} /> เปิดขาย
                    </div>
                    <p className="text-lg font-bold text-green-600">{productStats.activeProducts.toLocaleString()}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-blue-600 text-xs mb-1">
                        <Layers size={14} /> เซต / มีตัวเลือก
                    </div>
                    <p className="text-lg font-bold text-blue-600">{productStats.bundleProducts.toLocaleString()} / {productStats.variantProducts.toLocaleString()}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-amber-600 text-xs mb-1">
                        <AlertTriangle size={14} /> สต็อกต้องดูแล
                    </div>
                    <p className="text-lg font-bold text-amber-600">{productStats.stockWarning.toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-1">
                        หมด {productStats.outOfStock} · ใกล้หมด {productStats.lowStock}
                    </p>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_240px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="ค้นหาชื่อสินค้า / รหัสสินค้า..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    <select
                        value={selectedCategory}
                        onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    >
                        <option value="all">ทุกหมวดหมู่</option>
                        {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">
                        <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                        <p className="text-sm">กำลังโหลด...</p>
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Box size={40} className="mx-auto mb-3 text-gray-300" />
                        <p>ยังไม่มีสินค้า</p>
                    </div>
                ) : (
                    <>
                        {/* Table Header */}
                        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 border-b">
                            <div className="col-span-4">สินค้า</div>
                            <div className="col-span-2">หมวดหมู่</div>
                            <div className="col-span-2 text-right">ราคา</div>
                            <div className="col-span-2 text-center">สต็อก</div>
                            <div className="col-span-2 text-right">จัดการ</div>
                        </div>

                        {/* Table Body */}
                        <div className="divide-y divide-gray-50">
                            {paginatedProducts.map((product) => (
                                <div
                                    key={product.id}
                                    onClick={() => openEditModal(product)}
                                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50 cursor-pointer transition-colors"
                                >
                                    {/* Product Info */}
                                    <div className="col-span-8 md:col-span-4 flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-200">
                                            {(product.imageUrls?.[0] || product.imageUrl) ? (
                                                <img src={product.imageUrls?.[0] || product.imageUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon size={16} className="text-gray-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-sm text-gray-900 truncate">{product.name}</p>
                                            {product.sku && (
                                                <p className="text-[11px] text-gray-400 font-mono truncate">รหัส: {product.sku}</p>
                                            )}
                                            {product.hasVariants && (
                                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                                    <Layers size={10} />
                                                    {product.variants?.length || 0} แบบ
                                                </p>
                                            )}
                                            {product.productType === "bundle" && (
                                                <p className="text-xs text-blue-500 flex items-center gap-1">
                                                    <Package size={10} />
                                                    เซต {product.bundleItems?.length || 0} รายการ
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Category */}
                                    <div className="hidden md:block col-span-2">
                                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">{product.category}</span>
                                    </div>

                                    {/* Price */}
                                    <div className="hidden md:block col-span-2 text-right">
                                        <span className="font-semibold text-sm text-gray-900">฿{product.price.toLocaleString()}</span>
                                    </div>

                                    {/* Stock */}
                                    <div className="hidden md:block col-span-2 text-center">
                                        <span className={`font-bold text-sm ${product.stock === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                                            {product.stock}
                                        </span>
                                    </div>

                                    {/* Actions */}
                                    <div className="col-span-4 md:col-span-2 flex items-center justify-end gap-1">
                                        <span className={`text-xs px-2 py-1 rounded font-semibold ${product.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {product.isActive ? 'ขาย' : 'ปิด'}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openEditModal(product); }}
                                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            onClick={(e) => openDeleteConfirm(product, e)}
                                            className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>

                                    {/* Mobile Info */}
                                    <div className="col-span-12 md:hidden flex items-center gap-4 text-xs text-gray-500">
                                        {product.sku && <span className="font-mono">รหัส: {product.sku}</span>}
                                        <span>{product.category}</span>
                                        <span className="font-bold text-gray-900">฿{product.price.toLocaleString()}</span>
                                        <span>สต็อก: {product.stock}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                                <span className="text-gray-500">
                                    {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredProducts.length)} จาก {filteredProducts.length}
                                </span>
                                <div className="flex items-center gap-1">
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
                </>
            )}

            {/* Product Form */}
            {isModalOpen && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                            <span className="font-semibold text-sm text-gray-900">
                                {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
                            </span>
                            <button onClick={closeModal} className="p-1 hover:bg-gray-200 rounded">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4">
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {/* Left: Basic Info */}
                                    <div className="space-y-4">
                                        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                                <Box size={16} className="text-gray-500" />
                                                <span className="font-semibold text-sm text-gray-900">ข้อมูลสินค้า</span>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อสินค้า *</label>
                                                    <input
                                                        {...register("name")}
                                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                    />
                                                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">รหัสสินค้า</label>
                                                    <input
                                                        {...register("sku")}
                                                        placeholder="เช่น AERO-001"
                                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ประเภทสินค้า</label>
                                                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
                                                        <label className={`cursor-pointer rounded-md px-3 py-2 text-center text-xs font-bold transition-colors ${!isBundle ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                                                            <input type="radio" value="single" {...register("productType")} className="sr-only" />
                                                            สินค้าปกติ
                                                        </label>
                                                        <label className={`cursor-pointer rounded-md px-3 py-2 text-center text-xs font-bold transition-colors ${isBundle ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                                                            <input type="radio" value="bundle" {...register("productType")} className="sr-only" />
                                                            สินค้าเซต
                                                        </label>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-500 mb-1">หมวดหมู่ *</label>
                                                        <select
                                                            {...register("category")}
                                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                        >
                                                            <option value="">เลือกหมวดหมู่</option>
                                                            {activeCategoryOptions.map((category) => (
                                                                <option key={category} value={category}>
                                                                    {category}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {activeCategoryOptions.length === 0 && (
                                                            <p className="mt-1 text-[11px] text-amber-600">
                                                                กรุณาสร้างหมวดหมู่ที่หน้าเมนูหมวดหมู่ก่อนเพิ่มสินค้า
                                                            </p>
                                                        )}
                                                        {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category.message}</p>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ลิงก์รูปภาพ (หลายรูป)</label>
                                                    <div className="space-y-2">
                                                        {imageUrlFields.length === 0 ? (
                                                            <p className="text-[11px] text-gray-400">ยังไม่มีลิงก์รูปภาพ</p>
                                                        ) : (
                                                            imageUrlFields.map((field, index) => (
                                                                <div key={field.id} className="flex items-center gap-2">
                                                                    <input
                                                                        {...register(`imageUrls.${index}.url`)}
                                                                        placeholder="https://..."
                                                                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeImageUrl(index)}
                                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                            ))
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => appendImageUrl({ url: "" })}
                                                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                                                        >
                                                            <Plus size={12} />
                                                            เพิ่มลิงก์รูปภาพ
                                                        </button>
                                                    </div>
                                                    <p className="text-[10px] text-gray-400 mt-1">ลิงก์แรกจะเป็นรูปหลักของสินค้า</p>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">อัปโหลดรูปภาพ (เก็บ Base64 แยก)</label>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <label
                                                            htmlFor="product-image-files"
                                                            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                                                        >
                                                            <Upload size={14} />
                                                            เลือกรูปภาพ
                                                        </label>
                                                        <input
                                                            id="product-image-files"
                                                            type="file"
                                                            accept="image/*"
                                                            multiple
                                                            onChange={handleImageFilesChange}
                                                            className="hidden"
                                                        />
                                                        {imageFiles.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={clearImageSelection}
                                                                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100"
                                                            >
                                                                <X size={12} />
                                                                ล้างไฟล์
                                                            </button>
                                                        )}
                                                        {imageFiles.length > 0 && (
                                                            <span className="text-xs text-gray-500">{imageFiles.length} ไฟล์</span>
                                                        )}
                                                    </div>
                                                    {imageFileError && <p className="text-[11px] text-red-500 mt-1">{imageFileError}</p>}
                                                    {imagePreviews.length > 0 && (
                                                        <div className="mt-3 grid grid-cols-4 gap-2">
                                                            {imagePreviews.map((src, index) => (
                                                                <div key={`${src}-${index}`} className="relative border border-gray-200 rounded-lg overflow-hidden">
                                                                    <img src={src} alt="" className="w-full h-16 object-cover" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeImageFile(index)}
                                                                        className="absolute top-1 right-1 bg-white/90 text-gray-600 hover:text-red-500 rounded-full p-1 shadow"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <p className="text-[10px] text-gray-400 mt-1">ไฟล์จะถูกเก็บแยกใน collection สำหรับ Base64</p>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">รายละเอียด</label>
                                                    <textarea
                                                        {...register("description")}
                                                        rows={3}
                                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 resize-y min-h-[60px]"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">คำแนะนำสินค้า</label>
                                                    <select
                                                        {...register("guideId")}
                                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                    >
                                                        <option value="">ไม่ใช้คำแนะนำ</option>
                                                        {productGuides
                                                            .filter((guide) => guide.isActive !== false || guide.id === editingProduct?.guideId)
                                                            .map((guide) => (
                                                                <option key={guide.id} value={guide.id}>
                                                                    {guide.title}
                                                                </option>
                                                            ))}
                                                    </select>
                                                    <p className="mt-1 text-[11px] text-gray-400">สร้างและจัดการคำแนะนำได้ที่หน้าหมวดหมู่ แล้วเลือกใช้กับสินค้า</p>
                                                </div>
                                                <div className="flex items-center justify-between pt-2">
                                                    <span className="text-sm text-gray-700">เปิดขาย</span>
                                                    <input type="checkbox" {...register("isActive")} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20" />
                                                </div>
                                            </div>
                                        </section>
                                    </div>

                                    {/* Right: Stock & Variants */}
                                    <div className="space-y-4">
                                        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <Layers size={16} className="text-gray-500" />
                                                    <span className="font-semibold text-sm text-gray-900">ราคาและสต็อก</span>
                                                </div>
                                                {!isBundle && (
                                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                        <span className="text-gray-500">มีหลายแบบ</span>
                                                        <input type="checkbox" {...register("hasVariants")} className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20" />
                                                    </label>
                                                )}
                                            </div>
                                            <div className="p-4">
                                                {isBundle ? (
                                                    <div className="space-y-4">
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="block text-xs font-semibold text-gray-500 mb-1">ราคาขายเซต (บาท)</label>
                                                                <input
                                                                    type="number"
                                                                    {...register("price")}
                                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-semibold text-gray-500 mb-1">สต็อกเซต</label>
                                                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900">
                                                                    {bundleAvailableStock.toLocaleString()} เซต
                                                                </div>
                                                                <p className="mt-1 text-[11px] text-gray-400">คำนวณจากสินค้าย่อยที่เหลือน้อยที่สุด</p>
                                                            </div>
                                                        </div>
                                                        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                                                            ราคาสินค้าแยกรวม ฿{bundleRegularPrice.toLocaleString()}
                                                            {bundleRegularPrice > Number(watchedPrice || 0) && (
                                                                <span className="ml-2 font-bold">ประหยัด ฿{(bundleRegularPrice - Number(watchedPrice || 0)).toLocaleString()}</span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-semibold text-gray-900">สินค้าในเซต</p>
                                                                <p className="text-xs text-gray-400">เลือกสินค้าหลายตัว และเลือกตัวเลือกของแต่ละสินค้าได้</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => appendBundleItem({ id: generateId(), productId: "", productName: "", variantId: "", variantName: "", quantity: 1, unitPrice: 0 })}
                                                                className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 flex items-center gap-1"
                                                            >
                                                                <Plus size={12} />
                                                                เพิ่มสินค้า
                                                            </button>
                                                        </div>

                                                        {bundleItemFields.length === 0 ? (
                                                            <div className="p-6 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center">
                                                                <Package size={32} className="mx-auto mb-2 text-gray-300" />
                                                                <p className="text-sm text-gray-400">ยังไม่มีสินค้าในเซต</p>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                {bundleItemFields.map((field, index) => {
                                                                    const item = watchedBundleItems?.[index];
                                                                    const selectedProduct = getBundleProduct(item?.productId);
                                                                    const selectedStock = item ? getBundleItemStock(item) : 0;
                                                                    return (
                                                                        <div key={field.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                                                                            <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_80px_auto] gap-2 items-start">
                                                                                <select
                                                                                    value={item?.productId || ""}
                                                                                    onChange={(event) => handleBundleProductChange(index, event.target.value)}
                                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                                                                >
                                                                                    <option value="">เลือกสินค้า</option>
                                                                                    {bundleCandidateProducts.map((product) => (
                                                                                        <option key={product.id} value={product.id}>
                                                                                            {product.name}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                                <select
                                                                                    value={item?.variantId || ""}
                                                                                    onChange={(event) => handleBundleVariantChange(index, event.target.value)}
                                                                                    disabled={!selectedProduct?.hasVariants}
                                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-100 disabled:text-gray-400"
                                                                                >
                                                                                    <option value="">{selectedProduct?.hasVariants ? "ให้ลูกค้าเลือก" : "ไม่มีตัวเลือก"}</option>
                                                                                    {(selectedProduct?.variants || []).map((variant) => (
                                                                                        <option key={variant.id} value={variant.id}>
                                                                                            {variant.name}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                                <input
                                                                                    type="number"
                                                                                    min={1}
                                                                                    {...register(`bundleItems.${index}.quantity`)}
                                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => removeBundleItem(index)}
                                                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            </div>
                                                                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                                                                                <span>ราคา/ชิ้น ฿{Number(item?.unitPrice || 0).toLocaleString()}</span>
                                                                                <span>มีสินค้า {selectedStock.toLocaleString()} ชิ้น</span>
                                                                                <span>ทำได้ {Math.floor(selectedStock / Math.max(1, Number(item?.quantity) || 1)).toLocaleString()} เซต</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : !hasVariants ? (
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-500 mb-1">ราคา (บาท)</label>
                                                            <input
                                                                type="number"
                                                                {...register("price")}
                                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-500 mb-1">สต็อก</label>
                                                            <input
                                                                type="number"
                                                                {...register("stock")}
                                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {/* Base Price */}
                                                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <label className="block text-xs font-semibold text-blue-700 mb-1">ราคาพื้นฐาน (บาท)</label>
                                                                    <p className="text-xs text-blue-500">ใช้เป็นราคาตั้งต้นสำหรับทุกแบบ</p>
                                                                </div>
                                                                <input
                                                                    type="number"
                                                                    {...register("price")}
                                                                    className="w-32 px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm text-gray-900 font-medium text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Options Header */}
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className="text-sm font-semibold text-gray-900">ตัวเลือกสินค้า</p>
                                                                <p className="text-xs text-gray-400">เพิ่มตัวเลือก เช่น สี, ไซส์ แล้วกำหนดค่าแต่ละตัวเลือก</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => appendOption({ id: generateId(), name: "", values: [], allowCustom: false })}
                                                                className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 flex items-center gap-1"
                                                            >
                                                                <Plus size={12} />
                                                                เพิ่มตัวเลือก
                                                            </button>
                                                        </div>

                                                        {/* Options List */}
                                                        <div className="space-y-3">
                                                            {optionFields.length === 0 ? (
                                                                <div className="p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center">
                                                                    <p className="text-sm text-gray-400">ยังไม่มีตัวเลือก กดปุ่มเพิ่มตัวเลือกด้านบน</p>
                                                                </div>
                                                            ) : (
                                                                optionFields.map((field, index) => {
                                                                    const currentValues = watchedOptions?.[index]?.values || [];
                                                                    return (
                                                                        <div key={field.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                                            <div className="flex items-start justify-between mb-3">
                                                                                <div className="flex-1 mr-3">
                                                                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อตัวเลือก {index + 1}</label>
                                                                                    <input
                                                                                        {...register(`options.${index}.name`)}
                                                                                        placeholder="เช่น สี, ไซส์, รุ่น"
                                                                                        onChange={(e) => {
                                                                                            register(`options.${index}.name`).onChange(e);
                                                                                            setTimeout(() => generateVariants(), 100);
                                                                                        }}
                                                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                                                                    />
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => { removeOption(index); setTimeout(() => generateVariants(), 50); }}
                                                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-semibold text-gray-500 mb-1">
                                                                                    ค่าของตัวเลือก <span className="text-gray-400 font-normal">(พิมพ์แล้วกด Enter)</span>
                                                                                </label>
                                                                                <div className="flex flex-wrap gap-2 p-3 bg-white border border-gray-200 rounded-lg min-h-[48px]">
                                                                                    {currentValues.map((val: string, vIndex: number) => (
                                                                                        <span key={vIndex} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                                                                                            {val}
                                                                                            <button type="button" onClick={() => removeValue(index, val)} className="hover:text-red-500 p-0.5"><X size={12} /></button>
                                                                                        </span>
                                                                                    ))}
                                                                                    <input
                                                                                        onKeyDown={(e) => handleKeyDown(e, index)}
                                                                                        placeholder={currentValues.length ? "เพิ่มอีก..." : "เช่น แดง, น้ำเงิน, ดำ"}
                                                                                        className="flex-1 min-w-[100px] text-sm outline-none bg-transparent py-1"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            <label className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    {...register(`options.${index}.allowCustom`)}
                                                                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                                                                                />
                                                                                เปิดตัวเลือกกำหนดเอง
                                                                            </label>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>

                                                        {/* Variants Table */}
                                                        <div className="mt-4 pt-4 border-t border-gray-200">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <div>
                                                                    <p className="text-sm font-semibold text-gray-900">รายการสินค้าทั้งหมด</p>
                                                                    <p className="text-xs text-gray-400">
                                                                        {variantFields.length > 0
                                                                            ? `${variantFields.length} แบบ (กำหนดราคาและจำนวนแต่ละแบบ)`
                                                                            : 'กรุณาเพิ่มตัวเลือกและค่าด้านบนก่อน'
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {variantFields.length === 0 ? (
                                                                <div className="p-6 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center">
                                                                    <Package size={32} className="mx-auto mb-2 text-gray-300" />
                                                                    <p className="text-sm text-gray-400">ยังไม่มีรายการสินค้า</p>
                                                                    <p className="text-xs text-gray-300 mt-1">เพิ่มตัวเลือกและกดพิมพ์ค่า Enter ด้านบน</p>
                                                                </div>
                                                            ) : (
                                                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                                                    <table className="w-full text-sm">
                                                                        <thead className="bg-gray-100 text-xs text-gray-600 font-semibold">
                                                                            <tr>
                                                                                <th className="px-4 py-3 text-left">แบบสินค้า</th>
                                                                                <th className="px-4 py-3 text-right w-28">ราคา (บาท)</th>
                                                                                <th className="px-4 py-3 text-center w-24">จำนวน</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-100 bg-white">
                                                                            {variantFields.map((variant, index) => (
                                                                                <tr key={variant.id} className="hover:bg-gray-50">
                                                                                    <td className="px-4 py-3">
                                                                                        <span className="font-semibold text-gray-900">{watchedVariants?.[index]?.name || variant.name}</span>
                                                                                    </td>
                                                                                    <td className="px-4 py-3">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <span className="text-gray-400 text-xs">฿</span>
                                                                                            <input
                                                                                                type="number"
                                                                                                {...register(`variants.${index}.price`)}
                                                                                                className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-right text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 focus:bg-white"
                                                                                            />
                                                                                        </div>
                                                                                    </td>
                                                                                    <td className="px-4 py-3">
                                                                                        <input
                                                                                            type="number"
                                                                                            {...register(`variants.${index}.stock`)}
                                                                                            className={`w-full px-2 py-1.5 border rounded-lg text-center text-sm font-bold focus:outline-none focus:ring-2 focus:ring-gray-900/10 ${Number(watchedVariants?.[index]?.stock) === 0
                                                                                                ? 'bg-red-50 border-red-200 text-red-600'
                                                                                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white'
                                                                                                }`}
                                                                                        />
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                        <tfoot className="bg-gray-50 border-t border-gray-200">
                                                                            <tr>
                                                                                <td className="px-4 py-2 text-xs font-semibold text-gray-500">
                                                                                    รวม {variantFields.length} แบบ
                                                                                </td>
                                                                                <td className="px-4 py-2 text-right text-xs text-gray-400">
                                                                                    ราคาเริ่ม ฿{Math.min(...(watchedVariants?.map(v => Number(v?.price) || 0) || [0])).toLocaleString()}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-center text-xs font-semibold text-gray-700">
                                                                                    {(watchedVariants?.reduce((sum, v) => sum + (Number(v?.stock) || 0), 0) || 0).toLocaleString()} ชิ้น
                                                                                </td>
                                                                            </tr>
                                                                        </tfoot>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </section>

                                        {!isBundle && (
                                        <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                                                <div>
                                                    <span className="font-semibold text-sm text-gray-900">บริการเสริม</span>
                                                    <p className="text-xs text-gray-400">เช่น ปักชื่อ ติดโลโก้ หรือบริการที่คิดราคาเพิ่ม</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => appendAddOn({
                                                        id: generateId(),
                                                        name: "",
                                                        price: 0,
                                                        inputLabel: "ข้อความที่ต้องการ",
                                                        placeholder: "กรอกชื่อที่ต้องการปัก",
                                                        required: true,
                                                        maxLength: 40,
                                                        isActive: true
                                                    })}
                                                    className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 flex items-center gap-1"
                                                >
                                                    <Plus size={12} />
                                                    เพิ่มบริการ
                                                </button>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                {addOnFields.length === 0 ? (
                                                    <div className="p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center">
                                                        <p className="text-sm text-gray-400">ยังไม่มีบริการเสริม</p>
                                                    </div>
                                                ) : (
                                                    addOnFields.map((field, index) => (
                                                        <div key={field.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                                                            <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_auto] gap-2 items-center">
                                                                <input
                                                                    {...register(`addOns.${index}.name`)}
                                                                    placeholder="ชื่อบริการ เช่น ปักชื่อ"
                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    {...register(`addOns.${index}.price`)}
                                                                    placeholder="ราคา"
                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeAddOn(index)}
                                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                <input
                                                                    {...register(`addOns.${index}.inputLabel`)}
                                                                    placeholder="หัวข้อช่องกรอก เช่น ชื่อที่ต้องการปัก"
                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                                                />
                                                                <input
                                                                    {...register(`addOns.${index}.placeholder`)}
                                                                    placeholder="ข้อความตัวอย่างในช่องกรอก"
                                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                                                />
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                                                    <input type="checkbox" {...register(`addOns.${index}.required`)} className="h-4 w-4 rounded border-gray-300 text-gray-900" />
                                                                    บังคับกรอกเมื่อเลือก
                                                                </label>
                                                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                                                    <input type="checkbox" {...register(`addOns.${index}.isActive`)} className="h-4 w-4 rounded border-gray-300 text-gray-900" />
                                                                    เปิดใช้
                                                                </label>
                                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                                    จำกัด
                                                                    <input
                                                                        type="number"
                                                                        {...register(`addOns.${index}.maxLength`)}
                                                                        className="w-20 px-2 py-1 bg-white border border-gray-200 rounded-lg text-sm"
                                                                    />
                                                                    ตัวอักษร
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </section>
                                        )}
                                    </div>
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
                                        {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                        {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
            )}

            {isDeleteConfirmOpen && deleteTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl overflow-hidden shadow-2xl">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
                            <h3 className="font-semibold text-gray-900 text-sm">ลบสินค้า</h3>
                            <button onClick={closeDeleteConfirm} className="p-1 hover:bg-gray-100 rounded">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 bg-[#F8F9FA] space-y-2">
                            <p className="text-sm text-gray-700">
                                ต้องการลบสินค้า {deleteTarget.name} ใช่หรือไม่?
                            </p>
                            <p className="text-xs text-red-600">ลบแล้วไม่สามารถกู้คืนได้</p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex gap-3">
                            <button
                                onClick={closeDeleteConfirm}
                                className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                disabled={deletingProductId === deleteTarget.id}
                            >
                                ปิด
                            </button>
                            <button
                                onClick={confirmDeleteProduct}
                                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                                disabled={deletingProductId === deleteTarget.id}
                            >
                                {deletingProductId === deleteTarget.id ? "กำลังลบ..." : "ยืนยันลบ"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


