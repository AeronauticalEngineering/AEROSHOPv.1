import { Timestamp } from 'firebase/firestore';

export type NameChangeType = 'order' | 'profile';
export type NameChangeStatus = 'pending' | 'approved' | 'rejected';

export interface NameChangeRequest {
    id: string;
    type: NameChangeType;            // 'order' or 'profile'
    targetId: string;                // orderId or customerId/userId
    orderNo?: string;                // e.g. ORD-12345678
    customerId?: string;
    userId?: string;
    lineId?: string | null;
    currentName: string;             // Name at time of request
    requestedName: string;           // Requested new name
    reason: string;                  // Customer reason
    status: NameChangeStatus;        // 'pending' | 'approved' | 'rejected'
    rejectReason?: string | null;    // If rejected
    createdAt: Timestamp | Date | any;
    reviewedAt?: Timestamp | Date | any;
    reviewedBy?: string | null;      // admin uid or email
}
