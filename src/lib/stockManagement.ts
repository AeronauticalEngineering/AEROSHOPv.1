import type { Firestore, DocumentSnapshot } from "firebase-admin/firestore";

interface StockAction {
  productId: string;
  variantId?: string;
  quantity: number;
}

function extractStockActions(order: Record<string, unknown>): StockAction[] {
  const items = Array.isArray(order.items) ? order.items : [];
  const actions: StockAction[] = [];

  for (const item of items) {
    const itemQuantity = Number(item.quantity) || 1;
    if (item.bundleItems && Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
      for (const bundleItem of item.bundleItems) {
        if (!bundleItem.productId) continue;
        if (typeof bundleItem.variantId === "string" && bundleItem.variantId.startsWith("custom-")) continue;

        actions.push({
          productId: bundleItem.productId,
          variantId: typeof bundleItem.variantId === "string" && bundleItem.variantId ? bundleItem.variantId : undefined,
          quantity: itemQuantity * (Number(bundleItem.quantity) || 1)
        });
      }
    } else {
      if (!item.productId) continue;
      if (typeof item.variantId === "string" && item.variantId.startsWith("custom-")) continue;

      actions.push({
        productId: item.productId,
        variantId: typeof item.variantId === "string" && item.variantId ? item.variantId : undefined,
        quantity: itemQuantity
      });
    }
  }

  return actions;
}

export interface StockCheckResult {
  available: boolean;
  insufficientItems: string[];
}

export async function checkOrderStockAvailable(
  db: Firestore,
  order: Record<string, unknown>
): Promise<StockCheckResult> {
  if (order.stockDeducted === true) {
    return { available: true, insufficientItems: [] };
  }

  const actions = extractStockActions(order);
  if (actions.length === 0) {
    return { available: true, insufficientItems: [] };
  }

  const productIdsToRead = Array.from(new Set(actions.map((a) => a.productId)));
  const productRefs = productIdsToRead.map((id) => db.doc(`products/${id}`));
  const productSnaps = await db.getAll(...productRefs);
  const productMap = new Map<string, DocumentSnapshot>();
  productSnaps.forEach((snap) => {
    if (snap.exists) productMap.set(snap.id, snap);
  });

  // Aggregate needed quantities per productId + variantId
  const requiredMap = new Map<string, { productId: string; variantId?: string; quantity: number }>();
  for (const action of actions) {
    const key = `${action.productId}::${action.variantId || ""}`;
    const current = requiredMap.get(key) || {
      productId: action.productId,
      variantId: action.variantId,
      quantity: 0
    };
    current.quantity += action.quantity;
    requiredMap.set(key, current);
  }

  const insufficientItems: string[] = [];

  for (const req of requiredMap.values()) {
    const snap = productMap.get(req.productId);
    if (!snap) {
      insufficientItems.push(req.productId);
      continue;
    }
    const data = snap.data() || {};
    const productName = String(data.name || req.productId);

    if (req.variantId) {
      const variants = (data.variants || []) as Array<Record<string, unknown>>;
      const matched = variants.find((v) => v.id === req.variantId);
      const vStock = Number(matched?.stock || 0);
      if (!matched || vStock < req.quantity) {
        const variantLabel = matched?.name ? ` (${String(matched.name)})` : "";
        insufficientItems.push(`${productName}${variantLabel}`);
      }
    } else {
      const currentStock = Number(data.stock || 0);
      if (currentStock < req.quantity) {
        insufficientItems.push(productName);
      }
    }
  }

  return {
    available: insufficientItems.length === 0,
    insufficientItems
  };
}

export async function deductOrderStock(
  db: Firestore,
  order: Record<string, unknown>,
  orderId?: string,
  options?: { strict?: boolean }
): Promise<boolean> {
  const targetOrderId = String(orderId || order.orderId || order.id || "");
  if (order.stockDeducted === true) {
    console.log(`Stock already deducted for order ${targetOrderId}`);
    return true;
  }

  const actions = extractStockActions(order);
  if (actions.length === 0) return true;

  try {
    await db.runTransaction(async (transaction) => {
      let freshOrderData = order;
      if (targetOrderId) {
        const orderSnap = await transaction.get(db.doc(`orders/${targetOrderId}`));
        if (orderSnap.exists) {
          freshOrderData = orderSnap.data() || order;
          if (freshOrderData.stockDeducted === true) {
            return;
          }
        }
      }

      const productIdsToRead = Array.from(new Set(actions.map(a => a.productId)));
      const productRefs = productIdsToRead.map(id => db.doc(`products/${id}`));
      const productSnaps = await transaction.getAll(...productRefs);
      const productMap = new Map<string, DocumentSnapshot>();
      productSnaps.forEach(snap => {
        if (snap.exists) productMap.set(snap.id, snap);
      });

      const updatesByProduct = new Map<string, Record<string, unknown>>();

      for (const action of actions) {
        const snap = productMap.get(action.productId);
        if (!snap) {
          if (options?.strict) {
            throw new Error(`OUT_OF_STOCK:${action.productId}`);
          }
          continue;
        }

        const data = snap.data() || {};
        const updateData = updatesByProduct.get(action.productId) || {};

        if (action.variantId) {
          const variants = (updateData.variants || data.variants || []) as Array<Record<string, unknown>>;
          const targetVariant = variants.find((v) => v.id === action.variantId);
          const availableStock = Number(targetVariant?.stock || 0);
          if (options?.strict && availableStock < action.quantity) {
            throw new Error(`OUT_OF_STOCK:${String(data.name || action.productId)}`);
          }
          const newVariants = variants.map((v) => {
            if (v.id === action.variantId) {
              return { ...v, stock: Math.max(0, Number(v.stock || 0) - action.quantity) };
            }
            return v;
          });
          updateData.variants = newVariants;
        } else {
          const currentStock = typeof updateData.stock === "number" ? updateData.stock : Number(data.stock || 0);
          if (options?.strict && currentStock < action.quantity) {
            throw new Error(`OUT_OF_STOCK:${String(data.name || action.productId)}`);
          }
          updateData.stock = Math.max(0, currentStock - action.quantity);
        }

        updatesByProduct.set(action.productId, updateData);
      }

      for (const [productId, updateData] of updatesByProduct.entries()) {
        transaction.update(db.doc(`products/${productId}`), updateData);
      }

      if (targetOrderId) {
        transaction.set(db.doc(`orders/${targetOrderId}`), {
          stockDeducted: true,
          stockRestored: false
        }, { merge: true });
      }
    });

    console.log(`Stock successfully deducted for order ${targetOrderId}`);
    return true;
  } catch (error) {
    console.error(`Error deducting stock for order ${targetOrderId}:`, error);
    return false;
  }
}

export async function restoreOrderStock(
  db: Firestore,
  order: Record<string, unknown>,
  orderId?: string
): Promise<boolean> {
  const targetOrderId = String(orderId || order.orderId || order.id || "");
  // Only restore if stock was marked as deducted and not already restored
  if (order.stockDeducted !== true) {
    console.log(`Stock was never deducted for order ${targetOrderId}, skipping restore`);
    return true;
  }
  if (order.stockRestored === true) {
    console.log(`Stock already restored for order ${targetOrderId}`);
    return true;
  }

  const actions = extractStockActions(order);
  if (actions.length === 0) return true;

  try {
    await db.runTransaction(async (transaction) => {
      if (targetOrderId) {
        const orderSnap = await transaction.get(db.doc(`orders/${targetOrderId}`));
        if (orderSnap.exists) {
          const freshOrder = orderSnap.data() || {};
          if (freshOrder.stockDeducted !== true || freshOrder.stockRestored === true) {
            return;
          }
        }
      }

      const productIdsToRead = Array.from(new Set(actions.map(a => a.productId)));
      const productRefs = productIdsToRead.map(id => db.doc(`products/${id}`));
      const productSnaps = await transaction.getAll(...productRefs);
      const productMap = new Map<string, DocumentSnapshot>();
      productSnaps.forEach(snap => {
        if (snap.exists) productMap.set(snap.id, snap);
      });

      const updatesByProduct = new Map<string, Record<string, unknown>>();

      for (const action of actions) {
        const snap = productMap.get(action.productId);
        if (!snap) continue;

        const data = snap.data() || {};
        const updateData = updatesByProduct.get(action.productId) || {};

        if (action.variantId) {
          const variants = (updateData.variants || data.variants || []) as Array<Record<string, unknown>>;
          const newVariants = variants.map((v) => {
            if (v.id === action.variantId) {
              return { ...v, stock: Math.max(0, Number(v.stock || 0) + action.quantity) };
            }
            return v;
          });
          updateData.variants = newVariants;
        } else {
          const currentStock = typeof updateData.stock === "number" ? updateData.stock : Number(data.stock || 0);
          updateData.stock = Math.max(0, currentStock + action.quantity);
        }

        updatesByProduct.set(action.productId, updateData);
      }

      for (const [productId, updateData] of updatesByProduct.entries()) {
        transaction.update(db.doc(`products/${productId}`), updateData);
      }

      if (targetOrderId) {
        transaction.set(db.doc(`orders/${targetOrderId}`), {
          stockDeducted: false,
          stockRestored: true
        }, { merge: true });
      }
    });

    console.log(`Stock successfully restored for order ${targetOrderId}`);
    return true;
  } catch (error) {
    console.error(`Error restoring stock for order ${targetOrderId}:`, error);
    return false;
  }
}

/**
 * Releases stock that was previously locked by unpaid 'pending' orders
 * so that only paid orders deduct stock ("ใครจ่ายก่อนได้ก่อน ถ้าไม่จ่ายของยังอยู่ไม่ตัด").
 */
export async function releaseUnpaidPendingOrdersStock(
  db: Firestore
): Promise<{ releasedOrders: string[] }> {
  const releasedOrders: string[] = [];
  try {
    const pendingSnap = await db.collection("orders").where("status", "==", "pending").get();
    for (const docSnap of pendingSnap.docs) {
      const data = docSnap.data() || {};
      const isPaid =
        data.paymentStatus === "verified" ||
        data.paymentStatus === "paid";

      if (!isPaid && data.stockDeducted === true && data.stockRestored !== true) {
        const restored = await restoreOrderStock(db, data, docSnap.id);
        if (restored) {
          releasedOrders.push(docSnap.id);
        }
      }
    }
  } catch (error) {
    console.error("Error releasing unpaid pending orders stock:", error);
  }
  return { releasedOrders };
}
