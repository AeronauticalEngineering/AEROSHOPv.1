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

export async function deductOrderStock(
  db: Firestore,
  order: Record<string, unknown>,
  orderId?: string
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
              return { ...v, stock: Math.max(0, Number(v.stock || 0) - action.quantity) };
            }
            return v;
          });
          updateData.variants = newVariants;
        } else {
          const currentStock = typeof updateData.stock === "number" ? updateData.stock : Number(data.stock || 0);
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
  // Only restore if stock was marked as deducted or if stockRestored is not true
  if (order.stockRestored === true) {
    console.log(`Stock already restored for order ${targetOrderId}`);
    return true;
  }

  const actions = extractStockActions(order);
  if (actions.length === 0) return true;

  try {
    await db.runTransaction(async (transaction) => {
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
