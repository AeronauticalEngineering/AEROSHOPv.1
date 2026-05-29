import { NextResponse } from "next/server";
import admin, { isFirebaseAdminReady } from "@/lib/firebaseAdmin";
import { GoogleAuth } from "google-auth-library";

export const runtime = "nodejs";

type FirebasePlan = "spark" | "blaze";

const SPARK_LIMITS = {
  storageBytes: 1 * 1024 * 1024 * 1024,
  reads24h: 50000,
  writes24h: 20000,
  deletes24h: 20000,
} as const;

const FIRESTORE_READ_METRIC = "firestore.googleapis.com/document/read_count";
const FIRESTORE_WRITE_METRIC = "firestore.googleapis.com/document/write_count";
const FIRESTORE_DELETE_METRIC = "firestore.googleapis.com/document/delete_count";
const STORAGE_METRIC_CANDIDATES = [
  "firestore.googleapis.com/storage/bytes_used",
  "firestore.googleapis.com/storage/byte_count",
  "firestore.googleapis.com/storage/total_bytes",
  "firestore.googleapis.com/database/storage_bytes",
];

function getPlanFromEnv(): FirebasePlan {
  return (process.env.FIREBASE_PLAN || "spark").toLowerCase() === "blaze"
    ? "blaze"
    : "spark";
}

function fallbackResponse(hint: string) {
  return {
    ok: true,
    mode: "firebase_plan_unavailable",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    plan: getPlanFromEnv(),
    permissionLimited: true,
    metrics: {
      storageBytes: null,
      reads24h: null,
      writes24h: null,
      deletes24h: null,
    },
    limits: {
      storageBytes: null,
      reads24h: null,
      writes24h: null,
      deletes24h: null,
    },
    percent: {
      storage: null,
      reads24h: null,
      writes24h: null,
      deletes24h: null,
    },
    storageMetricType: null,
    hint,
    updatedAt: new Date().toISOString(),
  };
}

function getProjectId() {
  const fromEnv = process.env.FIREBASE_PROJECT_ID;
  if (fromEnv) return fromEnv;

  const fromAdmin = admin.app().options.projectId;
  if (fromAdmin) return fromAdmin;

  throw new Error("Missing Firebase project id");
}

function toRfc3339(date: Date) {
  return date.toISOString();
}

function asNumber(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toPercent(used: number | null, limit: number | null) {
  if (used == null || limit == null || limit <= 0) return null;
  return Math.min(100, Number(((used / limit) * 100).toFixed(2)));
}

function getGoogleCredentialsFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    type: "service_account",
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
  };
}

async function getAccessToken() {
  const credentials = getGoogleCredentialsFromEnv();
  const auth = new GoogleAuth({
    credentials: credentials ?? undefined,
    projectId: credentials?.project_id,
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/monitoring.read",
      "https://www.googleapis.com/auth/cloud-billing.readonly",
    ],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === "string" ? token : token?.token;
  if (!accessToken) {
    throw new Error("Cannot acquire Google access token");
  }
  return accessToken;
}

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error || "Request failed");
  }
  return data;
}

async function detectPlan(projectId: string, accessToken: string): Promise<FirebasePlan> {
  const planFromEnv = (process.env.FIREBASE_PLAN || "").toLowerCase();
  if (planFromEnv === "spark" || planFromEnv === "blaze") {
    return planFromEnv;
  }

  try {
    const url = `https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/billingInfo`;
    const data = await fetchJson(url, accessToken);
    return data?.billingEnabled ? "blaze" : "spark";
  } catch {
    return "spark";
  }
}

function isPermissionDeniedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("permission") ||
    normalized.includes("insufficient authentication scopes") ||
    normalized.includes("permission_denied")
  );
}

async function queryTimeSeriesValue(
  projectId: string,
  accessToken: string,
  metricType: string,
  options: {
    durationHours: number;
    alignmentPeriodSeconds: number;
    aligner: "ALIGN_SUM" | "ALIGN_MEAN" | "ALIGN_MAX" | "ALIGN_NEXT_OLDER";
    reducer?: "REDUCE_SUM";
  }
) {
  const end = new Date();
  const start = new Date(end.getTime() - options.durationHours * 60 * 60 * 1000);
  const params = new URLSearchParams({
    filter: `metric.type="${metricType}"`,
    "interval.startTime": toRfc3339(start),
    "interval.endTime": toRfc3339(end),
    "aggregation.alignmentPeriod": `${options.alignmentPeriodSeconds}s`,
    "aggregation.perSeriesAligner": options.aligner,
    view: "FULL",
    pageSize: "1",
  });
  if (options.reducer) {
    params.set("aggregation.crossSeriesReducer", options.reducer);
  }

  const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${params.toString()}`;
  const data = await fetchJson(url, accessToken);
  const series = Array.isArray(data?.timeSeries) ? data.timeSeries : [];
  if (series.length === 0) return null;
  const points = Array.isArray(series[0]?.points) ? series[0].points : [];
  if (points.length === 0) return null;
  const value = points[0]?.value || {};
  return asNumber(value?.int64Value ?? value?.doubleValue);
}

async function queryMetricOrNull(
  projectId: string,
  accessToken: string,
  metricType: string,
  options: {
    durationHours: number;
    alignmentPeriodSeconds: number;
    aligner: "ALIGN_SUM" | "ALIGN_MEAN" | "ALIGN_MAX" | "ALIGN_NEXT_OLDER";
    reducer?: "REDUCE_SUM";
  }
) {
  try {
    const value = await queryTimeSeriesValue(projectId, accessToken, metricType, options);
    return { value, permissionDenied: false };
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return { value: null, permissionDenied: true };
    }
    throw error;
  }
}

async function queryStorageBytes(projectId: string, accessToken: string) {
  for (const metricType of STORAGE_METRIC_CANDIDATES) {
    try {
      const value = await queryTimeSeriesValue(projectId, accessToken, metricType, {
        durationHours: 48,
        alignmentPeriodSeconds: 3600,
        aligner: "ALIGN_MEAN",
        reducer: "REDUCE_SUM",
      });
      if (value != null) {
        return { metricType, value, permissionDenied: false };
      }
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        return { metricType: null, value: null, permissionDenied: true };
      }
    }
  }

  return { metricType: null, value: null, permissionDenied: false };
}

export async function GET() {
  try {
    if (!isFirebaseAdminReady()) {
      return NextResponse.json(fallbackResponse("Firebase Admin not configured"));
    }

    const projectId = getProjectId();
    const accessToken = await getAccessToken();
    const plan = await detectPlan(projectId, accessToken);

    const [readsResult, writesResult, deletesResult, storageResult] = await Promise.all([
      queryMetricOrNull(projectId, accessToken, FIRESTORE_READ_METRIC, {
        durationHours: 24,
        alignmentPeriodSeconds: 86400,
        aligner: "ALIGN_SUM",
        reducer: "REDUCE_SUM",
      }),
      queryMetricOrNull(projectId, accessToken, FIRESTORE_WRITE_METRIC, {
        durationHours: 24,
        alignmentPeriodSeconds: 86400,
        aligner: "ALIGN_SUM",
        reducer: "REDUCE_SUM",
      }),
      queryMetricOrNull(projectId, accessToken, FIRESTORE_DELETE_METRIC, {
        durationHours: 24,
        alignmentPeriodSeconds: 86400,
        aligner: "ALIGN_SUM",
        reducer: "REDUCE_SUM",
      }),
      queryStorageBytes(projectId, accessToken),
    ]);

    const reads24h = readsResult.value;
    const writes24h = writesResult.value;
    const deletes24h = deletesResult.value;
    const storageBytes = storageResult.value;
    const storageMetricType = storageResult.metricType;

    const permissionLimited =
      readsResult.permissionDenied ||
      writesResult.permissionDenied ||
      deletesResult.permissionDenied ||
      storageResult.permissionDenied;

    const limits =
      plan === "spark"
        ? {
            storageBytes: SPARK_LIMITS.storageBytes,
            reads24h: SPARK_LIMITS.reads24h,
            writes24h: SPARK_LIMITS.writes24h,
            deletes24h: SPARK_LIMITS.deletes24h,
          }
        : {
            storageBytes: null,
            reads24h: null,
            writes24h: null,
            deletes24h: null,
          };

    const percent = {
      storage: toPercent(storageBytes, limits.storageBytes),
      reads24h: toPercent(reads24h, limits.reads24h),
      writes24h: toPercent(writes24h, limits.writes24h),
      deletes24h: toPercent(deletes24h, limits.deletes24h),
    };

    return NextResponse.json({
      ok: true,
      mode: permissionLimited ? "firebase_plan_limited_usage" : "firebase_plan_real_usage",
      projectId,
      plan,
      permissionLimited,
      metrics: {
        storageBytes,
        reads24h,
        writes24h,
        deletes24h,
      },
      limits,
      percent,
      storageMetricType,
      hint: permissionLimited
        ? "Monitoring permission is limited. Some values are unavailable."
        : undefined,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      fallbackResponse(`Unable to read Firestore usage: ${message}`)
    );
  }
}
