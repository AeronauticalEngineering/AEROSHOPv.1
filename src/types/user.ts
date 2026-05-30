// src/types/user.ts
import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'employee' | 'customer';

export interface UserProfile {
    id: string; // Document ID
    uid?: string; // Firebase Auth UID (often same as id)
    email?: string;
    displayName?: string;
    name?: string;
    role: UserRole;
    phone?: string;
    lineId?: string;
    pictureUrl?: string; // from LINE
    photoURL?: string; // from Firebase Auth
    address?: string; // For shipping
    points?: number; // Loyalty points
    createdAt?: Timestamp | Date;
    updatedAt?: Timestamp | Date;
    lastLogin?: Timestamp | Date;
}
