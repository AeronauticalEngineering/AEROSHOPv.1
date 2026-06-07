type FlexMessage = {
    type: "flex";
    altText: string;
    contents: Record<string, unknown>;
};

type ReceiptPayload = {
    orderId: string;
    liffId: string;
    orderData: unknown;
};

type SlipResultPayload = {
    orderId: string;
    liffId: string;
    verifyResult: Record<string, unknown>;
    orderContext: unknown;
};

type IssueReportPayload = {
    orderId: string;
    liffId: string;
    issueStatus: "cancelled" | "returned";
    issueReason: string;
    itemName?: string;
    customerName?: string;
};

type StatusTone = "success" | "warning" | "danger" | "info";

const COLORS = {
    ink: "#0f172a",
    muted: "#64748b",
    soft: "#94a3b8",
    line: "#e2e8f0",
    panel: "#f8fafc",
    success: "#16a34a",
    warning: "#f59e0b",
    danger: "#dc2626",
    info: "#2563eb",
    white: "#ffffff"
};

const toneColor: Record<StatusTone, string> = {
    success: COLORS.success,
    warning: COLORS.warning,
    danger: COLORS.danger,
    info: COLORS.info
};

const formatMoney = (value: unknown) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "-";
    return `฿${amount.toLocaleString("th-TH")}`;
};

const shortOrderId = (orderId: string, length = 10) => {
    const value = orderId || "";
    const displayValue = /^INV\d+$/i.test(value) ? value : value.slice(0, length);
    return `#${displayValue.toUpperCase()}`;
};
const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" ? value as Record<string, unknown> : {};

const text = (
    value: string,
    options: Record<string, unknown> = {}
) => ({
    type: "text",
    text: value || "-",
    size: "sm",
    color: COLORS.ink,
    wrap: true,
    ...options
});

const separator = (margin = "lg") => ({
    type: "separator",
    margin,
    color: COLORS.line
});

const infoRow = (label: string, value: string, strong = false) => ({
    type: "box",
    layout: "horizontal",
    spacing: "md",
    contents: [
        text(label, { size: "xs", color: COLORS.muted, flex: 4 }),
        text(value, {
            size: "xs",
            color: strong ? COLORS.ink : COLORS.muted,
            weight: strong ? "bold" : "regular",
            align: "end",
            flex: 6
        })
    ]
});

const primaryButton = (label: string, uri: string) => ({
    type: "button",
    action: {
        type: "uri",
        label,
        uri
    },
    style: "primary",
    color: COLORS.ink,
    height: "sm"
});

const secondaryButton = (label: string, uri: string) => ({
    type: "button",
    action: {
        type: "uri",
        label,
        uri
    },
    style: "secondary",
    height: "sm"
});

const buildBubble = ({
    label,
    title,
    description,
    tone,
    body,
    footer
}: {
    label: string;
    title: string;
    description?: string;
    tone: StatusTone;
    body: Record<string, unknown>[];
    footer: Record<string, unknown>[];
}) => ({
    type: "bubble",
    size: "mega",
    body: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        spacing: "md",
        contents: [
            {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                contents: [
                    text(label, {
                        size: "xxs",
                        color: toneColor[tone],
                        weight: "bold"
                    }),
                    text(title, {
                        size: "xl",
                        weight: "bold",
                        color: COLORS.ink
                    }),
                    ...(description ? [text(description, { size: "xs", color: COLORS.muted, margin: "sm" })] : [])
                ]
            },
            separator("lg"),
            ...body
        ]
    },
    footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        paddingTop: "0px",
        spacing: "sm",
        contents: footer
    }
});

export function buildSlipResultFlexMessage({
    orderId,
    liffId,
    verifyResult,
    orderContext
}: SlipResultPayload): FlexMessage {
    const verifyData = asRecord(verifyResult?.data);
    const context = asRecord(orderContext);
    const isVerified =
        verifyResult?.verifyStatus === "verified" ||
        verifyResult?.status === "verified" ||
        verifyResult?.success === true ||
        verifyData?.valid === true;
    const isManualCheck = verifyResult?.isManualCheck === true;

    const status = isManualCheck
        ? {
            label: "รอตรวจสอบ",
            title: "ได้รับสลิปแล้ว",
            description: "ทีมงานจะตรวจสอบการชำระเงินและอัปเดตสถานะให้อีกครั้ง",
            tone: "warning" as StatusTone
        }
        : isVerified
            ? {
                label: "ยืนยันแล้ว",
                title: "ชำระเงินสำเร็จ",
                description: "ระบบตรวจสอบการชำระเงินเรียบร้อยแล้ว",
                tone: "success" as StatusTone
            }
            : {
                label: "ไม่ผ่าน",
                title: "ตรวจสอบสลิปไม่สำเร็จ",
                description: "กรุณาตรวจสอบข้อมูลการโอนหรือส่งสลิปใหม่อีกครั้ง",
                tone: "danger" as StatusTone
            };

    const amount = verifyData?.amount ?? context?.totalAmount;
    const paidAt = verifyData?.transDate || verifyData?.transTime || "-";

    return {
        type: "flex",
        altText: `${status.title} ${shortOrderId(orderId, 8)}`,
        contents: buildBubble({
            label: status.label,
            title: status.title,
            description: status.description,
            tone: status.tone,
            body: [
                {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: COLORS.panel,
                    cornerRadius: "12px",
                    paddingAll: "14px",
                    spacing: "sm",
                    contents: [
                        infoRow("ยอดชำระ", formatMoney(amount), true),
                        infoRow("เลขออเดอร์", shortOrderId(orderId, 12), true),
                        infoRow("เวลาทำรายการ", String(paidAt))
                    ]
                }
            ],
            footer: [
                primaryButton("ดูรายละเอียดคำสั่งซื้อ", `https://liff.line.me/${liffId}/myorder/${orderId}`),
                secondaryButton("รายการคำสั่งซื้อ", `https://liff.line.me/${liffId}/myorder`)
            ]
        })
    };
}

export function buildIssueReportFlexMessage({
    orderId,
    liffId,
    issueStatus,
    issueReason,
    itemName,
    customerName
}: IssueReportPayload): FlexMessage {
    const isReturn = issueStatus === "returned";
    const title = isReturn ? "แจ้งขอคืนสินค้าแล้ว" : "แจ้งขอยกเลิกสินค้าแล้ว";
    const statusLabel = isReturn ? "คืนสินค้า" : "ยกเลิกสินค้า";

    return {
        type: "flex",
        altText: `${title} ${shortOrderId(orderId, 8)}`,
        contents: buildBubble({
            label: "แจ้งปัญหา",
            title,
            description: "ระบบบันทึกข้อมูลเรียบร้อยแล้ว แอดมินจะตรวจสอบและตอบกลับในคำสั่งซื้อ",
            tone: isReturn ? "warning" : "danger",
            body: [
                {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: COLORS.panel,
                    cornerRadius: "12px",
                    paddingAll: "14px",
                    spacing: "sm",
                    contents: [
                        infoRow("เลขออเดอร์", shortOrderId(orderId, 12), true),
                        infoRow("สถานะที่แจ้ง", statusLabel, true),
                        infoRow("สินค้า", itemName || "-"),
                        infoRow("ลูกค้า", customerName || "-"),
                        {
                            type: "box",
                            layout: "vertical",
                            spacing: "xs",
                            contents: [
                                text("เหตุผล", { size: "xs", color: COLORS.muted }),
                                text(issueReason || "-", { size: "xs", color: COLORS.ink })
                            ]
                        }
                    ]
                }
            ],
            footer: [
                primaryButton("ดูรายละเอียดคำสั่งซื้อ", `https://liff.line.me/${liffId}/myorder/${orderId}`),
                secondaryButton("รายการคำสั่งซื้อ", `https://liff.line.me/${liffId}/myorder`)
            ]
        })
    };
}

export function buildReceiptFlexMessage({
    orderId,
    liffId,
    orderData
}: ReceiptPayload): FlexMessage {
    const data = asRecord(orderData);
    const items = Array.isArray(data?.items) ? data.items.map(asRecord) : [];
    const visibleItems = items.slice(0, 5);
    const hiddenItemCount = Math.max(items.length - visibleItems.length, 0);

    const itemRows: Record<string, unknown>[] = visibleItems.map((item) => {
        const itemName = [item.productName, item.variantInfo ? `(${item.variantInfo})` : ""]
            .filter(Boolean)
            .join(" ");
        const lineTotal = Number(item.finalPrice ?? item.price ?? 0) * Number(item.quantity ?? 0);

        return {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            contents: [
                {
                    type: "box",
                    layout: "vertical",
                    flex: 7,
                    contents: [
                        text(itemName || "สินค้า", { size: "xs", weight: "bold" }),
                        text(`จำนวน ${item.quantity || 0}`, { size: "xxs", color: COLORS.soft, margin: "xs" })
                    ]
                },
                text(formatMoney(lineTotal), {
                    size: "xs",
                    weight: "bold",
                    align: "end",
                    flex: 3
                })
            ]
        };
    });

    if (hiddenItemCount > 0) {
        itemRows.push(text(`และสินค้าอื่นอีก ${hiddenItemCount} รายการ`, {
            size: "xxs",
            color: COLORS.soft,
            align: "center"
        }));
    }

    const paymentPending =
        data?.paymentStatus !== "paid" &&
        data?.paymentStatus !== "verified" &&
        data?.status !== "paid" &&
        data?.status !== "completed";

    const summaryRows = [
        infoRow("รวมสินค้า", formatMoney(data?.subTotal ?? 0)),
        infoRow("ค่าจัดส่ง", formatMoney(data?.deliveryFee ?? 0)),
        ...(Number(data?.totalDiscount || 0) > 0
            ? [infoRow("ส่วนลด", `-${formatMoney(data.totalDiscount)}`, true)]
            : []),
        separator("md"),
        infoRow("ยอดรวมทั้งหมด", formatMoney(data?.totalAmount ?? 0), true)
    ];

    return {
        type: "flex",
        altText: `ได้รับคำสั่งซื้อแล้ว ${shortOrderId(orderId, 8)}`,
        contents: buildBubble({
            label: paymentPending ? "รอชำระเงิน" : "รับออเดอร์แล้ว",
            title: "ได้รับคำสั่งซื้อแล้ว",
            description: `${shortOrderId(orderId, 12)} ขอบคุณสำหรับคำสั่งซื้อของคุณ`,
            tone: paymentPending ? "warning" : "success",
            body: [
                {
                    type: "box",
                    layout: "vertical",
                    backgroundColor: COLORS.panel,
                    cornerRadius: "12px",
                    paddingAll: "14px",
                    spacing: "sm",
                    contents: [
                        infoRow("ลูกค้า", String(data?.customerName || "-"), true),
                        infoRow("เบอร์โทร", String(data?.customerPhone || "-")),
                        infoRow("จัดส่ง", String(data?.shippingOptionName || "จัดส่งสินค้า")),
                        {
                            type: "box",
                            layout: "vertical",
                            spacing: "xs",
                            contents: [
                                text("ที่อยู่", { size: "xs", color: COLORS.muted }),
                                text(String(data?.shippingAddress || "ไม่ระบุ"), { size: "xs", color: COLORS.ink })
                            ]
                        }
                    ]
                },
                separator("lg"),
                {
                    type: "box",
                    layout: "vertical",
                    spacing: "sm",
                    contents: [
                        text("รายการสินค้า", { size: "sm", weight: "bold" }),
                        ...itemRows
                    ]
                },
                separator("lg"),
                {
                    type: "box",
                    layout: "vertical",
                    spacing: "sm",
                    contents: summaryRows
                }
            ],
            footer: [
                primaryButton(
                    paymentPending ? "ชำระเงิน / แจ้งสลิป" : "ดูรายละเอียดออเดอร์",
                    `https://liff.line.me/${liffId}/myorder/${orderId}`
                ),
                secondaryButton("คำสั่งซื้อของฉัน", `https://liff.line.me/${liffId}/myorder`)
            ]
        })
    };
}
