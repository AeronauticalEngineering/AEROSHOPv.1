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
    RefreshCw,
    Database,
    Trash2,
    Plus,
    MapPin,
    ExternalLink,
    Layers,
    ShieldCheck,
    UploadCloud,
    CheckCircle2,
    Building2
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

type TabType = 'store' | 'payment' | 'shipping' | 'pickup' | 'line' | 'firestore' | 'indexes';

const TABS: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'store', label: 'ร้านค้า', icon: Store },
    { id: 'payment', label: 'การชำระเงิน', icon: CreditCard },
    { id: 'shipping', label: 'การจัดส่ง', icon: Truck },
    { id: 'pickup', label: 'จุดรับสินค้า', icon: MapPin },
    { id: 'line', label: 'แจ้งเตือน LINE', icon: Bell },
    { id: 'firestore', label: 'ฐานข้อมูล & Storage', icon: Database },
    { id: 'indexes', label: 'ดัชนี (Indexes)', icon: Layers },
];

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
    const [activeTab, setActiveTab] = useState<TabType>('store');
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
                message: "เชื่อมต่อและ Rules อนุญาต Upload/Delete สมบูรณ์",
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
                ? " (ข้ามลบ Storage เนื่องจากยังไม่ระบุ Bucket)"
                : failedStorageDeleteCount > 0
                    ? ` (ลบไฟล์ไม่สำเร็จ ${failedStorageDeleteCount.toLocaleString()} ไฟล์)`
                    : "";
            setSlipCleanupMessage(
                `สำเร็จ: ลบสลิป ${deletedCount.toLocaleString()} รายการ, ลบไฟล์ Storage ${deletedStorageCount.toLocaleString()} ไฟล์${storageNote}`
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

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
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
            setTimeout(() => setShowSuccess(false), 2200);
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[380px] text-slate-400 gap-3">
                <Loader2 className="animate-spin text-slate-500" size={28} />
                <span className="text-xs font-medium">กำลังโหลดการตั้งค่า...</span>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-4 pb-12 font-sans antialiased text-slate-800">
            {/* Header: Zero-Noise, Compact, Action-oriented */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200/60">
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-slate-900">ตั้งค่าระบบ</h1>
                    <p className="text-xs text-slate-500 mt-0.5">จัดการข้อมูลร้านค้า ช่องทางชำระเงิน การจัดส่ง และการแจ้งเตือน</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => handleSave()}
                        disabled={isSaving}
                        className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 shadow-xs cursor-pointer ${
                            showSuccess
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]'
                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                        {isSaving ? (
                            <Loader2 className="animate-spin" size={14} />
                        ) : showSuccess ? (
                            <Check size={14} className="stroke-[2.5]" />
                        ) : (
                            <Save size={14} />
                        )}
                        <span>{showSuccess ? 'บันทึกสำเร็จ' : isSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
                    </button>
                </div>
            </div>

            {/* Clean Segmented Tab Navigation */}
            <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl overflow-x-auto no-scrollbar border border-slate-200/60 text-xs font-medium">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0 transition-all cursor-pointer select-none ${
                                isActive
                                    ? 'bg-white text-slate-900 font-semibold shadow-xs ring-1 ring-slate-200/80'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                            }`}
                        >
                            <Icon size={14} className={isActive ? 'text-slate-900' : 'text-slate-400'} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Main Form Content */}
            <form onSubmit={handleSave} className="space-y-4">
                
                {/* TAB 1: ข้อมูลร้านค้า (Store) */}
                {activeTab === 'store' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Store Info Fields */}
                        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 p-4.5 space-y-4 shadow-2xs">
                            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                                <Building2 size={16} className="text-slate-500" />
                                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">ข้อมูลพื้นฐานร้านค้า</h2>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อร้านค้า</label>
                                    <input
                                        type="text"
                                        name="storeName"
                                        value={settings.storeName || ""}
                                        onChange={handleChange}
                                        placeholder="ชื่อร้านของคุณ"
                                        className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">เบอร์โทรศัพท์ติดต่อ</label>
                                    <input
                                        type="text"
                                        name="storePhone"
                                        value={settings.storePhone || ""}
                                        onChange={handleChange}
                                        placeholder="08x-xxx-xxxx"
                                        className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">อีเมลติดต่อร้านค้า</label>
                                <input
                                    type="email"
                                    name="storeEmail"
                                    value={settings.storeEmail || ""}
                                    onChange={handleChange}
                                    placeholder="contact@example.com"
                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">ที่อยู่ร้านค้า / หน้าสาขา</label>
                                <textarea
                                    name="storeAddress"
                                    value={settings.storeAddress || ""}
                                    onChange={handleChange}
                                    rows={2}
                                    placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">ลิงก์ Google Maps</label>
                                <input
                                    type="text"
                                    name="storeMapUrl"
                                    value={settings.storeMapUrl || ""}
                                    onChange={handleChange}
                                    placeholder="https://maps.google.com/..."
                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Store Logo Card */}
                        <div className="bg-white rounded-xl border border-slate-200/80 p-4.5 space-y-3.5 shadow-2xs flex flex-col">
                            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                                <UploadCloud size={16} className="text-slate-500" />
                                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">โลโก้ร้านค้า</h2>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50 p-4 min-h-[160px] text-center">
                                {logoPreview ? (
                                    <div className="relative group w-28 h-28 flex items-center justify-center p-2 bg-white rounded-lg border border-slate-200 shadow-2xs">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={logoPreview} alt="Logo Preview" className="max-w-full max-h-full object-contain" />
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 text-center text-slate-400">
                                        <Store size={32} className="mx-auto text-slate-300" />
                                        <p className="text-xs font-medium text-slate-500">ยังไม่มีโลโก้ร้าน</p>
                                        <p className="text-[11px] text-slate-400">รองรับไฟล์ PNG หรือ JPG</p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:border-slate-300 cursor-pointer transition-colors shadow-2xs">
                                    <UploadCloud size={14} className="text-slate-500" />
                                    <span>เลือกไฟล์รูปโลโก้</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoChange}
                                        className="hidden"
                                    />
                                </label>
                                <p className="text-[10px] text-center text-slate-400 mt-1.5">ขนาดแนะนำ: 400x400 px พื้นหลังโปร่งใส</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: การชำระเงิน (Payment) */}
                {activeTab === 'payment' && (
                    <div className="space-y-3">
                        {/* 1. โอนเงินผ่านธนาคาร */}
                        <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                            <div className="px-4 py-3 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                                        <Banknote size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900">โอนเงินผ่านบัญชีธนาคาร (Bank Transfer)</h3>
                                        <p className="text-[11px] text-slate-500">เปิดให้ลูกค้าแนบสลิปโอนเงินเข้าบัญชี</p>
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
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                                </label>
                            </div>

                            {settings.enableBankTransfer && (
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อธนาคาร</label>
                                        <input
                                            type="text"
                                            name="bankName"
                                            value={settings.bankName || ""}
                                            onChange={handleChange}
                                            placeholder="เช่น กสิกรไทย, ไทยพาณิชย์"
                                            className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">เลขที่บัญชี</label>
                                        <input
                                            type="text"
                                            name="bankAccountNumber"
                                            value={settings.bankAccountNumber || ""}
                                            onChange={handleChange}
                                            placeholder="xxx-x-xxxxx-x"
                                            className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อบัญชีผู้รับ</label>
                                        <input
                                            type="text"
                                            name="bankAccountName"
                                            value={settings.bankAccountName || ""}
                                            onChange={handleChange}
                                            placeholder="ชื่อ-นามสกุล หรือ บริษัท"
                                            className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. พร้อมเพย์ (PromptPay) */}
                        <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                            <div className="px-4 py-3 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                                        <QrCode size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900">พร้อมเพย์ (PromptPay QR)</h3>
                                        <p className="text-[11px] text-slate-500">สร้าง QR Code รับเงินอัตโนมัติตามยอดคำสั่งซื้อ</p>
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
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                                </label>
                            </div>

                            {settings.enablePromptPay && (
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">PromptPay ID (เบอร์โทร หรือ เลขผู้เสียภาษี)</label>
                                        <input
                                            type="text"
                                            name="promptPayId"
                                            value={settings.promptPayId || ""}
                                            onChange={handleChange}
                                            placeholder="08xxxxxxxx หรือ 0xxxxxxxxxxxx"
                                            className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">ชื่อบัญชีผู้รับเงิน</label>
                                        <input
                                            type="text"
                                            name="promptPayAccountName"
                                            value={settings.promptPayAccountName || ""}
                                            onChange={handleChange}
                                            placeholder="ชื่อบัญชีพร้อมเพย์"
                                            className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 3. Slip Verification (SlipOK) */}
                        <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                            <div className="px-4 py-3 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
                                        <ShieldCheck size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900">ตรวจสลิปอัตโนมัติ (SlipOK API)</h3>
                                        <p className="text-[11px] text-slate-500">ตรวจสอบความถูกต้องของสลิป ยอดเงิน และเวลาโอนแบบเรียลไทม์</p>
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
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                                </label>
                            </div>

                            {settings.enableSlipVerify && (
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">SlipOK Branch ID</label>
                                        <input
                                            type="text"
                                            name="slipokBranchId"
                                            value={settings.slipokBranchId || ""}
                                            onChange={handleChange}
                                            placeholder="branch_xxxx"
                                            className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">SlipOK API Key</label>
                                        <input
                                            type="password"
                                            name="slipokApiKey"
                                            value={settings.slipokApiKey || ""}
                                            onChange={handleChange}
                                            placeholder="••••••••••••••••"
                                            className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 4. เก็บเงินปลายทาง (COD) */}
                        <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                            <div className="px-4 py-3 flex items-center justify-between bg-slate-50/50">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                                        <Truck size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-slate-900">เก็บเงินปลายทาง (Cash on Delivery)</h3>
                                        <p className="text-[11px] text-slate-500">เปิดให้ลูกค้าชำระเงินเมื่อสินค้าส่งถึงที่หมาย</p>
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
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                                </label>
                            </div>
                        </div>

                        {/* 5. Payment Gateways (Stripe & Omise) */}
                        <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs">
                            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2.5">
                                <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                                    <Globe size={16} />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-slate-900">Payment Gateway สากล</h3>
                                    <p className="text-[11px] text-slate-500">เชื่อมต่อระบบชำระผ่านบัตรเครดิต/เดบิต</p>
                                </div>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* Stripe */}
                                <div className="pb-3.5 border-b border-slate-100">
                                    <div className="flex items-center justify-between mb-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-800">Stripe Payment</span>
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">บัตรเครดิตสากล</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="enableStripe"
                                                checked={Boolean(settings.enableStripe)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                                        </label>
                                    </div>
                                    {settings.enableStripe && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-500 mb-1">Publishable Key</label>
                                                <input
                                                    type="text"
                                                    name="stripePublishableKey"
                                                    value={settings.stripePublishableKey || ""}
                                                    onChange={handleChange}
                                                    placeholder="pk_test_..."
                                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-500 mb-1">Secret Key</label>
                                                <input
                                                    type="password"
                                                    name="stripeSecretKey"
                                                    value={settings.stripeSecretKey || ""}
                                                    onChange={handleChange}
                                                    placeholder="sk_test_..."
                                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Omise */}
                                <div>
                                    <div className="flex items-center justify-between mb-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-800">Omise Payment</span>
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">Thailand Gateway</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="enableOmise"
                                                checked={Boolean(settings.enableOmise)}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                                        </label>
                                    </div>
                                    {settings.enableOmise && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-500 mb-1">Public Key</label>
                                                <input
                                                    type="text"
                                                    name="omisePublicKey"
                                                    value={settings.omisePublicKey || ""}
                                                    onChange={handleChange}
                                                    placeholder="pkey_test_..."
                                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-medium text-slate-500 mb-1">Secret Key</label>
                                                <input
                                                    type="password"
                                                    name="omiseSecretKey"
                                                    value={settings.omiseSecretKey || ""}
                                                    onChange={handleChange}
                                                    placeholder="skey_test_..."
                                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: การจัดส่ง (Shipping) */}
                {activeTab === 'shipping' && (
                    <div className="bg-white rounded-xl border border-slate-200/80 p-4.5 space-y-4 shadow-2xs">
                        {/* Standard Fee */}
                        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                            <Truck size={16} className="text-slate-500" />
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">ค่าจัดส่งมาตรฐาน</h2>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">ค่าจัดส่งพื้นฐาน (บาท)</label>
                                <input
                                    type="number"
                                    name="shippingFee"
                                    value={settings.shippingFee ?? 0}
                                    onChange={handleChange}
                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">ส่งฟรีเมื่อยอดสั่งซื้อครบ (บาท)</label>
                                <input
                                    type="number"
                                    name="freeShippingThreshold"
                                    value={settings.freeShippingThreshold ?? 0}
                                    onChange={handleChange}
                                    placeholder="0 = ไม่เปิดใช้ส่งฟรี"
                                    className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Custom Options */}
                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-800">ตัวเลือกการจัดส่งเพิ่มเติม</h3>
                                    <p className="text-[11px] text-slate-400">กำหนดเงื่อนไขค่าจัดส่งตามสถานที่ ยอดสั่งซื้อ หรือจำนวนชิ้น</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addShippingOption}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer shadow-2xs"
                                >
                                    <Plus size={13} />
                                    <span>เพิ่มตัวเลือก</span>
                                </button>
                            </div>

                            <div className="space-y-2">
                                {(settings.shippingOptions || []).map((option) => {
                                    const conditionType = option.conditionType || "standard";
                                    const usesThreshold = conditionType !== "location" && conditionType !== "standard";

                                    return (
                                        <div key={option.id} className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-2">
                                            <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_130px_100px_90px_auto_auto] gap-2 items-center">
                                                <input
                                                    type="text"
                                                    value={option.name}
                                                    onChange={(e) => updateShippingOption(option.id, "name", e.target.value)}
                                                    placeholder="ชื่อตัวเลือก เช่น EMS / นัดรับ"
                                                    className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-800"
                                                />
                                                <select
                                                    value={conditionType}
                                                    onChange={(e) => updateShippingOption(option.id, "conditionType", e.target.value as ShippingConditionType)}
                                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-800 focus:outline-none focus:border-slate-800"
                                                >
                                                    {Object.entries(shippingConditionLabels).map(([val, lbl]) => (
                                                        <option key={val} value={val}>{lbl}</option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="number"
                                                    value={option.threshold || 0}
                                                    onChange={(e) => updateShippingOption(option.id, "threshold", Number(e.target.value))}
                                                    disabled={!usesThreshold}
                                                    placeholder="เกณฑ์"
                                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-800 disabled:bg-slate-100 disabled:opacity-40"
                                                />
                                                <input
                                                    type="number"
                                                    value={option.fee}
                                                    onChange={(e) => updateShippingOption(option.id, "fee", Number(e.target.value))}
                                                    placeholder="ค่าส่ง"
                                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-800"
                                                />
                                                <label className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={option.isActive !== false}
                                                        onChange={(e) => updateShippingOption(option.id, "isActive", e.target.checked)}
                                                        className="w-3.5 h-3.5 rounded text-slate-900 border-slate-300 focus:ring-0"
                                                    />
                                                    <span>เปิด</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => removeShippingOption(option.id)}
                                                    className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                                    title="ลบตัวเลือก"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={option.description || ""}
                                                onChange={(e) => updateShippingOption(option.id, "description", e.target.value)}
                                                placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                                                className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] text-slate-700 focus:outline-none focus:border-slate-800"
                                            />
                                        </div>
                                    );
                                })}

                                {(settings.shippingOptions || []).length === 0 && (
                                    <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                                        ยังไม่มีตัวเลือกการจัดส่งเพิ่มเติม กด &ldquo;เพิ่มตัวเลือก&rdquo; ด้านบนเพื่อสร้างใหม่
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 4: จุดรับสินค้า (Pickup) */}
                {activeTab === 'pickup' && (
                    <div className="bg-white rounded-xl border border-slate-200/80 p-4.5 space-y-4 shadow-2xs">
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <MapPin size={16} className="text-slate-500" />
                                <div>
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">จุดรับสินค้า / ล็อกเกอร์</h2>
                                    <p className="text-[11px] text-slate-400">ตัวเลือกสถานที่รับสินค้าเมื่อแอดมินตั้งสถานะเป็น &ldquo;พร้อมรับ&rdquo;</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={addPickupOption}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer shadow-2xs"
                            >
                                <Plus size={13} />
                                <span>เพิ่มจุดรับ</span>
                            </button>
                        </div>

                        <div className="space-y-2">
                            {(settings.pickupOptions || []).map((option) => (
                                <div key={option.id} className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg">
                                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                                        <input
                                            type="text"
                                            value={option.label}
                                            onChange={(e) => updatePickupOption(option.id, "label", e.target.value)}
                                            placeholder="ชื่อจุดรับ เช่น Locker ช่อง 01"
                                            className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-800"
                                        />
                                        <input
                                            type="text"
                                            value={option.detail || ""}
                                            onChange={(e) => updatePickupOption(option.id, "detail", e.target.value)}
                                            placeholder="รหัส หรือคำอธิบายเพิ่มเติม (ไม่บังคับ)"
                                            className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-900 focus:outline-none focus:border-slate-800"
                                        />
                                        <label className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={option.isActive !== false}
                                                onChange={(e) => updatePickupOption(option.id, "isActive", e.target.checked)}
                                                className="w-3.5 h-3.5 rounded text-slate-900 border-slate-300 focus:ring-0"
                                            />
                                            <span>เปิดใช้</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => removePickupOption(option.id)}
                                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                            title="ลบจุดรับ"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {(settings.pickupOptions || []).length === 0 && (
                                <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                                    ยังไม่มีจุดรับสินค้า กด &ldquo;เพิ่มจุดรับ&rdquo; เพื่อกำหนดจุดรับหน้าร้านหรือล็อกเกอร์
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 5: แจ้งเตือน LINE (LINE Notifications) */}
                {activeTab === 'line' && (
                    <div className="space-y-4">
                        {/* LINE Quota Bar: Compact KPI Strip */}
                        <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs">
                            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                <div className="flex items-center gap-1.5">
                                    <Bell size={14} className="text-slate-600" />
                                    <span className="text-xs font-bold text-slate-800">โควต้าข้อความ LINE Messaging API</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchLineQuota}
                                    disabled={lineQuotaLoading}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded cursor-pointer disabled:opacity-50"
                                >
                                    <RefreshCw size={11} className={lineQuotaLoading ? "animate-spin" : ""} />
                                    <span>รีเฟรชโควต้า</span>
                                </button>
                            </div>

                            {lineQuotaError ? (
                                <p className="text-xs text-red-600">{lineQuotaError}</p>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                        <span className="text-[10px] text-slate-400 block">แพ็กเกจ</span>
                                        <span className="font-semibold text-slate-800">
                                            {lineQuota?.type === "unlimited" ? "ไม่จำกัด (Unlimited)" : "จำกัดข้อความ"}
                                        </span>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                        <span className="text-[10px] text-slate-400 block">โควต้ารวม</span>
                                        <span className="font-semibold text-slate-800 font-mono">
                                            {lineQuota?.type === "unlimited" ? "∞" : lineQuota?.value?.toLocaleString() || "-"}
                                        </span>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                        <span className="text-[10px] text-slate-400 block">ส่งไปแล้ว</span>
                                        <span className="font-semibold text-slate-800 font-mono">
                                            {lineQuota?.totalUsage?.toLocaleString() || "0"}
                                        </span>
                                    </div>
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                        <span className="text-[10px] text-slate-400 block">คงเหลือ</span>
                                        <span className="font-semibold text-emerald-700 font-mono">
                                            {lineQuota?.type === "limited" && lineQuota?.value != null && lineQuota?.totalUsage != null
                                                ? Math.max(0, lineQuota.value - lineQuota.totalUsage).toLocaleString()
                                                : "∞"}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* LINE Credentials & Admins */}
                        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3.5">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">การเชื่อมต่อ LINE Messaging API</h2>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Channel Access Token</label>
                                    <input
                                        type="password"
                                        name="lineChannelAccessToken"
                                        value={settings.lineChannelAccessToken || ""}
                                        onChange={handleChange}
                                        placeholder="••••••••••••••••"
                                        className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Admin Group ID (สำหรับแจ้งเตือนกลุ่ม)</label>
                                    <input
                                        type="text"
                                        name="lineAdminGroupId"
                                        value={settings.lineAdminGroupId || ""}
                                        onChange={handleChange}
                                        placeholder="Cxxxxxxxx..."
                                        className="w-full px-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-slate-800 transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Admin Users list */}
                            <div className="pt-2 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <h3 className="text-xs font-semibold text-slate-800">รายชื่อแอดมินรับแจ้งเตือน (Line User ID)</h3>
                                        <p className="text-[11px] text-slate-400">ส่งข้อความแจ้งเตือนตรงถึงแอดมินรายคน</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addLineAdminUser}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md cursor-pointer transition-colors"
                                    >
                                        <Plus size={12} />
                                        <span>เพิ่มแอดมิน</span>
                                    </button>
                                </div>

                                <div className="space-y-1.5">
                                    {(settings.lineAdminUsers || []).map((admin, idx) => (
                                        <div key={admin.id} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2 items-center p-1.5 bg-slate-50 border border-slate-200/60 rounded-lg">
                                            <input
                                                type="text"
                                                value={admin.name}
                                                onChange={(e) => updateLineAdminUser(admin.id, "name", e.target.value)}
                                                placeholder={`ชื่อแอดมิน ${idx + 1}`}
                                                className="px-2.5 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-800 focus:outline-none focus:border-slate-800"
                                            />
                                            <input
                                                type="text"
                                                value={admin.userId}
                                                onChange={(e) => updateLineAdminUser(admin.id, "userId", e.target.value)}
                                                placeholder="Uxxxxxxxx..."
                                                className="px-2.5 py-1 bg-white border border-slate-200 rounded text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-slate-800"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeLineAdminUser(admin.id)}
                                                className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}

                                    {(settings.lineAdminUsers || []).length === 0 && (
                                        <p className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                                            ยังไม่มีแอดมินรายบุคคล สามารถกด &ldquo;เพิ่มแอดมิน&rdquo; เพื่อใส่ Line User ID
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Notification Event Toggles: 2 Clean Columns */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* แจ้งแอดมิน */}
                            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-2.5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-1.5 border-b border-slate-100">
                                    แจ้งเตือนผู้ดูแลระบบ (Admin)
                                </h3>
                                
                                {[
                                    { key: "lineNotifyAdminNewOrder", label: "เมื่อมีคำสั่งซื้อใหม่เข้ามา" },
                                    { key: "lineNotifyAdminPayment", label: "เมื่อมีการแจ้งชำระเงิน / แนบสลิป" },
                                    { key: "lineNotifyAdminOrder", label: "เมื่อมีการเปลี่ยนสถานะคำสั่งซื้อ" },
                                    { key: "lineNotifyAdminCancelled", label: "เมื่อคำสั่งซื้อถูกยกเลิก" },
                                ].map((item) => (
                                    <label key={item.key} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer select-none transition-colors">
                                        <span className="text-xs font-medium text-slate-700">{item.label}</span>
                                        <span className="relative inline-flex items-center">
                                            <input
                                                type="checkbox"
                                                name={item.key}
                                                checked={Boolean(settings[item.key as keyof StoreSettings])}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-slate-900"></span>
                                        </span>
                                    </label>
                                ))}
                            </div>

                            {/* แจ้งลูกค้า */}
                            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-2.5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-1.5 border-b border-slate-100">
                                    แจ้งเตือนลูกค้า (Customer)
                                </h3>

                                {[
                                    { key: "lineNotifyCustomerOrderSuccess", label: "แจ้งยืนยันการสั่งซื้อสำเร็จ" },
                                    { key: "lineNotifyCustomerPaymentConfirmed", label: "แจ้งเมื่อตรวจสอบการชำระเงินเรียบร้อย" },
                                    { key: "lineNotifyCustomerShipped", label: "แจ้งเลขพัสดุและจัดส่งสินค้าแล้ว" },
                                    { key: "lineNotifyCustomerCancelled", label: "แจ้งเมื่อคำสั่งซื้อถูกยกเลิก" },
                                ].map((item) => (
                                    <label key={item.key} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 cursor-pointer select-none transition-colors">
                                        <span className="text-xs font-medium text-slate-700">{item.label}</span>
                                        <span className="relative inline-flex items-center">
                                            <input
                                                type="checkbox"
                                                name={item.key}
                                                checked={Boolean(settings[item.key as keyof StoreSettings])}
                                                onChange={handleChange}
                                                className="sr-only peer"
                                            />
                                            <span className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-slate-900"></span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 6: ฐานข้อมูล & Storage (Firestore Usage) */}
                {activeTab === 'firestore' && (
                    <div className="space-y-4">
                        {/* Storage Toggles */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs flex items-center justify-between">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-800">Storage รูปสินค้า</h3>
                                    <p className="text-[11px] text-slate-500">เก็บไฟล์ภาพลง Cloud Storage แทน Base64</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="useStorageForProductImages"
                                        checked={Boolean(settings.useStorageForProductImages)}
                                        onChange={handleChange}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                                </label>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs flex items-center justify-between">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-800">Storage รูปสลิป</h3>
                                    <p className="text-[11px] text-slate-500">เก็บสลิปลง Cloud Storage สำหรับตรวจย้อนหลัง</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={checkStorageRules}
                                        disabled={storageRuleCheck.status === "checking"}
                                        className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer transition-colors"
                                    >
                                        {storageRuleCheck.status === "checking" ? "ตรวจ..." : "ตรวจ Rules"}
                                    </button>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="useStorageForPaymentSlips"
                                            checked={Boolean(settings.useStorageForPaymentSlips)}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Usage Metrics Cards */}
                        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-800">ปริมาณการใช้งาน Firestore & Storage</h3>
                                    <p className="text-[11px] text-slate-400">ดึงข้อมูลจริงจาก Google Cloud Monitoring (24 ชม. ล่าสุด)</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        fetchFirestoreUsage();
                                        fetchStorageUsage();
                                    }}
                                    disabled={firestoreUsageLoading || storageUsageLoading}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer transition-colors"
                                >
                                    <RefreshCw size={12} className={firestoreUsageLoading || storageUsageLoading ? "animate-spin" : ""} />
                                    <span>รีเฟรช</span>
                                </button>
                            </div>

                            {storageUsageError && (
                                <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">{storageUsageError}</p>
                            )}

                            {firestoreUsageError && (
                                <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">{firestoreUsageError}</p>
                            )}

                            {storageUsage && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-2.5 bg-slate-50 rounded-lg border border-slate-200/60">
                                    <div>
                                        <span className="text-[10px] text-slate-400 block">Bucket</span>
                                        <span className="font-semibold text-slate-800 font-mono truncate block">{storageUsage.bucketName || "-"}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block">ขนาดใช้งาน</span>
                                        <span className="font-semibold text-slate-800 font-mono">{formatBytes(storageUsage.metrics.storageBytes)}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block">จำนวนไฟล์</span>
                                        <span className="font-semibold text-slate-800 font-mono">{storageUsage.metrics.objectCount != null ? storageUsage.metrics.objectCount.toLocaleString() : "-"}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-slate-400 block">Plan</span>
                                        <span className="font-semibold text-slate-800 uppercase">{storageUsage.plan}</span>
                                    </div>
                                </div>
                            )}

                            {/* Storage space progress */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs text-slate-600 font-medium">
                                    <span>พื้นที่จัดเก็บ Firestore: {formatBytes(firestoreUsage?.metrics?.storageBytes)}</span>
                                    <span>{firestoreUsage?.percent?.storage != null ? `${firestoreUsage.percent.storage.toFixed(2)}%` : "N/A"}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-slate-800 rounded-full transition-all"
                                        style={{ width: `${Math.min(100, Math.max(0, firestoreUsage?.percent?.storage || 0))}%` }}
                                    />
                                </div>
                            </div>

                            {/* Daily Quota stats */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                                {[
                                    { label: "Reads (24h)", val: firestoreUsage?.metrics?.reads24h, lim: firestoreUsage?.limits?.reads24h, pct: firestoreUsage?.percent?.reads24h },
                                    { label: "Writes (24h)", val: firestoreUsage?.metrics?.writes24h, lim: firestoreUsage?.limits?.writes24h, pct: firestoreUsage?.percent?.writes24h },
                                    { label: "Deletes (24h)", val: firestoreUsage?.metrics?.deletes24h, lim: firestoreUsage?.limits?.deletes24h, pct: firestoreUsage?.percent?.deletes24h },
                                ].map((stat) => (
                                    <div key={stat.label} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/60">
                                        <span className="text-[10px] text-slate-400 block">{stat.label}</span>
                                        <span className="font-semibold text-slate-800 font-mono">
                                            {stat.val != null ? stat.val.toLocaleString() : "-"}
                                        </span>
                                        <span className="text-[10px] text-slate-400"> / {stat.lim != null ? stat.lim.toLocaleString() : "ไม่จำกัด"}</span>
                                        <div className="mt-1.5 w-full h-1 bg-white rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-slate-700 transition-all"
                                                style={{ width: `${Math.min(100, Math.max(0, stat.pct || 0))}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Clean Slip Cleanup Box */}
                        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                <Trash2 size={14} className="text-slate-500" />
                                <span>ล้างสลิปและไฟล์เก่า (Cleanup Storage)</span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                                ลบประวัติสลิปในคอลเลกชันและไฟล์ภาพที่เก่ากว่าช่วงเวลาที่ระบุเพื่อประหยัดพื้นที่
                            </p>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                {[1, 3, 6].map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => handleCleanupSlips(m as 1 | 3 | 6)}
                                        disabled={slipCleanupLoadingMonth !== null}
                                        className="px-3 py-1.5 bg-slate-50 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer transition-colors disabled:opacity-50"
                                    >
                                        {slipCleanupLoadingMonth === m ? (
                                            <span className="inline-flex items-center gap-1">
                                                <Loader2 size={12} className="animate-spin" /> กำลังลบ...
                                            </span>
                                        ) : (
                                            `เก่ากว่า ${m} เดือน`
                                        )}
                                    </button>
                                ))}
                            </div>
                            {slipCleanupMessage && (
                                <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-md border border-slate-200 mt-2">{slipCleanupMessage}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 7: ดัชนี (Composite Indexes) */}
                {activeTab === 'indexes' && (
                    <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div>
                                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Firestore Composite Indexes</h2>
                                <p className="text-[11px] text-slate-400">ตรวจสอบดัชนีที่จำเป็นเพื่อความเร็วในการค้นหาและจัดเรียง</p>
                            </div>
                            <button
                                type="button"
                                onClick={fetchIndexChecks}
                                disabled={indexCheckLoading}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                            >
                                <RefreshCw size={12} className={indexCheckLoading ? "animate-spin" : ""} />
                                <span>ตรวจสอบดัชนี</span>
                            </button>
                        </div>

                        {indexCheckError && (
                            <p className="text-xs text-red-600 p-2 bg-red-50 rounded border border-red-100">{indexCheckError}</p>
                        )}

                        <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-lg overflow-hidden">
                            {indexCheckLoading && indexCheckResults.length === 0 ? (
                                <div className="py-8 text-center text-xs text-slate-400">
                                    <Loader2 size={18} className="animate-spin mx-auto mb-1 text-slate-400" />
                                    กำลังตรวจสอบ Composite Indexes...
                                </div>
                            ) : indexCheckResults.length === 0 ? (
                                <div className="py-8 text-center text-xs text-slate-400">
                                    กดปุ่ม &ldquo;ตรวจสอบดัชนี&rdquo; เพื่อตรวจสอบความพร้อมของระบบ
                                </div>
                            ) : (
                                indexCheckResults.map((item) => (
                                    <div key={item.id} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-slate-50/50">
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                    item.status === 'ready'
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        : item.status === 'missing'
                                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                        : 'bg-red-50 text-red-700 border border-red-200'
                                                }`}>
                                                    {item.status === 'ready' ? 'พร้อม' : item.status === 'missing' ? 'ต้องสร้าง' : 'ผิดพลาด'}
                                                </span>
                                                <span className="font-mono font-bold text-slate-800">{item.collection}</span>
                                                <span className="text-slate-500 font-medium">({item.title})</span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-mono">
                                                ฟิลด์: {item.fields.join(", ")}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {item.status === "missing" && item.createUrl && (
                                                <a
                                                    href={item.createUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded cursor-pointer"
                                                >
                                                    <ExternalLink size={12} />
                                                    <span>สร้าง Index</span>
                                                </a>
                                            )}
                                            {item.status === "ready" && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                                    <CheckCircle2 size={13} />
                                                    <span>สมบูรณ์</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {indexCheckedAt && (
                            <p className="text-[10px] text-slate-400 text-right">
                                ตรวจสอบล่าสุด: {new Date(indexCheckedAt).toLocaleString("th-TH")}
                            </p>
                        )}
                    </div>
                )}
            </form>
        </div>
    );
}
