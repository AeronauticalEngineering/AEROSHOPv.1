import { Timestamp } from 'firebase/firestore';
import { ProductBundleItem, SelectedProductAddOn } from './product';

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'returned';
export type OrderItemStatus = 'processing' | 'ready' | 'received' | 'shipped' | 'completed' | 'cancelled' | 'returned';

export interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    finalPrice?: number;
    variantInfo?: string | null;
    addOns?: SelectedProductAddOn[];
    bundleItems?: ProductBundleItem[];
    imageUrl?: string;
    status?: OrderItemStatus;
    pickupOptionId?: string | null;
    pickupLabel?: string | null;
    pickupDetail?: string | null;
    issueReason?: string;
    issueReportedAt?: string;
    issueReportedByCustomer?: boolean;
    issueAdminReply?: string;
    issueAdminRepliedAt?: string;
}

export interface Order {
    id: string;
    orderNo?: string;
    invoiceNumber?: number;
    userId: string;
    lineId?: string | null;
    lineDisplayName?: string | null;
    linename?: string | null;
    customerName: string; // Snapshot name at time of order
    customerPhone: string;
    customerCitizenId?: string | null;
    items: OrderItem[];
    totalAmount: number;
    deliveryFee?: number;
    shippingOptionId?: string | null;
    shippingOptionName?: string | null;
    status: OrderStatus;
    shippingAddress?: string;
    slipUrl?: string; // For bank transfer proof
    trackingNumber?: string;
    cancelReason?: string;
    refundChannel?: string;
    returnReason?: string;
    paymentDetail?: string;
    paymentStatus?: string | null;
    shippingDetail?: string;
    completionDetail?: string;
    createdAt: Timestamp | Date;
    updatedAt: Timestamp | Date;
    customerId?: string;
}
