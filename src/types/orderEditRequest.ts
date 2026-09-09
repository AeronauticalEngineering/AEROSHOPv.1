import { Timestamp } from 'firebase/firestore';

export type OrderEditRequestType = 'addon' | 'item' | 'other';
export type OrderEditRequestStatus = 'pending' | 'completed' | 'rejected';

export interface OrderEditRequest {
    id: string;
    orderId: string;
    orderNo?: string;
    customerId?: string;
    userId?: string;
    lineId?: string | null;
    customerName?: string;
    customerPhone?: string;
    requestType: OrderEditRequestType; // 'addon' | 'item' | 'other'
    itemName?: string;                 // Name of item customer wants to modify
    details: string;                   // Requested modifications (e.g. บริการเสริม, สลักชื่อ, ตัวเลือก)
    reason: string;                    // Reason for modification
    status: OrderEditRequestStatus;    // 'pending' | 'completed' | 'rejected'
    adminNote?: string | null;         // Admin notes / rejection reason
    createdAt: Timestamp | Date | any;
    reviewedAt?: Timestamp | Date | any;
    reviewedBy?: string | null;
}
