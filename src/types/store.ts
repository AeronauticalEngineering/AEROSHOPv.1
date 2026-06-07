// src/types/store.ts

export type ShippingConditionType =
    | "standard"
    | "location"
    | "price_less_than"
    | "price_greater_than"
    | "quantity_less_than"
    | "quantity_greater_than";

export interface ShippingOption {
    id: string;
    name: string;
    fee: number;
    description?: string;
    conditionType?: ShippingConditionType;
    threshold?: number;
    isActive: boolean;
    sortOrder?: number;
}

export interface LineAdminUser {
    id: string;
    name: string;
    userId: string;
}

export interface PickupOption {
    id: string;
    label: string;
    detail?: string;
    isActive: boolean;
    sortOrder?: number;
}

export interface StoreSettings {
    id: string;
    storeName: string;
    storePhone: string;
    storeEmail: string;
    storeAddress: string;
    storeLogoUrl?: string;
    storeMapUrl?: string;

    // Payment info
    bankName: string;
    bankAccountName: string;
    bankAccountNumber: string;
    promptPayQrUrl?: string;
    promptPayId?: string;
    promptPayAccountName?: string;
    enableBankTransfer: boolean;
    enablePromptPay: boolean;
    enableCOD: boolean;

    // Slip verification
    enableSlipVerify?: boolean;
    slipokBranchId?: string;
    slipokApiKey?: string;

    // Gateways
    enableStripe?: boolean;
    stripePublishableKey?: string;
    stripeSecretKey?: string;

    enableOmise?: boolean;
    omisePublicKey?: string;
    omiseSecretKey?: string;

    // Shipping
    shippingFee: number;
    freeShippingThreshold?: number;
    shippingOptions?: ShippingOption[];
    pickupOptions?: PickupOption[];

    // Notifications
    lineChannelAccessToken?: string;
    lineAdminUserId?: string;
    lineAdminUsers?: LineAdminUser[];
    lineAdminGroupId?: string;
    lineNotifyAdminNewOrder?: boolean;
    lineNotifyAdminOrder?: boolean;
    lineNotifyAdminPayment?: boolean;
    lineNotifyAdminCancelled?: boolean;
    lineNotifyCustomerOrderSuccess?: boolean;
    lineNotifyCustomerPaymentConfirmed?: boolean;
    lineNotifyCustomerShipped?: boolean;
    lineNotifyCustomerCancelled?: boolean;

    updatedAt?: unknown;
}
