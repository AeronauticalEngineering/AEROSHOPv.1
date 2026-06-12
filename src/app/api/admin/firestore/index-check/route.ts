import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type IndexCheck = {
  id: string;
  title: string;
  source: string;
  collection: string;
  fields: string[];
  run: (db: admin.firestore.Firestore) => Promise<unknown>;
};

const checks: IndexCheck[] = [
  {
    id: "products-active-updated",
    title: "Products: active + updatedAt",
    source: "หน้าร้าน สินค้าทั้งหมด / โหลดเพิ่มเติม",
    collection: "products",
    fields: ["isActive ASC", "updatedAt DESC"],
    run: (db) => db.collection("products")
      .where("isActive", "==", true)
      .orderBy("updatedAt", "desc")
      .limit(1)
      .get()
  },
  {
    id: "products-active-category-updated",
    title: "Products: active + category + updatedAt",
    source: "หน้าร้าน กรองหมวดหมู่ / โหลดเพิ่มเติม",
    collection: "products",
    fields: ["isActive ASC", "category ASC", "updatedAt DESC"],
    run: (db) => db.collection("products")
      .where("isActive", "==", true)
      .where("category", "==", "__index_check__")
      .orderBy("updatedAt", "desc")
      .limit(1)
      .get()
  },
  {
    id: "orders-customer-created",
    title: "Orders: customerId + createdAt",
    source: "หน้าลูกค้า รายการคำสั่งซื้อของฉัน",
    collection: "orders",
    fields: ["customerId ASC", "createdAt DESC"],
    run: (db) => db.collection("orders")
      .where("customerId", "==", "__index_check__")
      .orderBy("createdAt", "desc")
      .limit(1)
      .get()
  },
  {
    id: "orders-customer-status",
    title: "Orders: customerId + status",
    source: "แจ้งเตือนหน้าร้าน ออเดอร์รอชำระ",
    collection: "orders",
    fields: ["customerId ASC", "status ASC"],
    run: (db) => db.collection("orders")
      .where("customerId", "==", "__index_check__")
      .where("status", "==", "pending")
      .limit(1)
      .get()
  },
  {
    id: "promotions-active-created",
    title: "Promotions: active + createdAt",
    source: "โปรโมชั่นหน้าร้าน / checkout",
    collection: "promotions",
    fields: ["isActive ASC", "createdAt DESC"],
    run: (db) => db.collection("promotions")
      .where("isActive", "==", true)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get()
  },
  {
    id: "categories-sort-name",
    title: "Categories: sortOrder + name",
    source: "หมวดหมู่สินค้า",
    collection: "categories",
    fields: ["sortOrder ASC", "name ASC"],
    run: (db) => db.collection("categories")
      .orderBy("sortOrder", "asc")
      .orderBy("name", "asc")
      .limit(1)
      .get()
  }
];

function extractCreateIndexUrl(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const match = message.match(/https:\/\/console\.firebase\.google\.com[^\s)]+/);
  return match ? match[0] : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown error");
}

export async function GET() {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 500 });
    }

    const db = admin.firestore();
    const results = await Promise.all(checks.map(async (check) => {
      try {
        await check.run(db);
        return {
          id: check.id,
          title: check.title,
          source: check.source,
          collection: check.collection,
          fields: check.fields,
          status: "ready",
          createUrl: null,
          error: null
        };
      } catch (error) {
        const createUrl = extractCreateIndexUrl(error);
        return {
          id: check.id,
          title: check.title,
          source: check.source,
          collection: check.collection,
          fields: check.fields,
          status: createUrl ? "missing" : "error",
          createUrl,
          error: getErrorMessage(error)
        };
      }
    }));

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      results
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
