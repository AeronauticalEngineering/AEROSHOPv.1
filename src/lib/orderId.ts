export type OrderIdSource = {
    id?: string | null;
    orderNo?: string | null;
} | string | null | undefined;

export const getOrderIdValue = (source: OrderIdSource, legacyLength = 12) => {
    const raw = typeof source === "string" ? source : source?.orderNo || source?.id || "";
    if (!raw) return "-";
    if (/^INV\d+$/i.test(raw)) return raw.toUpperCase();
    return raw.slice(0, legacyLength).toUpperCase();
};

export const formatOrderId = (source: OrderIdSource, legacyLength = 12) => {
    const value = getOrderIdValue(source, legacyLength);
    return value === "-" ? value : `#${value}`;
};
