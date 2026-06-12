"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { LineAdminUser, PickupOption, ShippingConditionType, ShippingOption, StoreSettings } from "@/types/store";
import {
    Save,
    Store,
    Truck,
    Bell,
    Loader2,
    Check,
    CreditCard,
    QrCode,
    Banknote,
    Globe,
    Smartphone,
    RefreshCw,
    Database,
    Trash2,
    Plus,
    MapPin,
    ExternalLink
} from "lucide-react";

type FirestoreUsage = {
    mode: string;
    projectId: string;
    plan: "spark" | "blaze";
    metrics: {
        storageBytes: number | null;
        reads24h: number | null;
        writes24h: number | null;
        deletes24h: number | null;
    };
    limits: {
        storageBytes: number | null;
        reads24h: number | null;
        writes24h: number | null;
        deletes24h: number | null;
    };
    percent: {
        storage: number | null;
        reads24h: number | null;
        writes24h: number | null;
        deletes24h: number | null;
    };
    storageMetricType?: string | null;
    permissionLimited?: boolean;
    hint?: string;
    updatedAt?: string;
};

type StorageUsage = {
    projectId: string;
    bucketName: string;
    plan: "spark" | "blaze";
    metrics: {
        storageBytes: number | null;
        objectCount: number | null;
    };
    limits: {
        storageBytes: number | null;
    };
    percent: {
        storage: number | null;
    };
    permissionLimited?: boolean;
    hint?: string;
    updatedAt?: string;
};

type StorageRuleCheck = {
    status: "idle" | "checking" | "ok" | "failed";
    message: string;
    checkedAt?: string;
};

type FirestoreIndexCheckResult = {
    id: string;
    title: string;
    source: string;
    collection: string;
    fields: string[];
    status: "ready" | "missing" | "error";
    createUrl?: string | null;
    error?: string | null;
};

function formatBytes(bytes?: number | null) {
    if (bytes == null || Number.isNaN(bytes)) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

const createShippingOption = (): ShippingOption => ({
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    fee: 0,
    description: "",
    conditionType: "location",
    threshold: 0,
    isActive: true,
});

const defaultPickupOptions: PickupOption[] = [
    { id: "appointment", label: "รอนัดหมายวัน-เวลา", detail: "", isActive: true, sortOrder: 0 },
    { id: "locker-01", label: "locker ช่อง 01 รหัส 1234", detail: "", isActive: true, sortOrder: 1 },
    { id: "locker-02", label: "locker ช่อง 02 รหัส 5678", detail: "", isActive: true, sortOrder: 2 },
    { id: "locker-03", label: "locker ช่อง 03 รหัส 4321", detail: "", isActive: true, sortOrder: 3 },
];

const createPickupOption = (): PickupOption => ({
    id: Math.random().toString(36).slice(2, 10),
    label: "",
    detail: "",
    isActive: true,
});

const shippingConditionLabels: Record<ShippingConditionType, string> = {
    standard: "ปกติ",
    location: "ตามสถานที่",
    price_less_than: "ยอดเงินน้อยกว่า",
    price_greater_than: "ยอดเงินมากกว่า",
    quantity_less_than: "จำนวนน้อยกว่า",
    quantity_greater_than: "จำนวนมากกว่า",
};

const splitLineTargets = (value?: string) => (
    (value || "")
        .split(/[,\s]+/g)
        .map(item => item.trim())
        .filter(Boolean)
);

const createLineAdminUser = (userId = "", index = 0): LineAdminUser => ({
    id: Math.random().toString(36).slice(2, 10),
    name: index > 0 ? `Admin ${index + 1}` : "",
    userId
});

const lineAdminUsersToTargetString = (users?: LineAdminUser[]) => (
    (users || [])
        .map(user => user.userId.trim())
        .filter(Boolean)
        .join("\n")
);

const lineAdminUsersFromSettings = (settings: StoreSettings): LineAdminUser[] => {
    if (settings.lineAdminUsers?.length) {
        return settings.lineAdminUsers.map((user, index) => ({
            id: user.id || Math.random().toString(36).slice(2, 10),
            name: user.name || `Admin ${index + 1}`,
            userId: user.userId || ""
        }));
    }

    return splitLineTargets(settings.lineAdminUserId).map((userId, index) => createLineAdminUser(userId, index));
};

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<Partial<StoreSettings>>({
        storeName: "",
        storePhone: "",
        storeEmail: "",
        storeAddress: "",
        storeLogoUrl: "",
        storeMapUrl: "",
        useStorageForProductImages: false,
        useStorageForPaymentSlips: false,
        bankName: "",
        bankAccountName: "",
        bankAccountNumber: "",
        promptPayId: "",
        promptPayAccountName: "",
        promptPayQrUrl: "",
        enableBankTransfer: false,
        enablePromptPay: false,
        enableCOD: false,
        enableStripe: false,
        stripePublishableKey: "",
        stripeSecretKey: "",
        enableOmise: false,
        omisePublicKey: "",
        omiseSecretKey: "",
        enableSlipVerify: false,
        slipokBranchId: "",
        slipokApiKey: "",
        shippingFee: 50,
        freeShippingThreshold: 0,
        shippingOptions: [],
        pickupOptions: defaultPickupOptions,
        lineChannelAccessToken: "",
        lineAdminUserId: "",
        lineAdminUsers: [],
        lineAdminGroupId: "",
        lineNotifyAdminNewOrder: true,
        lineNotifyAdminOrder: true,
        lineNotifyAdminPayment: true,
        lineNotifyAdminCancelled: true,
        lineNotifyCustomerOrderSuccess: true,
        lineNotifyCustomerPaymentConfirmed: true,
        lineNotifyCustomerShipped: true,
        lineNotifyCustomerCancelled: true,
    });
    const [activeTab, setActiveTab] = useState<'store' | 'payment' | 'firestore' | 'indexes' | 'shipping' | 'pickup' | 'line'>('store');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [lineQuota, setLineQuota] = useState<{ type: "limited" | "unlimited"; value: number | null; totalUsage: number | null } | null>(null);
    const [lineQuotaLoading, setLineQuotaLoading] = useState(false);
    const [lineQuotaError, setLineQuotaError] = useState("");
    const [firestoreUsage, setFirestoreUsage] = useState<FirestoreUsage | null>(null);
    const [firestoreUsageLoading, setFirestoreUsageLoading] = useState(false);
    const [firestoreUsageError, setFirestoreUsageError] = useState("");
    const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
    const [storageUsageLoading, setStorageUsageLoading] = useState(false);
    const [storageUsageError, setStorageUsageError] = useState("");
    const [storageRuleCheck, setStorageRuleCheck] = useState<StorageRuleCheck>({
        status: "idle",
        message: "ยังไม่ได้ตรวจสอบ"
    });
    const [indexCheckResults, setIndexCheckResults] = useState<FirestoreIndexCheckResult[]>([]);
    const [indexCheckLoading, setIndexCheckLoading] = useState(false);
    const [indexCheckError, setIndexCheckError] = useState("");
    const [indexCheckedAt, setIndexCheckedAt] = useState("");
    const [slipCleanupLoadingMonth, setSlipCleanupLoadingMonth] = useState<number | null>(null);
    const [slipCleanupMessage, setSlipCleanupMessage] = useState("");

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, "settings", "store");
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data() as StoreSettings;
                    const lineAdminUsers = lineAdminUsersFromSettings(data);
                    setSettings(prev => ({
                        ...prev,
                        ...data,
                        enableBankTransfer: data.enableBankTransfer ?? prev.enableBankTransfer,
                        enablePromptPay: data.enablePromptPay ?? prev.enablePromptPay,
                        enableCOD: data.enableCOD ?? prev.enableCOD,
                        enableStripe: data.enableStripe ?? prev.enableStripe,
                        enableOmise: data.enableOmise ?? prev.enableOmise,
                        enableSlipVerify: data.enableSlipVerify ?? prev.enableSlipVerify,
                        storeLogoUrl: data.storeLogoUrl ?? prev.storeLogoUrl,
                        storeMapUrl: data.storeMapUrl ?? prev.storeMapUrl,
                        useStorageForProductImages: data.useStorageForProductImages ?? prev.useStorageForProductImages,
                        useStorageForPaymentSlips: data.useStorageForPaymentSlips ?? prev.useStorageForPaymentSlips,
                        promptPayId: data.promptPayId ?? prev.promptPayId,
                        promptPayAccountName: data.promptPayAccountName ?? prev.promptPayAccountName,
                        promptPayQrUrl: data.promptPayQrUrl ?? prev.promptPayQrUrl,
                        stripePublishableKey: data.stripePublishableKey ?? prev.stripePublishableKey,
                        stripeSecretKey: data.stripeSecretKey ?? prev.stripeSecretKey,
                        omisePublicKey: data.omisePublicKey ?? prev.omisePublicKey,
                        omiseSecretKey: data.omiseSecretKey ?? prev.omiseSecretKey,
                        slipokBranchId: data.slipokBranchId ?? prev.slipokBranchId,
                        slipokApiKey: data.slipokApiKey ?? prev.slipokApiKey,
                        shippingOptions: data.shippingOptions?.length ? data.shippingOptions : prev.shippingOptions,
                        pickupOptions: data.pickupOptions?.length ? data.pickupOptions : prev.pickupOptions,
                        lineAdminUsers,
                        lineAdminUserId: lineAdminUsersToTargetString(lineAdminUsers),
                        lineNotifyAdminNewOrder: data.lineNotifyAdminNewOrder ?? prev.lineNotifyAdminNewOrder,
                        lineNotifyAdminOrder: data.lineNotifyAdminOrder ?? prev.lineNotifyAdminOrder,
                        lineNotifyAdminPayment: data.lineNotifyAdminPayment ?? prev.lineNotifyAdminPayment,
                        lineNotifyAdminCancelled: data.lineNotifyAdminCancelled ?? prev.lineNotifyAdminCancelled,
                        lineNotifyCustomerOrderSuccess: data.lineNotifyCustomerOrderSuccess ?? prev.lineNotifyCustomerOrderSuccess,
                        lineNotifyCustomerPaymentConfirmed: data.lineNotifyCustomerPaymentConfirmed ?? prev.lineNotifyCustomerPaymentConfirmed,
                        lineNotifyCustomerShipped: data.lineNotifyCustomerShipped ?? prev.lineNotifyCustomerShipped,
                        lineNotifyCustomerCancelled: data.lineNotifyCustomerCancelled ?? prev.lineNotifyCustomerCancelled,
                    }));
                    if (data.storeLogoUrl) {
                        setLogoPreview(data.storeLogoUrl);
                    }
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target as HTMLInputElement;
        const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setSettings(prev => ({ ...prev, [name]: val }));
    };

    const addShippingOption = () => {
        setSettings(prev => ({
            ...prev,
            shippingOptions: [...(prev.shippingOptions || []), createShippingOption()]
        }));
    };

    const updateShippingOption = <K extends keyof ShippingOption>(id: string, field: K, value: ShippingOption[K]) => {
        setSettings(prev => ({
            ...prev,
            shippingOptions: (prev.shippingOptions || []).map(option =>
                option.id === id ? { ...option, [field]: value } : option
            )
        }));
    };

    const removeShippingOption = (id: string) => {
        setSettings(prev => ({
            ...prev,
            shippingOptions: (prev.shippingOptions || []).filter(option => option.id !== id)
        }));
    };

    const addPickupOption = () => {
        setSettings(prev => ({
            ...prev,
            pickupOptions: [...(prev.pickupOptions || []), createPickupOption()]
        }));
    };

    const updatePickupOption = <K extends keyof PickupOption>(id: string, field: K, value: PickupOption[K]) => {
        setSettings(prev => ({
            ...prev,
            pickupOptions: (prev.pickupOptions || []).map(option =>
                option.id === id ? { ...option, [field]: value } : option
            )
        }));
    };

    const removePickupOption = (id: string) => {
        setSettings(prev => ({
            ...prev,
            pickupOptions: (prev.pickupOptions || []).filter(option => option.id !== id)
        }));
    };

    const addLineAdminUser = () => {
        setSettings(prev => ({
            ...prev,
            lineAdminUsers: [...(prev.lineAdminUsers || []), createLineAdminUser("", prev.lineAdminUsers?.length || 0)]
        }));
    };

    const updateLineAdminUser = (id: string, field: "name" | "userId", value: string) => {
        setSettings(prev => ({
            ...prev,
            lineAdminUsers: (prev.lineAdminUsers || []).map(user =>
                user.id === id ? { ...user, [field]: value } : user
            )
        }));
    };

    const removeLineAdminUser = (id: string) => {
        setSettings(prev => ({
            ...prev,
            lineAdminUsers: (prev.lineAdminUsers || []).filter(user => user.id !== id)
        }));
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        const file = e.target.files[0];
        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
    };

    const fetchLineQuota = async () => {
        setLineQuotaLoading(true);
        setLineQuotaError("");
        try {
            const res = await fetch("/api/line/quota");
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "โหลดโควต้าไม่สำเร็จ");
            }
            const data = await res.json();
            setLineQuota({
                type: data?.type === "unlimited" ? "unlimited" : "limited",
                value: typeof data?.value === "number" ? data.value : null,
                totalUsage: typeof data?.totalUsage === "number" ? data.totalUsage : null
            });
        } catch (error) {
            setLineQuotaError((error as Error).message);
            setLineQuota(null);
        } finally {
            setLineQuotaLoading(false);
        }
    };

    const fetchFirestoreUsage = async () => {
        setFirestoreUsageLoading(true);
        setFirestoreUsageError("");
        try {
            const res = await fetch("/api/admin/firestore/usage");
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "โหลดข้อมูล Firestore ไม่สำเร็จ");
            }
            setFirestoreUsage({
                mode: String(data?.mode || "firebase_plan_real_usage"),
                projectId: String(data?.projectId || ""),
                plan: data?.plan === "blaze" ? "blaze" : "spark",
                metrics: {
                    storageBytes: typeof data?.metrics?.storageBytes === "number" ? data.metrics.storageBytes : null,
                    reads24h: typeof data?.metrics?.reads24h === "number" ? data.metrics.reads24h : null,
                    writes24h: typeof data?.metrics?.writes24h === "number" ? data.metrics.writes24h : null,
                    deletes24h: typeof data?.metrics?.deletes24h === "number" ? data.metrics.deletes24h : null
                },
                limits: {
                    storageBytes: typeof data?.limits?.storageBytes === "number" ? data.limits.storageBytes : null,
                    reads24h: typeof data?.limits?.reads24h === "number" ? data.limits.reads24h : null,
                    writes24h: typeof data?.limits?.writes24h === "number" ? data.limits.writes24h : null,
                    deletes24h: typeof data?.limits?.deletes24h === "number" ? data.limits.deletes24h : null
                },
                percent: {
                    storage: typeof data?.percent?.storage === "number" ? data.percent.storage : null,
                    reads24h: typeof data?.percent?.reads24h === "number" ? data.percent.reads24h : null,
                    writes24h: typeof data?.percent?.writes24h === "number" ? data.percent.writes24h : null,
                    deletes24h: typeof data?.percent?.deletes24h === "number" ? data.percent.deletes24h : null
                },
                storageMetricType: typeof data?.storageMetricType === "string" ? data.storageMetricType : null,
                permissionLimited: Boolean(data?.permissionLimited),
                hint: typeof data?.hint === "string" ? data.hint : undefined,
                updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : undefined
            });
        } catch (error) {
            setFirestoreUsageError((error as Error).message);
            setFirestoreUsage(null);
        } finally {
            setFirestoreUsageLoading(false);
        }
    };

    const fetchStorageUsage = async () => {
        setStorageUsageLoading(true);
        setStorageUsageError("");
        try {
            const res = await fetch("/api/admin/storage/usage");
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "โหลดข้อมูล Storage ไม่สำเร็จ");
            }
            setStorageUsage({
                projectId: String(data?.projectId || ""),
                bucketName: String(data?.bucketName || ""),
                plan: data?.plan === "blaze" ? "blaze" : "spark",
                metrics: {
                    storageBytes: typeof data?.metrics?.storageBytes === "number" ? data.metrics.storageBytes : null,
                    objectCount: typeof data?.metrics?.objectCount === "number" ? data.metrics.objectCount : null
                },
                limits: {
                    storageBytes: typeof data?.limits?.storageBytes === "number" ? data.limits.storageBytes : null
                },
                percent: {
                    storage: typeof data?.percent?.storage === "number" ? data.percent.storage : null
                },
                permissionLimited: Boolean(data?.permissionLimited),
                hint: typeof data?.hint === "string" ? data.hint : undefined,
                updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : undefined
            });
        } catch (error) {
            setStorageUsageError((error as Error).message);
            setStorageUsage(null);
        } finally {
            setStorageUsageLoading(false);
        }
    };

    const checkStorageRules = async () => {
        setStorageRuleCheck({ status: "checking", message: "กำลังตรวจสอบ..." });
        try {
            const testPath = `diagnostics/storage-rule-check-${Date.now()}.txt`;
            const testRef = ref(storage, testPath);
            await uploadBytes(testRef, new Blob(["ok"], { type: "text/plain" }), {
                contentType: "text/plain"
            });
            await deleteObject(testRef);
            setStorageRuleCheck({
                status: "ok",
                message: "เชื่อมต่อและ Rules อนุญาต upload/delete",
                checkedAt: new Date().toISOString()
            });
            await fetchStorageUsage();
        } catch (error) {
            const message = error instanceof Error ? error.message : "ตรวจสอบ Storage ไม่สำเร็จ";
            setStorageRuleCheck({
                status: "failed",
                message,
                checkedAt: new Date().toISOString()
            });
        }
    };

    const handleCleanupSlips = async (months: 1 | 3 | 6) => {
        const confirmed = window.confirm(`ยืนยันลบสลิปที่เก่ากว่า ${months} เดือน?`);
        if (!confirmed) return;

        setSlipCleanupLoadingMonth(months);
        setSlipCleanupMessage("");
        try {
            const res = await fetch("/api/admin/slips/cleanup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ months })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "ลบสลิปไม่สำเร็จ");
            }

            const deletedCount = Number(data?.deletedCount || 0);
            const deletedStorageCount = Number(data?.deletedStorageCount || 0);
            const failedStorageDeleteCount = Number(data?.failedStorageDeleteCount || 0);
            const storageNote = data?.storageDeleteSkipped
                ? " ไม่ได้ลบไฟล์ Storage เพราะยังไม่ได้ตั้งค่า bucket"
                : failedStorageDeleteCount > 0
                    ? ` ลบไฟล์ Storage ไม่สำเร็จ ${failedStorageDeleteCount.toLocaleString()} ไฟล์`
                    : "";
            setSlipCleanupMessage(
                `ลบสลิปสำเร็จ ${deletedCount.toLocaleString()} รายการ, ลบไฟล์ Storage ${deletedStorageCount.toLocaleString()} ไฟล์${storageNote}`
            );
            await fetchFirestoreUsage();
            await fetchStorageUsage();
        } catch (error) {
            setSlipCleanupMessage((error as Error).message);
        } finally {
            setSlipCleanupLoadingMonth(null);
        }
    };

    const fetchIndexChecks = async () => {
        setIndexCheckLoading(true);
        setIndexCheckError("");
        try {
            const res = await fetch("/api/admin/firestore/index-check");
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "ตรวจสอบ Indexes ไม่สำเร็จ");
            }
            setIndexCheckResults(Array.isArray(data?.results) ? data.results : []);
            setIndexCheckedAt(typeof data?.checkedAt === "string" ? data.checkedAt : new Date().toISOString());
        } catch (error) {
            setIndexCheckError((error as Error).message);
            setIndexCheckResults([]);
        } finally {
            setIndexCheckLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab !== "line") return;
        fetchLineQuota();
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== "firestore") return;
        fetchFirestoreUsage();
        fetchStorageUsage();
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== "indexes" || indexCheckResults.length > 0 || indexCheckLoading) return;
        fetchIndexChecks();
    }, [activeTab, indexCheckLoading, indexCheckResults.length]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            let logoUrl = settings.storeLogoUrl || "";
            if (logoFile) {
                const storageRef = ref(storage, `settings/store-logo-${Date.now()}`);
                await uploadBytes(storageRef, logoFile);
                logoUrl = await getDownloadURL(storageRef);
            }

            const docRef = doc(db, "settings", "store");
            const normalizedShippingOptions = (settings.shippingOptions || [])
                .map((option, index) => ({
                    id: option.id || Math.random().toString(36).slice(2, 10),
                    name: (option.name || "").trim(),
                    fee: Number(option.fee) || 0,
                    description: (option.description || "").trim(),
                    conditionType: option.conditionType || "standard",
                    threshold: Number(option.threshold) || 0,
                    isActive: option.isActive !== false,
                    sortOrder: index
                }))
                .filter(option => option.name);
            const normalizedPickupOptions = (settings.pickupOptions || [])
                .map((option, index) => ({
                    id: option.id || Math.random().toString(36).slice(2, 10),
                    label: (option.label || "").trim(),
                    detail: (option.detail || "").trim(),
                    isActive: option.isActive !== false,
                    sortOrder: index
                }))
                .filter(option => option.label);
            const normalizedLineAdminUsers = (settings.lineAdminUsers || [])
                .map((user, index) => ({
                    id: user.id || Math.random().toString(36).slice(2, 10),
                    name: (user.name || `Admin ${index + 1}`).trim(),
                    userId: (user.userId || "").trim()
                }))
                .filter(user => user.userId);
            const lineAdminUserId = lineAdminUsersToTargetString(normalizedLineAdminUsers);
            await setDoc(docRef, {
                ...settings,
                storeLogoUrl: logoUrl,
                shippingFee: Number(settings.shippingFee),
                freeShippingThreshold: Number(settings.freeShippingThreshold),
                shippingOptions: normalizedShippingOptions,
                pickupOptions: normalizedPickupOptions,
                lineAdminUsers: normalizedLineAdminUsers,
                lineAdminUserId,
                updatedAt: serverTimestamp()
            }, { merge: true });
            setSettings(prev => ({
                ...prev,
                storeLogoUrl: logoUrl,
                shippingOptions: normalizedShippingOptions,
                pickupOptions: normalizedPickupOptions,
                lineAdminUsers: normalizedLineAdminUsers,
                lineAdminUserId
            }));
            if (logoUrl) {
                setLogoPreview(logoUrl);
            }
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
        <div className="max-w-5xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold text-gray-900">ตั้งค่า</h1>
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

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
                {[
                    { id: 'store', label: 'ข้อมูลร้านค้า' },
                    { id: 'payment', label: 'ตั้งค่าการชำระเงิน' },
                    { id: 'firestore', label: 'Firestore Usage' },
                    { id: 'indexes', label: 'Firestore Indexes' },
                    { id: 'shipping', label: 'การจัดส่ง' },
                    { id: 'pickup', label: 'สถานที่รับ' },
                    { id: 'line', label: 'การแจ้งเตือน LINE' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${activeTab === tab.id
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSave} className="space-y-4">
                {/* Store Info */}
                {activeTab === 'store' && (
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <Store size={16} className="text-gray-500" />
                        <span className="font-semibold text-sm text-gray-900">ข้อมูลร้านค้า</span>
                    </div>
                    <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-2 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อร้าน</label>
                                    <input
                                        type="text"
                                        name="storeName"
                                        value={settings.storeName}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">เบอร์โทร</label>
                                    <input
                                        type="text"
                                        name="storePhone"
                                        value={settings.storePhone}
                                        onChange={handleChange}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">ที่อยู่</label>
                                <textarea
                                    name="storeAddress"
                                    value={settings.storeAddress}
                                    onChange={handleChange}
                                    rows={2}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">ลิ้งก์แผนที่ (Google Maps)</label>
                                <input
                                    type="text"
                                    name="storeMapUrl"
                                    value={settings.storeMapUrl}
                                    onChange={handleChange}
                                    placeholder="https://maps.google.com/..."
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-gray-500">โลโก้ร้านค้า</label>
                            <div className="w-full aspect-square rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Store Logo" className="w-full h-full object-contain p-3" />
                                ) : (
                                    <span className="text-xs text-gray-400">ยังไม่มีโลโก้</span>
                                )}
                            </div>
                            <label className="inline-flex items-center justify-center w-full px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                อัปโหลดโลโก้
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoChange}
                                    className="hidden"
                                />
                            </label>
                            <p className="text-[11px] text-gray-500">แนะนำไฟล์ PNG พื้นหลังใส</p>
                        </div>
                    </div>
                </section>
                )}

                {/* Payment */}
                {activeTab === 'payment' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    
                    {/* Bank Transfer */}
                    <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
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
                                    checked={Boolean(settings.enableBankTransfer)}
                                    onChange={handleChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {settings.enableBankTransfer && (
                            <div className="p-4">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <CreditCard size={16} /> รายละเอียดบัญชี
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                    <div className="md:col-span-2">
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

                    {/* PromptPay */}
                    <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                                    <QrCode size={18} />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-gray-900">พร้อมเพย์ (PromptPay)</h2>
                                    <p className="text-xs text-gray-500">QR Code Payment</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="enablePromptPay"
                                    checked={Boolean(settings.enablePromptPay)}
                                    onChange={handleChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {settings.enablePromptPay && (
                            <div className="p-4">
                                <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-900">
                                    <Smartphone size={16} /> รายละเอียดพร้อมเพย์
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">PromptPay ID (เบอร์โทร/เลขผู้เสียภาษี)</label>
                                        <input
                                            type="text"
                                            name="promptPayId"
                                            value={settings.promptPayId}
                                            onChange={handleChange}
                                            placeholder="08xxxxxxxx หรือ 1xxxxxxxxxxxx"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">ชื่อผู้รับโอน</label>
                                        <input
                                            type="text"
                                            name="promptPayAccountName"
                                            value={settings.promptPayAccountName}
                                            onChange={handleChange}
                                            placeholder="ชื่อ-นามสกุล หรือ บริษัท"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2">ไม่ต้องอัปโหลด QR ระบบจะแสดงจาก PromptPay ID</p>
                            </div>
                        )}
                    </section>
  {/* Slip Verification (SlipOK) */}
                    <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                                    <Check size={18} />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-gray-900">Slip Verification (SlipOK)</h2>
                                    <p className="text-xs text-gray-500">ตรวจสลิปอัตโนมัติ</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="enableSlipVerify"
                                    checked={Boolean(settings.enableSlipVerify)}
                                    onChange={handleChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                        </div>

                        {settings.enableSlipVerify && (
                            <div className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">Branch ID</label>
                                        <input
                                            type="text"
                                            name="slipokBranchId"
                                            value={settings.slipokBranchId}
                                            onChange={handleChange}
                                            placeholder="branch_xxx"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 mb-1">API Key</label>
                                        <input
                                            type="password"
                                            name="slipokApiKey"
                                            value={settings.slipokApiKey}
                                            onChange={handleChange}
                                            placeholder="••••••••"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>
                  
                   {/* COD */}
                    <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
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
                                    checked={Boolean(settings.enableCOD)}
                                    onChange={handleChange}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                            </label>
                        </div>
                        {settings.enableCOD && (
                            <div className="p-4">
                                <p className="text-sm text-gray-600 flex items-center gap-2">
                                    <Check size={16} className="text-green-500" />
                                    เปิดใช้งานการเก็บเงินปลายทางแล้ว
                                </p>
                            </div>
                        )}
                    </section>

                    

                    {/* Payment Gateways */}
                    <section className="bg-white rounded-xl border border-gray-100 overflow-hidden lg:col-span-2">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
                            <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                                <Globe size={18} />
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900">Payment Gateway</h2>
                                <p className="text-xs text-gray-500">Stripe, Omise</p>
                            </div>
                        </div>

                        <div className="p-4 space-y-6">
                            {/* Stripe */}
                            <div className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-800">Stripe</span>
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">Global</span>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="enableStripe"
                                            checked={Boolean(settings.enableStripe)}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                    </label>
                                </div>
                                {settings.enableStripe && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-800">Omise</span>
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">Thailand</span>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="enableOmise"
                                            checked={Boolean(settings.enableOmise)}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                {settings.enableOmise && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

                </div>
                )}

                {activeTab === 'firestore' && (
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                        <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                                <Database size={18} />
                            </div>
                            <div>
                                <h2 className="font-semibold text-gray-900">Firestore Usage</h2>
                                <p className="text-xs text-gray-500">พื้นที่และโควต้าการใช้งาน Firestore</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                fetchFirestoreUsage();
                                fetchStorageUsage();
                            }}
                            disabled={firestoreUsageLoading || storageUsageLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-60"
                        >
                            <RefreshCw size={12} className={firestoreUsageLoading || storageUsageLoading ? "animate-spin" : ""} />
                            รีเฟรช
                        </button>
                    </div>

                    <div className="p-4 space-y-4">
                        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-blue-900">Firebase Storage: รูปสินค้า</p>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                                        <div className="rounded-lg bg-white/80 p-2 ring-1 ring-blue-100">
                                            <p className="text-blue-500">สถานะ</p>
                                            <p className="font-bold text-blue-950">{settings.useStorageForProductImages ? "เปิดใช้งาน" : "ปิดใช้งาน"}</p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 p-2 ring-1 ring-blue-100">
                                            <p className="text-blue-500">Bucket</p>
                                            <p className="truncate font-bold text-blue-950">{storageUsage?.bucketName || "-"}</p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 p-2 ring-1 ring-blue-100">
                                            <p className="text-blue-500">Usage</p>
                                            <p className="font-bold text-blue-950">
                                                {formatBytes(storageUsage?.metrics.storageBytes)} / {storageUsage?.limits.storageBytes != null ? formatBytes(storageUsage.limits.storageBytes) : "ไม่จำกัด"}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 p-2 ring-1 ring-blue-100">
                                            <p className="text-blue-500">Objects</p>
                                            <p className="font-bold text-blue-950">{storageUsage?.metrics.objectCount != null ? storageUsage.metrics.objectCount.toLocaleString() : "-"}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                                        <div
                                            className="h-full bg-blue-600 transition-all"
                                            style={{ width: `${Math.min(100, Math.max(0, storageUsage?.percent.storage || 0))}%` }}
                                        />
                                    </div>
                                </div>
                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-blue-900 shadow-sm ring-1 ring-blue-100">
                                    <input
                                        type="checkbox"
                                        name="useStorageForProductImages"
                                        checked={Boolean(settings.useStorageForProductImages)}
                                        onChange={handleChange}
                                        className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    {settings.useStorageForProductImages ? "เปิดอยู่" : "ปิดอยู่"}
                                </label>
                            </div>
                        </div>

                        <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-amber-900">Firebase Storage: รูปสลิป</p>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                                        <div className="rounded-lg bg-white/80 p-2 ring-1 ring-amber-100">
                                            <p className="text-amber-600">สถานะ</p>
                                            <p className="font-bold text-amber-950">{settings.useStorageForPaymentSlips ? "เปิดใช้งาน" : "ปิดใช้งาน"}</p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 p-2 ring-1 ring-amber-100">
                                            <p className="text-amber-600">Connection</p>
                                            <p className={`font-bold ${storageRuleCheck.status === "ok" ? "text-green-700" : storageRuleCheck.status === "failed" ? "text-red-700" : "text-amber-950"}`}>
                                                {storageRuleCheck.status === "ok" ? "ถูกต้อง" : storageRuleCheck.status === "failed" ? "ผิดพลาด" : storageRuleCheck.status === "checking" ? "กำลังตรวจ" : "ยังไม่ตรวจ"}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 p-2 ring-1 ring-amber-100">
                                            <p className="text-amber-600">Rules</p>
                                            <p className={`font-bold ${storageRuleCheck.status === "ok" ? "text-green-700" : storageRuleCheck.status === "failed" ? "text-red-700" : "text-amber-950"}`}>
                                                {storageRuleCheck.status === "ok" ? "ทำงาน" : storageRuleCheck.status === "failed" ? "ไม่ผ่าน" : "-"}
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-white/80 p-2 ring-1 ring-amber-100">
                                            <p className="text-amber-600">Plan</p>
                                            <p className="font-bold uppercase text-amber-950">{storageUsage?.plan || "-"}</p>
                                        </div>
                                    </div>
                                    <p className="mt-2 truncate text-[11px] text-amber-700">{storageRuleCheck.message}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={checkStorageRules}
                                        disabled={storageRuleCheck.status === "checking"}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-100 hover:bg-amber-50 disabled:opacity-60"
                                    >
                                        <RefreshCw size={12} className={storageRuleCheck.status === "checking" ? "animate-spin" : ""} />
                                        ตรวจ Rules
                                    </button>
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-100">
                                        <input
                                            type="checkbox"
                                            name="useStorageForPaymentSlips"
                                            checked={Boolean(settings.useStorageForPaymentSlips)}
                                            onChange={handleChange}
                                            className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        {settings.useStorageForPaymentSlips ? "เปิดอยู่" : "ปิดอยู่"}
                                    </label>
                                </div>
                            </div>
                        </div>

                        {storageUsageError && (
                            <div className="text-sm text-red-600">{storageUsageError}</div>
                        )}

                        {firestoreUsageError && (
                            <div className="text-sm text-red-600">{firestoreUsageError}</div>
                        )}

                        {!firestoreUsageError && (
                            <>
                                <div>
                                    <div className="flex items-center justify-between text-xs font-semibold text-gray-600 mb-1.5">
                                        <span>
                                            พื้นที่ใช้งาน {formatBytes(firestoreUsage?.metrics?.storageBytes)} / {firestoreUsage?.limits?.storageBytes != null ? formatBytes(firestoreUsage?.limits?.storageBytes) : "ไม่จำกัด"}
                                        </span>
                                        <span>
                                            {firestoreUsage?.percent?.storage != null
                                                ? `${firestoreUsage.percent.storage.toFixed(2)}%`
                                                : "N/A"}
                                        </span>
                                    </div>
                                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                                            style={{ width: `${Math.min(100, Math.max(0, firestoreUsage?.percent?.storage || 0))}%` }}
                                        />
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-2">
                                        ข้อมูลนี้ดึงจาก Google Cloud Monitoring ตามแผน Firebase จริง
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                    {[
                                        {
                                            label: "Reads (24h)",
                                            value: firestoreUsage?.metrics?.reads24h,
                                            limit: firestoreUsage?.limits?.reads24h,
                                            percent: firestoreUsage?.percent?.reads24h
                                        },
                                        {
                                            label: "Writes (24h)",
                                            value: firestoreUsage?.metrics?.writes24h,
                                            limit: firestoreUsage?.limits?.writes24h,
                                            percent: firestoreUsage?.percent?.writes24h
                                        },
                                        {
                                            label: "Deletes (24h)",
                                            value: firestoreUsage?.metrics?.deletes24h,
                                            limit: firestoreUsage?.limits?.deletes24h,
                                            percent: firestoreUsage?.percent?.deletes24h
                                        }
                                    ].map((item) => (
                                        <div key={item.label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                                            <p className="text-gray-400">{item.label}</p>
                                            <p className="font-semibold text-gray-900">
                                                {item.value != null ? item.value.toLocaleString() : "-"} / {item.limit != null ? item.limit.toLocaleString() : "ไม่จำกัด"}
                                            </p>
                                            <div className="mt-2 h-1.5 rounded-full bg-white overflow-hidden">
                                                <div
                                                    className="h-full bg-gray-900 transition-all"
                                                    style={{ width: `${Math.min(100, Math.max(0, item.percent || 0))}%` }}
                                                />
                                            </div>
                                            <p className="mt-1 text-[11px] text-gray-500">
                                                {item.percent != null ? `${item.percent.toFixed(2)}%` : "N/A"}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="rounded-lg border border-red-100 bg-red-50/50 p-3 space-y-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                                <Trash2 size={16} />
                                ล้างสลิปเก่า
                            </div>
                            <p className="text-xs text-red-600">ลบข้อมูลในคอลเลกชัน `payment_slips` และไฟล์ Firebase Storage ที่ผูกไว้ ที่เก่ากว่าระยะเวลาที่เลือก</p>
                            <div className="flex flex-wrap gap-2">
                                {[1, 3, 6].map((months) => (
                                    <button
                                        key={months}
                                        type="button"
                                        onClick={() => handleCleanupSlips(months as 1 | 3 | 6)}
                                        disabled={slipCleanupLoadingMonth !== null}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-60"
                                    >
                                        {slipCleanupLoadingMonth === months ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <Trash2 size={12} />
                                        )}
                                        เก่ากว่า {months} เดือน
                                    </button>
                                ))}
                            </div>
                            {slipCleanupMessage && (
                                <p className="text-xs text-red-700">{slipCleanupMessage}</p>
                            )}
                        </div>
                    </div>
                </section>
                )}

                {activeTab === 'indexes' && (
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-gray-100 flex flex-col gap-2 bg-gray-50 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-md bg-indigo-100 flex items-center justify-center text-indigo-600">
                                <Database size={16} />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-gray-900">Firestore Indexes</h2>
                                <p className="text-xs text-gray-500">ตรวจสอบ Composite Indexes ที่จำเป็น และกดลิงก์เพื่อสร้างใน Firebase Console</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={fetchIndexChecks}
                                disabled={indexCheckLoading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-60"
                            >
                                <RefreshCw size={12} className={indexCheckLoading ? "animate-spin" : ""} />
                                ตรวจสอบ Indexes
                            </button>
                        </div>
                    </div>

                    <div className="p-3 space-y-3">
                        {indexCheckError && (
                            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{indexCheckError}</div>
                        )}

                        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            {indexCheckLoading && indexCheckResults.length === 0 ? (
                                <div className="flex items-center justify-center p-8 text-sm text-gray-500">
                                    <Loader2 className="mr-2 animate-spin" size={16} />
                                    กำลังตรวจสอบ Composite Indexes...
                                </div>
                            ) : indexCheckResults.length === 0 ? (
                                <div className="p-4 text-sm text-gray-500">
                                    กด “ตรวจสอบ Indexes” เพื่อให้ระบบทดสอบ query สำคัญและสร้างลิงก์สำหรับ Index ที่ยังขาด
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                {indexCheckResults.map((item) => {
                                    const statusClass = item.status === "ready"
                                        ? "bg-green-50 text-green-700 border-green-100"
                                        : item.status === "missing"
                                            ? "bg-amber-50 text-amber-700 border-amber-100"
                                            : "bg-red-50 text-red-700 border-red-100";
                                    const statusLabel = item.status === "ready"
                                        ? "พร้อมใช้งาน"
                                        : item.status === "missing"
                                            ? "ต้องสร้าง"
                                            : "ตรวจไม่สำเร็จ";
                                    return (
                                        <div key={item.id} className="grid gap-2 px-3 py-2.5 text-xs md:grid-cols-[108px_112px_1fr_1.2fr_96px] md:items-center">
                                            <div>
                                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass}`}>
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            <div className="font-mono font-bold text-gray-900">{item.collection}</div>
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold text-gray-800">{item.title}</p>
                                                <p className="truncate text-[11px] text-gray-500">{item.source}</p>
                                            </div>
                                            <div className="flex min-w-0 flex-wrap gap-1">
                                                {item.fields.map((field) => (
                                                    <span key={field} className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-100">
                                                        {field}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="flex justify-start md:justify-end">
                                                    {item.status === "error" && item.error && (
                                                    <span className="line-clamp-1 text-[11px] text-red-600" title={item.error}>{item.error}</span>
                                                )}
                                                {item.status === "missing" && item.createUrl ? (
                                                    <a
                                                        href={item.createUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
                                                    >
                                                        <ExternalLink size={12} />
                                                        สร้าง
                                                    </a>
                                                ) : item.status === "ready" ? (
                                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-[11px] font-bold text-white">
                                                        <Check size={12} />
                                                        พร้อม
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                                </div>
                            )}
                        </div>

                        {indexCheckedAt && (
                            <div className="rounded-md border border-gray-100 bg-white px-3 py-2 text-xs text-gray-500">
                                ตรวจล่าสุด: {new Date(indexCheckedAt).toLocaleString("th-TH")}
                            </div>
                        )}
                    </div>
                </section>
                )}

                {/* Shipping */}
                {activeTab === 'shipping' && (
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <Truck size={16} className="text-gray-500" />
                        <span className="font-semibold text-sm text-gray-900">การจัดส่ง</span>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">ค่าจัดส่ง (บาท)</label>
                                <input
                                    type="number"
                                    name="shippingFee"
                                    value={settings.shippingFee}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">ส่งฟรีเมื่อซื้อครบ (บาท)</label>
                                <input
                                    type="number"
                                    name="freeShippingThreshold"
                                    value={settings.freeShippingThreshold}
                                    onChange={handleChange}
                                    placeholder="0 = ไม่มี"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                />
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">ตัวเลือกการจัดส่ง</p>
                                    <p className="text-xs text-gray-400">กำหนดค่าจัดส่งตามสถานที่ ยอดเงิน หรือจำนวนสินค้า</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addShippingOption}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800"
                                >
                                    <Plus size={14} />
                                    เพิ่มตัวเลือก
                                </button>
                            </div>

                            <div className="space-y-2">
                                {(settings.shippingOptions || []).map((option) => {
                                    const conditionType = option.conditionType || "standard";
                                    const usesThreshold = conditionType !== "location" && conditionType !== "standard";

                                    return (
                                        <div key={option.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_170px_120px_120px_auto_auto] lg:items-center">
                                                <input
                                                    type="text"
                                                    value={option.name}
                                                    onChange={(event) => updateShippingOption(option.id, "name", event.target.value)}
                                                    placeholder="ชื่อ เช่น รับที่สนามบิน"
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                />
                                                <select
                                                    value={conditionType}
                                                    onChange={(event) => updateShippingOption(option.id, "conditionType", event.target.value as ShippingConditionType)}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                >
                                                    {Object.entries(shippingConditionLabels).map(([value, label]) => (
                                                        <option key={value} value={value}>{label}</option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="number"
                                                    value={option.threshold || 0}
                                                    onChange={(event) => updateShippingOption(option.id, "threshold", Number(event.target.value))}
                                                    disabled={!usesThreshold}
                                                    placeholder={conditionType.includes("price") ? "ยอดเงิน" : "จำนวน"}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 disabled:opacity-40"
                                                />
                                                <input
                                                    type="number"
                                                    value={option.fee}
                                                    onChange={(event) => updateShippingOption(option.id, "fee", Number(event.target.value))}
                                                    placeholder="ค่าส่ง"
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                />
                                                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600">
                                                    <input
                                                        type="checkbox"
                                                        checked={option.isActive !== false}
                                                        onChange={(event) => updateShippingOption(option.id, "isActive", event.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                                                    />
                                                    เปิดใช้
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => removeShippingOption(option.id)}
                                                    className="inline-flex items-center justify-center p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                    aria-label="ลบตัวเลือกจัดส่ง"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={option.description || ""}
                                                onChange={(event) => updateShippingOption(option.id, "description", event.target.value)}
                                                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                                                className="mt-2 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                            />
                                        </div>
                                    );
                                })}
                                {(settings.shippingOptions || []).length === 0 && (
                                    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
                                        ยังไม่มีตัวเลือกการจัดส่ง
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
                )}

                {/* Pickup */}
                {activeTab === 'pickup' && (
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <MapPin size={16} className="text-gray-500" />
                        <div>
                            <span className="font-semibold text-sm text-gray-900">สถานที่รับสินค้า</span>
                            <p className="text-xs text-gray-400">ใช้เป็นตัวเลือกเมื่อแอดมินตั้งสถานะสินค้าเป็นพร้อมรับ</p>
                        </div>
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                            <div>
                                <p className="text-sm font-semibold text-gray-900">ตัวเลือกสถานที่รับ</p>
                                <p className="text-xs text-gray-400">เลือกเปิด/ปิด และแก้ข้อความที่จะแสดงให้ลูกค้าเห็นได้</p>
                            </div>
                            <button
                                type="button"
                                onClick={addPickupOption}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800"
                            >
                                <Plus size={14} />
                                เพิ่มตัวเลือก
                            </button>
                        </div>

                        <div className="space-y-2">
                            {(settings.pickupOptions || []).map((option) => (
                                <div key={option.id} className="rounded-lg border border-gray-200 bg-white p-3">
                                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-center">
                                        <input
                                            type="text"
                                            value={option.label}
                                            onChange={(event) => updatePickupOption(option.id, "label", event.target.value)}
                                            placeholder="เช่น locker ช่อง 01 รหัส 1234"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                        />
                                        <input
                                            type="text"
                                            value={option.detail || ""}
                                            onChange={(event) => updatePickupOption(option.id, "detail", event.target.value)}
                                            placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                        />
                                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600">
                                            <input
                                                type="checkbox"
                                                checked={option.isActive !== false}
                                                onChange={(event) => updatePickupOption(option.id, "isActive", event.target.checked)}
                                                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900/20"
                                            />
                                            เปิดใช้
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => removePickupOption(option.id)}
                                            className="inline-flex items-center justify-center p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                                            aria-label="ลบสถานที่รับ"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {(settings.pickupOptions || []).length === 0 && (
                                <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
                                    ยังไม่มีสถานที่รับ
                                </div>
                            )}
                        </div>
                    </div>
                </section>
                )}

                {/* Notifications */}
                {activeTab === 'line' && (
                <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <Bell size={16} className="text-gray-500" />
                        <span className="font-semibold text-sm text-gray-900">การแจ้งเตือน LINE</span>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="rounded-xl border border-gray-100 bg-white p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-700">โควต้าส่งข้อความของ API</p>
                                    <p className="text-[11px] text-gray-400">อ้างอิงจาก Token ที่บันทึกแล้ว</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchLineQuota}
                                    disabled={lineQuotaLoading}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-60"
                                >
                                    <RefreshCw size={12} className={lineQuotaLoading ? "animate-spin" : ""} />
                                    รีเฟรช
                                </button>
                            </div>
                            {lineQuotaLoading && (
                                <div className="mt-2 text-[11px] text-gray-500">กำลังโหลดโควต้า...</div>
                            )}
                            {lineQuotaError && (
                                <div className="mt-2 text-[11px] text-red-500">{lineQuotaError}</div>
                            )}
                            {!lineQuotaLoading && !lineQuotaError && (
                                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
                                        <p className="text-gray-400">ประเภท</p>
                                        <p className="font-semibold text-gray-900">
                                            {lineQuota?.type === "unlimited" ? "ไม่จำกัด" : "จำกัด"}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
                                        <p className="text-gray-400">โควต้า</p>
                                        <p className="font-semibold text-gray-900">
                                            {lineQuota?.type === "unlimited"
                                                ? "ไม่จำกัด"
                                                : lineQuota?.value != null
                                                    ? lineQuota.value.toLocaleString()
                                                    : "-"}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
                                        <p className="text-gray-400">ใช้ไปแล้ว</p>
                                        <p className="font-semibold text-gray-900">
                                            {lineQuota?.totalUsage != null ? lineQuota.totalUsage.toLocaleString() : "-"}
                                        </p>
                                    </div>
                                    <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
                                        <p className="text-gray-400">คงเหลือ</p>
                                        <p className="font-semibold text-gray-900">
                                            {lineQuota?.type === "limited" && lineQuota?.value != null && lineQuota?.totalUsage != null
                                                ? Math.max(0, lineQuota.value - lineQuota.totalUsage).toLocaleString()
                                                : lineQuota?.type === "unlimited"
                                                    ? "ไม่จำกัด"
                                                    : "-"}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Channel Access Token</label>
                                    <input
                                        type="password"
                                        name="lineChannelAccessToken"
                                        value={settings.lineChannelAccessToken}
                                        onChange={handleChange}
                                        placeholder="••••••••"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">Admin Group ID</label>
                                    <input
                                        type="text"
                                        name="lineAdminGroupId"
                                        value={settings.lineAdminGroupId}
                                        onChange={handleChange}
                                        placeholder="Cxxxxxxx..."
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500">Admin Users</label>
                                            <p className="text-[11px] text-gray-500">
                                                กำหนดชื่อแอดมินและ LINE User ID แยกเป็นรายคน
                                                {(settings.lineAdminUsers || []).filter(user => user.userId.trim()).length > 0
                                                    ? ` ส่งหาแอดมิน ${(settings.lineAdminUsers || []).filter(user => user.userId.trim()).length} คน`
                                                    : " ยังไม่ได้เพิ่มผู้รับแบบรายคน"}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addLineAdminUser}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                                        >
                                            <Plus size={12} />
                                            เพิ่มแอดมิน
                                        </button>
                                    </div>

                                    <div className="space-y-2">
                                        {(settings.lineAdminUsers || []).length === 0 && (
                                            <button
                                                type="button"
                                                onClick={addLineAdminUser}
                                                className="w-full px-3 py-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-sm font-medium text-gray-500 hover:bg-gray-100"
                                            >
                                                เพิ่มแอดมินคนแรก
                                            </button>
                                        )}
                                        {(settings.lineAdminUsers || []).map((admin, index) => (
                                            <div key={admin.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_auto] gap-2 rounded-lg border border-gray-200 bg-white p-2">
                                                <input
                                                    type="text"
                                                    value={admin.name}
                                                    onChange={(event) => updateLineAdminUser(admin.id, "name", event.target.value)}
                                                    placeholder={`ชื่อแอดมิน ${index + 1}`}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                />
                                                <input
                                                    type="text"
                                                    value={admin.userId}
                                                    onChange={(event) => updateLineAdminUser(admin.id, "userId", event.target.value)}
                                                    placeholder="Uxxxxxxx..."
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeLineAdminUser(admin.id)}
                                                    className="inline-flex items-center justify-center p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                    aria-label={`ลบแอดมิน ${admin.name || index + 1}`}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                                <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">แจ้งแอดมิน</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">แจ้งเมื่อมีออเดอร์ใหม่</span>
                                        <span className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="lineNotifyAdminNewOrder"
                                                checked={Boolean(settings.lineNotifyAdminNewOrder)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></span>
                                        </span>
                                    </label>
                                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">แจ้งเมื่อมีการเปลี่ยนสถานะออเดอร์</span>
                                        <span className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="lineNotifyAdminOrder"
                                                checked={Boolean(settings.lineNotifyAdminOrder)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></span>
                                        </span>
                                    </label>
                                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">แจ้งเตือนเมื่อมีการชำระเงิน</span>
                                        <span className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="lineNotifyAdminPayment"
                                                checked={Boolean(settings.lineNotifyAdminPayment)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></span>
                                        </span>
                                    </label>
                                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">แจ้งเมื่อมีการยกเลิกออเดอร์</span>
                                        <span className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="lineNotifyAdminCancelled"
                                                checked={Boolean(settings.lineNotifyAdminCancelled)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></span>
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                                <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">แจ้งลูกค้า</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">แจ้งเตือนสั่งซื้อสำเร็จ</span>
                                        <span className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="lineNotifyCustomerOrderSuccess"
                                                checked={Boolean(settings.lineNotifyCustomerOrderSuccess)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></span>
                                        </span>
                                    </label>
                                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">แจ้งยืนยันการชำระเงิน</span>
                                        <span className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="lineNotifyCustomerPaymentConfirmed"
                                                checked={Boolean(settings.lineNotifyCustomerPaymentConfirmed)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></span>
                                        </span>
                                    </label>
                                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">แจ้งเมื่อจัดส่งสินค้า</span>
                                        <span className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="lineNotifyCustomerShipped"
                                                checked={Boolean(settings.lineNotifyCustomerShipped)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></span>
                                        </span>
                                    </label>
                                    <label className="flex items-center justify-between gap-3 cursor-pointer group">
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">แจ้งเมื่อมีการยกเลิกสินค้า</span>
                                        <span className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="lineNotifyCustomerCancelled"
                                                checked={Boolean(settings.lineNotifyCustomerCancelled)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-900"></span>
                                        </span>
                                    </label>
                                </div>
                            </div>

                        </div>
                    </div>
                    </div>
                </section>
                )}
            </form>
        </div>
    );
}


