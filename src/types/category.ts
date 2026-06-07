import { Timestamp } from "firebase/firestore";

export interface ProductCategory {
    id: string;
    name: string;
    noticeTitle?: string;
    noticeText?: string;
    noticeImageBase64?: string;
    noticeImageUrl?: string;
    noticeImageName?: string;
    isActive: boolean;
    sortOrder?: number;
    createdAt?: Timestamp | Date;
    updatedAt?: Timestamp | Date;
}
