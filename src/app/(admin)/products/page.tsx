"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Search, X, Box, Layers, Image as ImageIcon, Save, ChevronLeft, ChevronRight, Loader2, Package, Upload, CheckCircle, AlertTriangle } from "lucide-react";
import { Product, ProductGuide } from "@/types/product";
import { ProductCategory } from "@/types/category";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { fetchProductBase64ImageItems, getPrimaryProductImage, type ProductBase64Image } from "@/lib/productImages";
import { StoreSettings } from "@/types/store";

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
        isDefault: z.boolean().optional().default(false),
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
    const [productBase64Images, setProductBase64Images] = useState<Record<string, ProductBase64Image[]>>({});
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
    const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
    const [variantDefaultStock, setVariantDefaultStock] = useState(0);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
    const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
    const [useStorageForProductImages, setUseStorageForProductImages] = useState(false);
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
    const watchedImageUrls = watch("imageUrls");

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
        let isCancelled = false;
        const loadBase64Images = async () => {
            const productsWithBase64 = products.filter((product) => product.imageBase64Ids?.length);
            if (productsWithBase64.length === 0) {
                setProductBase64Images({});
                return;
            }

            const entries = await Promise.all(
                productsWithBase64.map(async (product) => [
                    product.id,
                    await fetchProductBase64ImageItems(product)
                ] as const)
            );

            if (!isCancelled) {
                setProductBase64Images(Object.fromEntries(entries));
            }
        };

        loadBase64Images().catch((error) => {
            console.error("Error loading product base64 images:", error);
        });

        return () => {
            isCancelled = true;
        };
    }, [products]);

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

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, "settings", "store"), (snapshot) => {
            const data = snapshot.exists() ? snapshot.data() as StoreSettings : null;
            setUseStorageForProductImages(Boolean(data?.useStorageForProductImages));
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

        const generatedVariants = combinations.map(combo => {
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
                return { ...match, name, attributes, isDefault: Boolean(match.isDefault) };
            }

            const sku = `SKU-${combo.map(c => c.substring(0, 2).toUpperCase()).join('-')}-${Date.now().toString(36).slice(-4)}`;
            return { id: generateId(), name, price: basePrice, stock: variantDefaultStock, sku, isDefault: false, attributes };
        });
        const hasDefaultVariant = generatedVariants.some((variant) => variant.isDefault);
        const newVariants = generatedVariants.map((variant, index) => ({
            ...variant,
            isDefault: hasDefaultVariant ? Boolean(variant.isDefault) : index === 0
        }));

        replaceVariants(newVariants);
    };

    const applyVariantDefaults = () => {
        const variants = getValues("variants") || [];
        const basePrice = Number(getValues("price")) || 0;
        setValue("variants", variants.map((variant) => ({
            ...variant,
            price: basePrice,
            stock: variantDefaultStock
        })), { shouldDirty: true });
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

    const applySizeOptionPreset = () => {
        const sizeValues = ["S", "M", "L", "XL", "XXL", "3XL"];
        const currentOptions = getValues("options") || [];
        const sizeOptionIndex = currentOptions.findIndex((option) => {
            const name = option.name?.trim().toLowerCase();
            return name === "ไซต์" || name === "ไซส์" || name === "size";
        });

        if (sizeOptionIndex >= 0) {
            const currentOption = currentOptions[sizeOptionIndex];
            updateOption(sizeOptionIndex, {
                ...currentOption,
                name: currentOption.name?.trim() || "ไซต์",
                values: Array.from(new Set([...(currentOption.values || []), ...sizeValues]))
            });
        } else {
            appendOption({
                id: generateId(),
                name: "ไซต์",
                values: sizeValues,
                allowCustom: false
            });
        }

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
        const maxBytes = useStorageForProductImages ? 5 * 1024 * 1024 : 700 * 1024;
        const tooLarge = files.find((file) => file.size > maxBytes);
        if (tooLarge) {
            setImageFileError(`ไฟล์ใหญ่เกินไป (จำกัด ${useStorageForProductImages ? "5MB" : "700KB"}) โปรดบีบอัดรูป`);
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

    const removeSavedBase64Image = async (imageId: string) => {
        if (!editingProduct || deletingImageId) return;
        const nextImageIds = (editingProduct.imageBase64Ids || []).filter((id) => id !== imageId);

        try {
            setDeletingImageId(imageId);
            await deleteDoc(doc(db, "product_images", imageId));
            await updateDoc(doc(db, "products", editingProduct.id), {
                imageBase64Ids: nextImageIds,
                updatedAt: serverTimestamp()
            });

            setEditingProduct({ ...editingProduct, imageBase64Ids: nextImageIds });
            setProductBase64Images((prev) => ({
                ...prev,
                [editingProduct.id]: (prev[editingProduct.id] || []).filter((image) => image.id !== imageId)
            }));
        } catch (error) {
            console.error("Error deleting product image:", error);
            alert("เกิดข้อผิดพลาดในการลบรูปภาพ");
        } finally {
            setDeletingImageId(null);
        }
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

    const saveStorageImages = async (productId: string) => {
        if (imageFiles.length === 0) return [];
        const urls: string[] = [];
        for (const file of imageFiles) {
            const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
            const storageRef = ref(storage, `products/${productId}/${Date.now()}-${generateId()}.${extension}`);
            await uploadBytes(storageRef, file, {
                contentType: file.type || "image/jpeg"
            });
            urls.push(await getDownloadURL(storageRef));
        }
        return urls;
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
        const selectedDefaultVariantIndex = (data.variants || []).findIndex((variant) => variant.isDefault);
        const effectiveDefaultVariantIndex = selectedDefaultVariantIndex >= 0 ? selectedDefaultVariantIndex : 0;
        const normalizedVariants = (data.variants || []).map((variant, index) => ({
            ...variant,
            sku: (variant.sku || "").trim(),
            price: Number(variant.price) || 0,
            stock: Number(variant.stock) || 0,
            isDefault: index === effectiveDefaultVariantIndex
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
                if (useStorageForProductImages) {
                    const newStorageUrls = await saveStorageImages(editingProduct.id);
                    if (newStorageUrls.length > 0) {
                        await updateDoc(doc(db, "products", editingProduct.id), {
                            imageUrls: [...cleanedImageUrls, ...newStorageUrls],
                            imageUrl: cleanedImageUrls[0] || newStorageUrls[0] || ""
                        });
                    }
                } else {
                    const newBase64Ids = await saveBase64Images(editingProduct.id);
                    if (newBase64Ids.length > 0) {
                        await updateDoc(doc(db, "products", editingProduct.id), {
                            imageBase64Ids: [...existingBase64Ids, ...newBase64Ids]
                        });
                    }
                }
            } else {
                const docRef = await addDoc(collection(db, "products"), { ...productData, createdAt: serverTimestamp() });
                if (useStorageForProductImages) {
                    const newStorageUrls = await saveStorageImages(docRef.id);
                    if (newStorageUrls.length > 0) {
                        await updateDoc(docRef, {
                            imageUrls: [...cleanedImageUrls, ...newStorageUrls],
                            imageUrl: cleanedImageUrls[0] || newStorageUrls[0] || ""
                        });
                    }
                } else {
                    const newBase64Ids = await saveBase64Images(docRef.id);
                    if (newBase64Ids.length > 0) {
                        await updateDoc(docRef, { imageBase64Ids: newBase64Ids });
                    }
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
        const defaultVariant = product.variants?.find((variant) => variant.isDefault) || product.variants?.[0];
        setVariantDefaultStock(Number(defaultVariant?.stock) || 0);
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
        setVariantDefaultStock(0);
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

    const savedBase64Images = editingProduct ? productBase64Images[editingProduct.id] || [] : [];

    const getProductDisplayStock = useCallback((product: Product) => {
        if (product.productType !== "bundle" || !product.bundleItems?.length) {
            return Number(product.stock) || 0;
        }

        const bundleStocks = product.bundleItems.map((item) => {
            const childProduct = products.find((candidate) => candidate.id === item.productId);
            if (!childProduct) return 0;

            const childStock = childProduct.hasVariants
                ? item.variantId
                    ? childProduct.variants?.find((variant) => variant.id === item.variantId)?.stock || 0
                    : childProduct.stock || 0
                : childProduct.stock || 0;

            return Math.floor((Number(childStock) || 0) / Math.max(1, Number(item.quantity) || 1));
        });

        return bundleStocks.length ? Math.min(...bundleStocks) : 0;
    }, [products]);

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
        }).sort((a, b) => {
            const aSku = a.sku?.trim() || "";
            const bSku = b.sku?.trim() || "";
            if (aSku && !bSku) return -1;
            if (!aSku && bSku) return 1;
            const skuCompare = aSku.localeCompare(bSku, "th", { numeric: true, sensitivity: "base" });
            if (skuCompare !== 0) return skuCompare;
            return a.name.localeCompare(b.name, "th", { numeric: true, sensitivity: "base" });
        });
    }, [products, searchTerm, selectedCategory]);

    const productStats = useMemo(() => {
        const activeProducts = products.filter((product) => product.isActive).length;
        const variantProducts = products.filter((product) => product.hasVariants).length;
        const bundleProducts = products.filter((product) => product.productType === "bundle").length;
        const outOfStock = products.filter((product) => getProductDisplayStock(product) === 0).length;
        const lowStock = products.filter((product) => {
            const stock = getProductDisplayStock(product);
            return stock > 0 && stock <= 5;
        }).length;

        return {
            total: products.length,
            activeProducts,
            variantProducts,
            bundleProducts,
            stockWarning: outOfStock + lowStock,
            outOfStock,
            lowStock
        };
    }, [getProductDisplayStock, products]);

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="mx-auto max-w-7xl space-y-3.5">
            {/* Header */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-sm font-bold tracking-tight text-slate-800 sm:text-base">
                            {isModalOpen ? (editingProduct ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่") : "จัดการสินค้า"}
                        </h1>
                        {!isModalOpen && (
                            <span className="rounded-md border border-slate-200/80 bg-slate-100/80 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">
                                {products.length} รายการ
                            </span>
                        )}
                        {isModalOpen && editingProduct && (
                            <span className="max-w-[200px] truncate rounded-md border border-slate-200/80 bg-slate-100/80 px-2 py-0.5 font-mono text-xs text-slate-600">
                                {editingProduct.sku ? `#${editingProduct.sku}` : editingProduct.name}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                        {isModalOpen
                            ? "กำหนดข้อมูลสินค้า ราคา สต็อก ตัวเลือก และสินค้าเซต"
                            : "รายการสินค้าทั้งหมด ตรวจสอบสต็อก และกำหนดราคาขาย"}
                    </p>
                </div>

                {isModalOpen ? (
                    <button
                        type="button"
                        onClick={closeModal}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
                    >
                        <ChevronLeft size={14} />
                        กลับไปหน้ารายการสินค้า
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-medium text-white shadow-xs transition hover:bg-slate-800"
                    >
                        <Plus size={14} />
                        เพิ่มสินค้าใหม่
                    </button>
                )}
            </div>

            {!isModalOpen && (
                <>
                    {/* Summary KPI Cards */}
                    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                        {/* Total */}
                        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs transition hover:border-slate-300/80">
                            <div className="mb-1.5 flex items-center justify-between text-slate-400">
                                <span className="text-[11px] font-medium text-slate-500">สินค้าทั้งหมด</span>
                                <div className="rounded-md bg-slate-100 p-1 text-slate-600">
                                    <Package size={13} />
                                </div>
                            </div>
                            <p className="font-mono text-xl font-bold text-slate-900">{productStats.total.toLocaleString()}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">รวมทุกหมวดหมู่ในระบบ</p>
                        </div>

                        {/* Active */}
                        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs transition hover:border-slate-300/80">
                            <div className="mb-1.5 flex items-center justify-between text-slate-400">
                                <span className="text-[11px] font-medium text-slate-500">เปิดขายอยู่</span>
                                <div className="rounded-md border border-emerald-100 bg-emerald-50 p-1 text-emerald-600">
                                    <CheckCircle size={13} />
                                </div>
                            </div>
                            <p className="font-mono text-xl font-bold text-emerald-700">{productStats.activeProducts.toLocaleString()}</p>
                            <p className="mt-0.5 text-[10px] text-emerald-600/80">พร้อมให้ลูกค้าสั่งซื้อ</p>
                        </div>

                        {/* Bundles & Variants */}
                        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs transition hover:border-slate-300/80">
                            <div className="mb-1.5 flex items-center justify-between text-slate-400">
                                <span className="text-[11px] font-medium text-slate-500">เซต / มีตัวเลือก</span>
                                <div className="rounded-md border border-blue-100 bg-blue-50 p-1 text-blue-600">
                                    <Layers size={13} />
                                </div>
                            </div>
                            <p className="font-mono text-xl font-bold text-blue-700">
                                {productStats.bundleProducts.toLocaleString()} <span className="text-xs font-normal text-slate-400">/</span> {productStats.variantProducts.toLocaleString()}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-400">เซต {productStats.bundleProducts} · มีตัวเลือก {productStats.variantProducts}</p>
                        </div>

                        {/* Stock Warning */}
                        <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs transition hover:border-slate-300/80">
                            <div className="mb-1.5 flex items-center justify-between text-slate-400">
                                <span className="text-[11px] font-medium text-slate-500">สต็อกต้องดูแล</span>
                                <div className="rounded-md border border-amber-100 bg-amber-50 p-1 text-amber-600">
                                    <AlertTriangle size={13} />
                                </div>
                            </div>
                            <p className="font-mono text-xl font-bold text-amber-700">{productStats.stockWarning.toLocaleString()}</p>
                            <p className="mt-0.5 text-[10px] text-amber-700/80">
                                หมด <span className="font-bold text-rose-600">{productStats.outOfStock}</span> · ใกล้หมด {productStats.lowStock}
                            </p>
                        </div>
                    </div>

                    {/* Search & Filters Toolbar */}
                    <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-xs sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อสินค้า / รหัสสินค้า (SKU)..."
                                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8 pr-7 text-xs text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-300"
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                        <select
                            value={selectedCategory}
                            onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-300 sm:w-56"
                        >
                            <option value="all">ทุกหมวดหมู่ ({products.length})</option>
                            {categoryOptions.map((category) => (
                                <option key={category} value={category}>
                                    {category}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Products Table Card */}
                    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
                        {isLoading ? (
                            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 p-8 text-slate-400">
                                <Loader2 className="animate-spin text-slate-500" size={24} />
                                <p className="text-xs font-medium text-slate-500">กำลังโหลดรายการสินค้า...</p>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">
                                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                    <Box size={22} />
                                </div>
                                <p className="text-sm font-semibold text-slate-700">ไม่พบสินค้า</p>
                                <p className="mt-1 text-xs text-slate-400">
                                    {searchTerm || selectedCategory !== "all"
                                        ? "ลองเปลี่ยนคำค้นหาหรือตัวกรองหมวดหมู่"
                                        : "ยังไม่มีสินค้าในระบบ เริ่มต้นเพิ่มสินค้าชิ้นแรกของคุณ"}
                                </p>
                                {(searchTerm || selectedCategory !== "all") && (
                                    <button
                                        type="button"
                                        onClick={() => { setSearchTerm(""); setSelectedCategory("all"); }}
                                        className="mt-3 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                                    >
                                        ล้างการค้นหา
                                    </button>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* Table Header */}
                                <div className="hidden md:grid grid-cols-12 gap-2 border-b border-slate-200/70 bg-slate-50/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                    <div className="col-span-5">สินค้า</div>
                                    <div className="col-span-2">หมวดหมู่</div>
                                    <div className="col-span-2 text-right">ราคา</div>
                                    <div className="col-span-1 text-center">สต็อก</div>
                                    <div className="col-span-2 text-right">สถานะ / จัดการ</div>
                                </div>

                                {/* Table Rows */}
                                <div className="divide-y divide-slate-100">
                                    {paginatedProducts.map((product) => {
                                        const primaryImage = getPrimaryProductImage(product, productBase64Images[product.id]?.map((image) => image.base64));
                                        const displayStock = getProductDisplayStock(product);
                                        const isOutOfStock = displayStock === 0;
                                        return (
                                            <div
                                                key={product.id}
                                                onClick={() => openEditModal(product)}
                                                className="group grid grid-cols-12 items-center gap-2 px-4 py-3 transition hover:bg-slate-50/60 cursor-pointer"
                                            >
                                                {/* Product Info */}
                                                <div className="col-span-8 md:col-span-5 flex items-center gap-3 min-w-0">
                                                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 flex items-center justify-center">
                                                        {primaryImage ? (
                                                            <img src={primaryImage} alt="" className="h-full w-full object-cover" />
                                                        ) : (
                                                            <ImageIcon size={16} className="text-slate-400" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-xs font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                                                            {product.name}
                                                        </p>
                                                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                            {product.sku && (
                                                                <span className="font-mono text-[10px] text-slate-400">
                                                                    {product.sku}
                                                                </span>
                                                            )}
                                                            {product.hasVariants && (
                                                                <span className="inline-flex items-center gap-0.5 rounded border border-slate-200/60 bg-slate-100/70 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
                                                                    <Layers size={9} />
                                                                    {product.variants?.length || 0} แบบ
                                                                </span>
                                                            )}
                                                            {product.productType === "bundle" && (
                                                                <span className="inline-flex items-center gap-0.5 rounded border border-blue-200/60 bg-blue-50 px-1.5 py-0.2 text-[10px] font-medium text-blue-700">
                                                                    <Package size={9} />
                                                                    เซต {product.bundleItems?.length || 0} รายการ
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Category */}
                                                <div className="hidden md:block col-span-2">
                                                    <span className="inline-block truncate max-w-full rounded border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                                        {product.category}
                                                    </span>
                                                </div>

                                                {/* Price */}
                                                <div className="hidden md:block col-span-2 text-right">
                                                    <span className="font-mono text-xs font-bold text-slate-900">
                                                        ฿{product.price.toLocaleString()}
                                                    </span>
                                                </div>

                                                {/* Stock */}
                                                <div className="hidden md:block col-span-1 text-center">
                                                    <span className={`inline-block font-mono text-xs font-semibold ${
                                                        isOutOfStock
                                                            ? "rounded border border-rose-200/60 bg-rose-50 px-1.5 py-0.5 text-rose-600"
                                                            : displayStock <= 5
                                                                ? "rounded border border-amber-200/60 bg-amber-50 px-1.5 py-0.5 text-amber-700"
                                                                : "text-slate-800"
                                                    }`}>
                                                        {displayStock.toLocaleString()}{product.productType === "bundle" ? " เซต" : ""}
                                                    </span>
                                                </div>

                                                {/* Actions & Status */}
                                                <div className="col-span-4 md:col-span-2 flex items-center justify-end gap-1.5">
                                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                                        product.isActive
                                                            ? "border-emerald-200/60 bg-emerald-50 text-emerald-700"
                                                            : "border-slate-200/60 bg-slate-100 text-slate-500"
                                                    }`}>
                                                        {product.isActive ? "เปิดขาย" : "ปิด"}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); openEditModal(product); }}
                                                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                                        title="แก้ไข"
                                                    >
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => openDeleteConfirm(product, e)}
                                                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                        title="ลบ"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>

                                                {/* Mobile Info Fallback */}
                                                <div className="col-span-12 md:hidden flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                                                    <span>หมวด: {product.category}</span>
                                                    <span className="font-mono font-bold text-slate-900">฿{product.price.toLocaleString()}</span>
                                                    <span>สต็อก: {displayStock.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Pagination Footer */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between border-t border-slate-200/70 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500">
                                        <span>
                                            แสดง {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, filteredProducts.length)} จาก {filteredProducts.length} รายการ
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                                            >
                                                <ChevronLeft size={13} />
                                                ก่อนหน้า
                                            </button>
                                            <span className="px-2 font-mono text-xs font-semibold text-slate-700">
                                                {currentPage} / {totalPages}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                                className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
                                            >
                                                ถัดไป
                                                <ChevronRight size={13} />
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
                <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
                    {/* Form Header */}
                    <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-5 py-3">
                        <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-white text-xs">
                                {editingProduct ? <Pencil size={12} /> : <Plus size={12} />}
                            </span>
                            <span className="text-sm font-semibold text-slate-900">
                                {editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}
                            </span>
                            {editingProduct && (
                                <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                                    ID: {editingProduct.id.slice(0, 8)}...
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={closeModal}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        >
                            <X size={15} />
                        </button>
                    </div>

                    <div className="p-4 sm:p-5">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Left Column: Basic Info */}
                                <div className="space-y-4">
                                    <section className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
                                        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/70">
                                            <Box size={14} className="text-slate-500" />
                                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">ข้อมูลสินค้า</span>
                                        </div>
                                        <div className="p-3.5 space-y-3">
                                            {/* Name */}
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                                    ชื่อสินค้า <span className="text-rose-500">*</span>
                                                </label>
                                                <input
                                                    {...register("name")}
                                                    placeholder="เช่น เสื้อยืด Aero Classic"
                                                    className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                                />
                                                {errors.name && <p className="text-rose-500 text-[11px] mt-1">{errors.name.message}</p>}
                                            </div>

                                            {/* SKU & Product Type */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">รหัสสินค้า (SKU)</label>
                                                    <input
                                                        {...register("sku")}
                                                        placeholder="เช่น AERO-001"
                                                        className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 font-mono placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">ประเภทสินค้า</label>
                                                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5 border border-slate-200/60 h-8 items-center">
                                                        <label className={`flex items-center justify-center h-7 cursor-pointer rounded-md text-[11px] transition-all ${
                                                            !isBundle ? "bg-white text-slate-900 font-semibold shadow-2xs" : "text-slate-500 font-medium hover:text-slate-700"
                                                        }`}>
                                                            <input type="radio" value="single" {...register("productType")} className="sr-only" />
                                                            สินค้าปกติ
                                                        </label>
                                                        <label className={`flex items-center justify-center h-7 cursor-pointer rounded-md text-[11px] transition-all ${
                                                            isBundle ? "bg-white text-slate-900 font-semibold shadow-2xs" : "text-slate-500 font-medium hover:text-slate-700"
                                                        }`}>
                                                            <input type="radio" value="bundle" {...register("productType")} className="sr-only" />
                                                            สินค้าเซต
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Category */}
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                                    หมวดหมู่ <span className="text-rose-500">*</span>
                                                </label>
                                                <select
                                                    {...register("category")}
                                                    className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
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
                                                {errors.category && <p className="text-rose-500 text-[11px] mt-1">{errors.category.message}</p>}
                                            </div>

                                            {/* Image URLs */}
                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <div>
                                                        <label className="text-[11px] font-medium text-slate-700">รูปภาพสินค้า</label>
                                                        <span className="text-[10px] text-slate-400 ml-1.5">(รูปแรกจะถูกใช้เป็นภาพปกหลัก)</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => appendImageUrl({ url: "" })}
                                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition"
                                                    >
                                                        <Plus size={11} />
                                                        เพิ่มลิงก์
                                                    </button>
                                                </div>

                                                {imageUrlFields.length === 0 ? (
                                                    <p className="text-[11px] text-slate-400 italic">ยังไม่มีรูปภาพสินค้า</p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {/* Grid รูปภาพสินค้า (ไม่แสดงตัวหนังสือลิงก์) */}
                                                        {imageUrlFields.some((_, i) => Boolean(watchedImageUrls?.[i]?.url?.trim())) && (
                                                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                                                {imageUrlFields.map((field, index) => {
                                                                    const currentUrl = watchedImageUrls?.[index]?.url?.trim() || "";
                                                                    if (!currentUrl) return null;
                                                                    return (
                                                                        <div
                                                                            key={field.id}
                                                                            className="group relative aspect-square rounded-lg border border-slate-200 bg-slate-100 overflow-hidden shadow-2xs transition hover:border-slate-300"
                                                                        >
                                                                            <input
                                                                                type="hidden"
                                                                                value={currentUrl}
                                                                                {...register(`imageUrls.${index}.url`)}
                                                                            />
                                                                            <a
                                                                                href={currentUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="block w-full h-full"
                                                                                title="คลิกเพื่อดูรูปภาพขนาดเต็ม"
                                                                            >
                                                                                <img
                                                                                    src={currentUrl}
                                                                                    alt={`ภาพที่ ${index + 1}`}
                                                                                    className="w-full h-full object-cover transition group-hover:scale-105"
                                                                                    onError={(e) => {
                                                                                        (e.currentTarget as HTMLImageElement).src = "";
                                                                                        (e.currentTarget as HTMLImageElement).alt = "ไม่พบรูปภาพ";
                                                                                    }}
                                                                                />
                                                                            </a>

                                                                            {index === 0 && (
                                                                                <span className="absolute bottom-0 inset-x-0 bg-blue-600/90 text-white text-[9px] text-center font-medium py-0.5 leading-none">
                                                                                    ภาพปก
                                                                                </span>
                                                                            )}

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => removeImageUrl(index)}
                                                                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-white/95 text-slate-600 shadow-xs hover:bg-rose-50 hover:text-rose-600 transition opacity-80 group-hover:opacity-100"
                                                                                title="ลบรูปภาพนี้"
                                                                            >
                                                                                <X size={11} />
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* ช่องกรอกกรณีผู้ใช้กด "เพิ่มลิงก์" ใหม่เอง */}
                                                        {imageUrlFields.map((field, index) => {
                                                            const currentUrl = watchedImageUrls?.[index]?.url?.trim() || "";
                                                            if (currentUrl) return null;
                                                            return (
                                                                <div key={field.id} className="flex items-center gap-1.5 p-1 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
                                                                    <div className="w-7 h-7 rounded-md bg-slate-200 flex items-center justify-center shrink-0">
                                                                        <ImageIcon size={13} className="text-slate-400" />
                                                                    </div>
                                                                    <input
                                                                        {...register(`imageUrls.${index}.url`)}
                                                                        placeholder="วางลิงก์รูปภาพ https://..."
                                                                        autoFocus
                                                                        className="flex-1 h-7 px-2 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white rounded transition"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeImageUrl(index)}
                                                                        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                                                                        title="ยกเลิก"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* File Upload & Storage */}
                                            <div className="pt-1 border-t border-slate-100">
                                                <label className="block text-[11px] font-medium text-slate-600 mb-1.5">
                                                    อัปโหลดไฟล์รูปภาพ ({useStorageForProductImages ? "Firebase Storage" : "Base64"})
                                                </label>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <label
                                                        htmlFor="product-image-files"
                                                        className="inline-flex h-7.5 items-center gap-1.5 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 cursor-pointer transition"
                                                    >
                                                        <Upload size={12} className="text-slate-500" />
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
                                                            className="inline-flex h-7.5 items-center gap-1 px-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs font-medium text-rose-600 hover:bg-rose-100 transition"
                                                        >
                                                            <X size={12} />
                                                            ล้าง ({imageFiles.length})
                                                        </button>
                                                    )}
                                                </div>
                                                {imageFileError && <p className="text-[11px] text-rose-500 mt-1">{imageFileError}</p>}

                                                {/* Saved Base64 Images */}
                                                {savedBase64Images.length > 0 && (
                                                    <div className="mt-2.5">
                                                        <p className="mb-1 text-[11px] font-medium text-slate-500">รูปที่บันทึกไว้ในระบบ</p>
                                                        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                                                            {savedBase64Images.map((image) => (
                                                                <div key={image.id} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                                                    <img src={image.base64} alt="" className="h-12 w-full object-cover" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeSavedBase64Image(image.id)}
                                                                        disabled={deletingImageId === image.id}
                                                                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-white/90 text-slate-600 shadow-xs hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 transition"
                                                                        aria-label="ลบรูปภาพ"
                                                                    >
                                                                        {deletingImageId === image.id ? (
                                                                            <Loader2 size={10} className="animate-spin" />
                                                                        ) : (
                                                                            <X size={11} />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Local Previews */}
                                                {imagePreviews.length > 0 && (
                                                    <div className="mt-2.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                                                        {imagePreviews.map((src, index) => (
                                                            <div key={`${src}-${index}`} className="relative rounded-lg border border-slate-200 bg-slate-100 overflow-hidden">
                                                                <img src={src} alt="" className="h-12 w-full object-cover" />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeImageFile(index)}
                                                                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-white/90 text-slate-600 shadow-xs hover:bg-rose-50 hover:text-rose-600 transition"
                                                                >
                                                                    <X size={11} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Description */}
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-600 mb-1">รายละเอียดสินค้า</label>
                                                <textarea
                                                    {...register("description")}
                                                    rows={3}
                                                    placeholder="รายละเอียด ขนาด วัสดุ คุณสมบัติ..."
                                                    className="w-full px-2.5 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition resize-y min-h-[60px]"
                                                />
                                            </div>

                                            {/* Guide */}
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-600 mb-1">คำแนะนำสินค้า</label>
                                                <select
                                                    {...register("guideId")}
                                                    className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
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
                                                <p className="mt-1 text-[10px] text-slate-400">สร้างและจัดการคำแนะนำได้ที่หน้าหมวดหมู่</p>
                                            </div>

                                            {/* Active Status Toggle */}
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                                <div>
                                                    <span className="text-xs font-medium text-slate-800">เปิดขายสินค้า</span>
                                                    <p className="text-[10px] text-slate-400">แสดงสินค้านี้ในหน้าร้านค้าออนไลน์</p>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    {...register("isActive")}
                                                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                                                />
                                            </div>
                                        </div>
                                    </section>
                                </div>

                                {/* Right Column: Stock, Variants & Bundles */}
                                <div className="space-y-4">
                                    <section className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
                                        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/70">
                                            <div className="flex items-center gap-2">
                                                <Layers size={14} className="text-slate-500" />
                                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">ราคาและสต็อก</span>
                                            </div>
                                            {!isBundle && (
                                                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        {...register("hasVariants")}
                                                        className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                                                    />
                                                    <span className="text-xs font-medium text-slate-600">มีหลายแบบ / ตัวเลือก</span>
                                                </label>
                                            )}
                                        </div>
                                        <div className="p-3.5">
                                            {isBundle ? (
                                                /* Bundle Mode */
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-[11px] font-medium text-slate-600 mb-1">ราคาขายเซต (บาท)</label>
                                                            <input
                                                                type="number"
                                                                {...register("price")}
                                                                className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[11px] font-medium text-slate-600 mb-1">สต็อกเซตคำนวณได้</label>
                                                            <div className="flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 font-mono text-xs font-bold text-slate-900">
                                                                {bundleAvailableStock.toLocaleString()} เซต
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="rounded-lg border border-sky-200/70 bg-sky-50/60 px-3 py-2 text-xs text-sky-800">
                                                        ราคาสินค้าแยกรวม ฿{bundleRegularPrice.toLocaleString()}
                                                        {bundleRegularPrice > Number(watchedPrice || 0) && (
                                                            <span className="ml-2 font-bold text-emerald-700">
                                                                (ประหยัด ฿{(bundleRegularPrice - Number(watchedPrice || 0)).toLocaleString()})
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between pt-1">
                                                        <div>
                                                            <p className="text-xs font-semibold text-slate-800">สินค้าในเซต</p>
                                                            <p className="text-[10px] text-slate-400">เลือกสินค้าและตัวเลือกที่รวมในเซตนี้</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => appendBundleItem({ id: generateId(), productId: "", productName: "", variantId: "", variantName: "", quantity: 1, unitPrice: 0 })}
                                                            className="inline-flex h-7 items-center gap-1 px-2.5 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-800 transition"
                                                        >
                                                            <Plus size={11} />
                                                            เพิ่มสินค้า
                                                        </button>
                                                    </div>

                                                    {bundleItemFields.length === 0 ? (
                                                        <div className="p-5 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center">
                                                            <Package size={24} className="mx-auto mb-1 text-slate-300" />
                                                            <p className="text-xs text-slate-400">ยังไม่มีสินค้าในเซต</p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {bundleItemFields.map((field, index) => {
                                                                const item = watchedBundleItems?.[index];
                                                                const selectedProduct = getBundleProduct(item?.productId);
                                                                const selectedStock = item ? getBundleItemStock(item) : 0;
                                                                return (
                                                                    <div key={field.id} className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-2.5 space-y-1.5">
                                                                        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_70px_auto] gap-1.5 items-center">
                                                                            <select
                                                                                value={item?.productId || ""}
                                                                                onChange={(event) => handleBundleProductChange(index, event.target.value)}
                                                                                className="w-full h-7.5 px-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
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
                                                                                className="w-full h-7.5 px-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100 disabled:text-slate-400"
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
                                                                                className="w-full h-7.5 px-1 bg-white border border-slate-200 rounded-lg text-xs text-center font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => removeBundleItem(index)}
                                                                                className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-mono">
                                                                            <span>ราคา/ชิ้น ฿{Number(item?.unitPrice || 0).toLocaleString()}</span>
                                                                            <span>คงเหลือ {selectedStock.toLocaleString()} ชิ้น</span>
                                                                            <span>จัดได้ {Math.floor(selectedStock / Math.max(1, Number(item?.quantity) || 1)).toLocaleString()} เซต</span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : !hasVariants ? (
                                                /* Simple Product (No Variants) */
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-600 mb-1">ราคาขาย (บาท) *</label>
                                                        <input
                                                            type="number"
                                                            {...register("price")}
                                                            placeholder="0"
                                                            className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-medium text-slate-600 mb-1">จำนวนสต็อก *</label>
                                                        <input
                                                            type="number"
                                                            {...register("stock")}
                                                            placeholder="0"
                                                            className="w-full h-8 px-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Variants Mode */
                                                <div className="space-y-3">
                                                    {/* Options Header & Presets */}
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-xs font-semibold text-slate-800">ตัวเลือกสินค้า</p>
                                                            <p className="text-[10px] text-slate-400">เพิ่มตัวเลือก เช่น สี, ไซส์ แล้วกด Enter เพื่อสร้างค่า</p>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={applySizeOptionPreset}
                                                                className="inline-flex h-7 items-center gap-1 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition"
                                                            >
                                                                <Layers size={11} />
                                                                ไซส์ S-3XL
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => appendOption({ id: generateId(), name: "", values: [], allowCustom: false })}
                                                                className="inline-flex h-7 items-center gap-1 px-2.5 rounded-lg bg-slate-900 text-[11px] font-medium text-white hover:bg-slate-800 transition"
                                                            >
                                                                <Plus size={11} />
                                                                เพิ่มตัวเลือก
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Options List */}
                                                    <div className="space-y-2">
                                                        {optionFields.length === 0 ? (
                                                            <div className="p-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center">
                                                                <p className="text-xs text-slate-400">ยังไม่มีตัวเลือก กดปุ่มเพิ่มตัวเลือกด้านบน</p>
                                                            </div>
                                                        ) : (
                                                            optionFields.map((field, index) => {
                                                                const currentValues = watchedOptions?.[index]?.values || [];
                                                                return (
                                                                    <div key={field.id} className="p-3 bg-slate-50/40 rounded-xl border border-slate-200/80 space-y-2">
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <input
                                                                                {...register(`options.${index}.name`)}
                                                                                placeholder="ชื่อตัวเลือก เช่น สี, ไซส์, ความจุ"
                                                                                onChange={(e) => {
                                                                                    register(`options.${index}.name`).onChange(e);
                                                                                    setTimeout(() => generateVariants(), 100);
                                                                                }}
                                                                                className="flex-1 h-7.5 px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => { removeOption(index); setTimeout(() => generateVariants(), 50); }}
                                                                                className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        </div>
                                                                        <div>
                                                                            <div className="flex flex-wrap gap-1 p-2 bg-white border border-slate-200 rounded-lg min-h-[38px] items-center">
                                                                                {currentValues.map((val: string, vIndex: number) => (
                                                                                    <span key={vIndex} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
                                                                                        {val}
                                                                                        <button type="button" onClick={() => removeValue(index, val)} className="hover:text-rose-600 p-0.5">
                                                                                            <X size={11} />
                                                                                        </button>
                                                                                    </span>
                                                                                ))}
                                                                                <input
                                                                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                                                                    placeholder={currentValues.length ? "เพิ่มค่า..." : "เช่น แดง, น้ำเงิน, ดำ"}
                                                                                    className="flex-1 min-w-[100px] text-xs outline-none bg-transparent py-0.5 px-1"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                                                                            <input
                                                                                type="checkbox"
                                                                                {...register(`options.${index}.allowCustom`)}
                                                                                className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                                                                            />
                                                                            <span>เปิดให้ลูกค้ากรอกข้อความระบุเองได้</span>
                                                                        </label>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>

                                                    {/* Variants Bulk Settings & Table */}
                                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                                <p className="text-xs font-semibold text-slate-800">
                                                                    ตารางรายการแบบสินค้า ({variantFields.length} แบบ)
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/60 px-2 h-7">
                                                                    <span className="text-[10px] text-slate-400">฿</span>
                                                                    <input
                                                                        type="number"
                                                                        {...register("price")}
                                                                        placeholder="ราคา"
                                                                        className="w-16 bg-transparent text-right font-mono text-xs font-semibold text-slate-900 outline-none"
                                                                    />
                                                                </div>
                                                                <input
                                                                    type="number"
                                                                    value={variantDefaultStock}
                                                                    onChange={(event) => setVariantDefaultStock(Number(event.target.value) || 0)}
                                                                    placeholder="สต็อก"
                                                                    className="h-7 w-16 rounded-lg border border-slate-200 bg-slate-50/60 px-1 text-center font-mono text-xs font-bold text-slate-900 outline-none focus:bg-white"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={applyVariantDefaults}
                                                                    disabled={variantFields.length === 0}
                                                                    className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
                                                                    title="ใช้ราคานี้กับทุกแบบ"
                                                                >
                                                                    <CheckCircle size={12} className="text-emerald-600" />
                                                                    ปรับพร้อมกัน
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {variantFields.length === 0 ? (
                                                            <div className="p-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center">
                                                                <Package size={22} className="mx-auto mb-1 text-slate-300" />
                                                                <p className="text-xs text-slate-400">ยังไม่มีรายการแบบสินค้า</p>
                                                            </div>
                                                        ) : (
                                                            <div className="rounded-xl border border-slate-200/80 overflow-hidden">
                                                                <table className="w-full text-xs">
                                                                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                                                                        <tr>
                                                                            <th className="px-3 py-2 text-left">แบบสินค้า</th>
                                                                            <th className="px-3 py-2 text-right w-24">ราคา (บาท)</th>
                                                                            <th className="px-3 py-2 text-center w-20">จำนวน</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-100 bg-white">
                                                                        {variantFields.map((variant, index) => (
                                                                            <tr key={variant.id} className="hover:bg-slate-50/50">
                                                                                <td className="px-3 py-1.5 font-medium text-slate-800">
                                                                                    {watchedVariants?.[index]?.name || variant.name}
                                                                                </td>
                                                                                <td className="px-3 py-1.5">
                                                                                    <div className="flex items-center justify-end gap-1">
                                                                                        <span className="text-[10px] text-slate-400">฿</span>
                                                                                        <input
                                                                                            type="number"
                                                                                            {...register(`variants.${index}.price`)}
                                                                                            className="w-20 h-6.5 px-1.5 bg-slate-50 border border-slate-200 rounded-md text-right font-mono text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-900/10"
                                                                                        />
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-3 py-1.5">
                                                                                    <input
                                                                                        type="number"
                                                                                        {...register(`variants.${index}.stock`)}
                                                                                        className={`w-full h-6.5 px-1 rounded-md text-center font-mono text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-900/10 ${
                                                                                            Number(watchedVariants?.[index]?.stock) === 0
                                                                                                ? 'bg-rose-50 border border-rose-200 text-rose-600'
                                                                                                : 'bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white'
                                                                                        }`}
                                                                                    />
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                    <tfoot className="bg-slate-50/70 border-t border-slate-200 text-[11px] text-slate-500 font-mono">
                                                                        <tr>
                                                                            <td className="px-3 py-1.5 font-medium">รวม {variantFields.length} แบบ</td>
                                                                            <td className="px-3 py-1.5 text-right">
                                                                                เริ่ม ฿{Math.min(...(watchedVariants?.map(v => Number(v?.price) || 0) || [0])).toLocaleString()}
                                                                            </td>
                                                                            <td className="px-3 py-1.5 text-center font-bold text-slate-800">
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

                                    {/* Add-ons Section */}
                                    {!isBundle && (
                                        <section className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
                                            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/70 border-b border-slate-200/70">
                                                <div>
                                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">บริการเสริม (Add-ons)</span>
                                                    <p className="text-[10px] text-slate-400">เช่น ปักชื่อ ติดโลโก้ บริการพิเศษ</p>
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
                                                    className="inline-flex h-7 items-center gap-1 px-2.5 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-800 transition"
                                                >
                                                    <Plus size={11} />
                                                    เพิ่มบริการ
                                                </button>
                                            </div>
                                            <div className="p-3.5 space-y-2">
                                                {addOnFields.length === 0 ? (
                                                    <div className="p-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center">
                                                        <p className="text-xs text-slate-400">ยังไม่มีบริการเสริม</p>
                                                    </div>
                                                ) : (
                                                    addOnFields.map((field, index) => (
                                                        <div key={field.id} className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-2.5 space-y-2">
                                                            <div className="grid grid-cols-1 md:grid-cols-[1fr_90px_auto] gap-1.5 items-center">
                                                                <input
                                                                    {...register(`addOns.${index}.name`)}
                                                                    placeholder="ชื่อบริการ เช่น ปักชื่อ"
                                                                    className="w-full h-7.5 px-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    {...register(`addOns.${index}.price`)}
                                                                    placeholder="ราคา"
                                                                    className="w-full h-7.5 px-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeAddOn(index)}
                                                                    className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                                                <input
                                                                    {...register(`addOns.${index}.inputLabel`)}
                                                                    placeholder="หัวข้อช่องกรอก เช่น ชื่อที่ต้องการปัก"
                                                                    className="w-full h-7.5 px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                                                />
                                                                <input
                                                                    {...register(`addOns.${index}.placeholder`)}
                                                                    placeholder="ข้อความตัวอย่าง เช่น คุณสมชาย"
                                                                    className="w-full h-7.5 px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                                                />
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-3 pt-0.5">
                                                                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                                                                    <input type="checkbox" {...register(`addOns.${index}.required`)} className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900" />
                                                                    บังคับกรอก
                                                                </label>
                                                                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                                                                    <input type="checkbox" {...register(`addOns.${index}.isActive`)} className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900" />
                                                                    เปิดใช้
                                                                </label>
                                                                <div className="flex items-center gap-1 text-[11px] text-slate-600">
                                                                    จำกัด
                                                                    <input
                                                                        type="number"
                                                                        {...register(`addOns.${index}.maxLength`)}
                                                                        className="w-14 h-6 px-1 bg-white border border-slate-200 rounded text-center text-xs font-mono"
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

                            {/* Form Action Footer */}
                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="h-8 px-4 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="h-8 px-4 rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-2xs hover:bg-slate-800 disabled:opacity-50 transition flex items-center gap-1.5"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={13} /> : <Save size={13} />}
                                    {isSaving ? 'กำลังบันทึก...' : 'บันทึกสินค้า'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteConfirmOpen && deleteTarget && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                                    <Trash2 size={13} />
                                </span>
                                <h3 className="font-semibold text-slate-900 text-xs">ยืนยันการลบสินค้า</h3>
                            </div>
                            <button
                                type="button"
                                onClick={closeDeleteConfirm}
                                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <div className="p-4 space-y-1.5">
                            <p className="text-xs text-slate-700">
                                คุณต้องการลบสินค้า <span className="font-semibold text-slate-900">&quot;{deleteTarget.name}&quot;</span> ใช่หรือไม่?
                            </p>
                            <p className="text-[11px] text-rose-500">
                                การกระทำนี้ไม่สามารถย้อนกลับได้ สินค้าและข้อมูลตัวเลือกทั้งหมดจะถูกลบถาวร
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
                            <button
                                type="button"
                                onClick={closeDeleteConfirm}
                                disabled={deletingProductId === deleteTarget.id}
                                className="h-7.5 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteProduct}
                                disabled={deletingProductId === deleteTarget.id}
                                className="h-7.5 px-3 rounded-lg bg-rose-600 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50 transition flex items-center gap-1.5"
                            >
                                {deletingProductId === deleteTarget.id && <Loader2 size={12} className="animate-spin" />}
                                {deletingProductId === deleteTarget.id ? "กำลังลบ..." : "ลบสินค้า"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


