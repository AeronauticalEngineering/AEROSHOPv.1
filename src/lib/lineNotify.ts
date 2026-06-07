type OrderStatusNotify = "paid" | "shipped" | "completed" | "cancelled" | "returned";
type LineMessage = Record<string, unknown>;

const COLORS = {
  ink: "#0f172a",
  muted: "#64748b",
  soft: "#94a3b8",
  line: "#e2e8f0",
  panel: "#f8fafc",
  success: "#16a34a",
  info: "#2563eb",
  warning: "#f59e0b",
  danger: "#dc2626",
  orange: "#ea580c",
  white: "#ffffff"
};

const statusMeta: Record<OrderStatusNotify, { title: string; color: string; message: string }> = {
  paid: {
    title: "ยืนยันการชำระเงิน",
    color: COLORS.success,
    message: "เราได้รับการชำระเงินเรียบร้อยแล้ว"
  },
  shipped: {
    title: "จัดส่งสินค้าแล้ว",
    color: COLORS.info,
    message: "คำสั่งซื้อของคุณถูกจัดส่งแล้ว"
  },
  completed: {
    title: "คำสั่งซื้อสำเร็จ",
    color: "#0f766e",
    message: "ขอบคุณที่อุดหนุนร้านของเรา"
  },
  cancelled: {
    title: "ยกเลิกคำสั่งซื้อ",
    color: COLORS.danger,
    message: "คำสั่งซื้อของคุณถูกยกเลิก"
  },
  returned: {
    title: "คืนสินค้า",
    color: COLORS.orange,
    message: "คำสั่งซื้อถูกบันทึกเป็นคืนสินค้า"
  }
};

const money = (value?: number) => (typeof value === "number" ? `฿${value.toLocaleString("th-TH")}` : "-");
const orderRef = (orderId?: string) => {
  if (!orderId) return "-";
  const displayValue = /^INV\d+$/i.test(orderId) ? orderId : orderId.slice(0, 12);
  return `#${displayValue.toUpperCase()}`;
};

function lineText(value: string, options: Record<string, unknown> = {}) {
  return {
    type: "text",
    text: value || "-",
    size: "sm",
    color: COLORS.ink,
    wrap: true,
    ...options
  };
}

function detailRow(label: string, value: string, options?: { strong?: boolean; valueColor?: string }) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "md",
    contents: [
      lineText(label, { size: "xs", color: COLORS.muted, flex: 4 }),
      lineText(value, {
        size: "xs",
        color: options?.valueColor || COLORS.ink,
        align: "end",
        weight: options?.strong ? "bold" : "regular",
        flex: 6
      })
    ]
  };
}

function detailPanel(rows: Record<string, unknown>[]) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    paddingAll: "14px",
    cornerRadius: "12px",
    backgroundColor: COLORS.panel,
    contents: rows
  };
}

function primaryButton(label: string, uri: string) {
  return {
    type: "button",
    action: { type: "uri", label, uri },
    style: "primary",
    color: COLORS.ink,
    height: "sm"
  };
}

function professionalBubble(params: {
  label: string;
  title: string;
  description?: string;
  color: string;
  body: Record<string, unknown>[];
  footer?: Record<string, unknown>[];
}) {
  return {
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
            lineText(params.label, { size: "xxs", color: params.color, weight: "bold" }),
            lineText(params.title, { size: "xl", color: COLORS.ink, weight: "bold" }),
            ...(params.description ? [lineText(params.description, { size: "xs", color: COLORS.muted, margin: "sm" })] : [])
          ]
        },
        { type: "separator", color: COLORS.line, margin: "lg" },
        ...params.body
      ]
    },
    ...(params.footer?.length
      ? {
        footer: {
          type: "box",
          layout: "vertical",
          paddingAll: "20px",
          paddingTop: "0px",
          spacing: "sm",
          contents: params.footer
        }
      }
      : {})
  };
}

export function buildOrderStatusFlex(params: {
  status: OrderStatusNotify;
  orderId?: string;
  amount?: number;
  trackingNumber?: string | null;
  detail?: string | null;
  liffId?: string | null;
}) {
  const meta = statusMeta[params.status];
  const rows: Record<string, unknown>[] = [
    detailRow("เลขออเดอร์", orderRef(params.orderId), { strong: true }),
    detailRow("สถานะ", meta.title, { strong: true, valueColor: meta.color }),
    detailRow("ยอดรวม", money(params.amount), { strong: true })
  ];

  if (params.status === "shipped") {
    rows.push(detailRow("เลขพัสดุ", params.trackingNumber || "-"));
  }

  if (params.detail) {
    rows.push({ type: "separator", color: COLORS.line, margin: "sm" });
    rows.push(detailRow("รายละเอียด", params.detail));
  }

  return {
    type: "flex",
    altText: `${meta.title} ${orderRef(params.orderId)}`,
    contents: professionalBubble({
      label: "อัปเดตสถานะ",
      title: meta.title,
      description: meta.message,
      color: meta.color,
      body: [detailPanel(rows)],
      footer: params.liffId
        ? [primaryButton("ดูคำสั่งซื้อ", `https://liff.line.me/${params.liffId}/myorder/${params.orderId ?? ""}`)]
        : []
    })
  } as LineMessage;
}

export function buildAdminPaymentFlex(params: {
  orderId?: string;
  amount?: number;
  customerName?: string;
  paymentMethod?: string;
}) {
  return {
    type: "flex",
    altText: `ชำระเงินแล้ว ${orderRef(params.orderId)}`,
    contents: professionalBubble({
      label: "ชำระแล้ว",
      title: "ลูกค้าชำระเงินแล้ว",
      description: "ตรวจสอบรายละเอียดและดำเนินการออเดอร์ต่อได้ทันที",
      color: COLORS.success,
      body: [
        detailPanel([
          detailRow("เลขออเดอร์", orderRef(params.orderId), { strong: true }),
          detailRow("ยอดชำระ", money(params.amount), { strong: true }),
          detailRow("ลูกค้า", params.customerName || "-"),
          detailRow("ช่องทาง", params.paymentMethod || "-")
        ])
      ]
    })
  } as LineMessage;
}

export function buildAdminNewOrderFlex(params: {
  orderId?: string;
  amount?: number;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  items?: { name: string; quantity: number }[];
  liffId?: string | null;
}) {
  const items = params.items || [];
  const itemRows: Record<string, unknown>[] = items.slice(0, 6).map((item, index) =>
    detailRow(`รายการ ${index + 1}`, `${item.name} x${item.quantity}`)
  );

  if (items.length > 6) {
    itemRows.push(lineText(`และสินค้าอื่นอีก ${items.length - 6} รายการ`, {
      size: "xxs",
      color: COLORS.soft,
      align: "center"
    }) as Record<string, unknown>);
  }

  return {
    type: "flex",
    altText: `ออเดอร์ใหม่ ${orderRef(params.orderId)}`,
    contents: professionalBubble({
      label: "ออเดอร์ใหม่",
      title: "มีคำสั่งซื้อใหม่",
      description: "ตรวจสอบรายละเอียดและติดตามการชำระเงิน",
      color: COLORS.ink,
      body: [
        detailPanel([
          detailRow("เลขออเดอร์", orderRef(params.orderId), { strong: true }),
          detailRow("ยอดรวม", money(params.amount), { strong: true }),
          detailRow("ลูกค้า", params.customerName || "-"),
          detailRow("โทร", params.customerPhone || "-"),
          detailRow("ชำระเงิน", params.paymentMethod || "-"),
          detailRow("จำนวนรายการ", `${items.length}`)
        ]),
        ...(itemRows.length > 0 ? [{ type: "separator", color: COLORS.line, margin: "lg" }, detailPanel(itemRows)] : [])
      ],
      footer: params.liffId && params.orderId
        ? [primaryButton("ดูคำสั่งซื้อ", `https://liff.line.me/${params.liffId}/myorder/${params.orderId}`)]
        : []
    })
  } as LineMessage;
}

export function buildAdminIssueFlex(params: {
  orderId?: string;
  amount?: number;
  customerName?: string;
  customerPhone?: string;
  itemName?: string;
  issueStatus?: "cancelled" | "returned";
  issueReason?: string;
  liffId?: string | null;
}) {
  const isReturn = params.issueStatus === "returned";
  const title = isReturn ? "ลูกค้าแจ้งขอคืนสินค้า" : "ลูกค้าแจ้งขอยกเลิกสินค้า";
  const statusLabel = isReturn ? "คืนสินค้า" : "ยกเลิกสินค้า";

  return {
    type: "flex",
    altText: `ลูกค้าแจ้งปัญหา ${orderRef(params.orderId)}`,
    contents: professionalBubble({
      label: "แจ้งปัญหาจากลูกค้า",
      title,
      description: "ตรวจสอบรายละเอียดและตอบกลับลูกค้าในหน้าออเดอร์",
      color: isReturn ? COLORS.orange : COLORS.danger,
      body: [
        detailPanel([
          detailRow("เลขออเดอร์", orderRef(params.orderId), { strong: true }),
          detailRow("สถานะที่แจ้ง", statusLabel, {
            strong: true,
            valueColor: isReturn ? COLORS.orange : COLORS.danger
          }),
          detailRow("สินค้า", params.itemName || "-"),
          detailRow("ลูกค้า", params.customerName || "-"),
          detailRow("โทร", params.customerPhone || "-"),
          detailRow("ยอดรวม", money(params.amount), { strong: true }),
          { type: "separator", color: COLORS.line, margin: "sm" },
          detailRow("เหตุผล", params.issueReason || "-")
        ])
      ],
      footer: params.liffId && params.orderId
        ? [primaryButton("เปิดออเดอร์ลูกค้า", `https://liff.line.me/${params.liffId}/myorder/${params.orderId}`)]
        : []
    })
  } as LineMessage;
}

export async function sendLineMessage(params: {
  token: string;
  targets: string[];
  message: LineMessage;
}) {
  const { token, targets, message } = params;
  if (!token || targets.length === 0) return;

  const normalizedTargets = targets
    .flatMap((raw) => String(raw || "").split(/[,\s]+/g))
    .map((v) => v.trim())
    .filter(Boolean);

  // LINE push/multicast IDs are typically U/C/R + 32 hex chars.
  const idPattern = /^[UCR][0-9a-fA-F]{32}$/;
  const uniqueTargets = [...new Set(normalizedTargets)];
  const validTargets = uniqueTargets.filter((id) => idPattern.test(id));
  const invalidTargets = uniqueTargets.filter((id) => !idPattern.test(id));
  const maskId = (id: string) => `${id.slice(0, 4)}...${id.slice(-4)}`;

  if (invalidTargets.length > 0) {
    console.warn("line_notify:invalid_targets", {
      invalidCount: invalidTargets.length,
      sample: invalidTargets.slice(0, 3)
    });
  }

  if (validTargets.length === 0) {
    console.warn("line_notify:no_valid_target");
    return;
  }

  const userTargets = validTargets.filter((id) => id.startsWith("U"));
  const groupRoomTargets = validTargets.filter((id) => id.startsWith("C") || id.startsWith("R"));
  let sentCount = 0;
  const failedTargets: string[] = [];

  const postJson = async (url: string, body: Record<string, unknown>) => {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return resp;
  };

  const pushToOne = async (target: string) => {
    const resp = await postJson("https://api.line.me/v2/bot/message/push", {
      to: target,
      messages: [message]
    });
    if (resp.ok) {
      sentCount += 1;
      return;
    }

    const text = await resp.text().catch(() => "");
    failedTargets.push(target);
    console.error("line_notify:send_failed", {
      status: resp.status,
      body: text,
      target: maskId(target),
      targetType: target[0] === "U" ? "user" : target[0] === "C" ? "group" : "room"
    });
  };

  if (userTargets.length === 1) {
    await pushToOne(userTargets[0]);
  } else if (userTargets.length > 1) {
    const resp = await postJson("https://api.line.me/v2/bot/message/multicast", {
      to: userTargets,
      messages: [message]
    });
    if (resp.ok) {
      sentCount += userTargets.length;
    } else {
      const text = await resp.text().catch(() => "");
      console.error("line_notify:multicast_failed", {
        status: resp.status,
        body: text,
        targetCount: userTargets.length
      });
      for (const target of userTargets) {
        await pushToOne(target);
      }
    }
  }

  for (const target of groupRoomTargets) {
    await pushToOne(target);
  }

  if (failedTargets.length > 0) {
    console.warn("line_notify:partial_failed", {
      sentCount,
      failedCount: failedTargets.length,
      failedSample: failedTargets.slice(0, 3).map(maskId)
    });
  }
}
