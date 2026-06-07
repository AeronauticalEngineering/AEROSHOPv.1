import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product } from "@/types/product";

type ProductImageDoc = {
    base64?: string;
};

export type ProductBase64Image = {
    id: string;
    base64: string;
};

export const getPrimaryProductImage = (product: Product, base64Images: string[] = []) => {
    return product.imageUrls?.[0] || product.imageUrl || base64Images[0] || "";
};

export const fetchProductBase64ImageItems = async (product: Pick<Product, "imageBase64Ids">) => {
    const ids = product.imageBase64Ids?.filter(Boolean) || [];
    if (ids.length === 0) return [];

    const snapshots = await Promise.all(
        ids.map((id) => getDoc(doc(db, "product_images", id)))
    );

    return snapshots
        .map((snapshot) => {
            if (!snapshot.exists()) return null;
            const base64 = (snapshot.data() as ProductImageDoc).base64 || "";
            return base64 ? { id: snapshot.id, base64 } : null;
        })
        .filter((image): image is ProductBase64Image => Boolean(image));
};

export const fetchProductBase64Images = async (product: Pick<Product, "imageBase64Ids">) => {
    const images = await fetchProductBase64ImageItems(product);
    return images.map((image) => image.base64);
};
