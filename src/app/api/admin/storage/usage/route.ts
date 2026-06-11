import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

export const runtime = "nodejs";

type FirebasePlan = "spark" | "blaze";

const SPARK_STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
const STORAGE_TOTAL_BYTES_METRIC = "storage.googleapis.com/storage/v2/total_bytes";
const STORAGE_OBJECT_COUNT_METRIC = "storage.googleapis.com/storage/v2/object_count";

function getPlanFromEnv(): FirebasePlan {
  return (process.env.FIREBASE_PLAN || "spark").toLowerCase() === "blaze"
    ? "blaze"
    : "spark";
}

function getProjectId() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Missing Firebase project id");
  return projectId;
}

function getBucketName() {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
}

function getGoogleCredentialsFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) return null;

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
  if (!accessToken) throw new Error("Cannot acquire Google access token");
  return accessToken;
}

async function fetchJson(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || data?.error || "Request failed");
  return data;
}

async function detectPlan(projectId: string, accessToken: string): Promise<FirebasePlan> {
  const planFromEnv = (process.env.FIREBASE_PLAN || "").toLowerCase();
  if (planFromEnv === "spark" || planFromEnv === "blaze") return planFromEnv;

  try {
    const url = `https://cloudbilling.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/billingInfo`;
    const data = await fetchJson(url, accessToken);
    return data?.billingEnabled ? "blaze" : "spark";
  } catch {
    return "spark";
  }
}

function asNumber(value: unknown) {
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

function isPermissionDeniedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  return normalized.includes("permission") || normalized.includes("permission_denied");
}

async function queryStorageMetric(projectId: string, accessToken: string, metricType: string, bucketName: string) {
  const end = new Date();
  const start = new Date(end.getTime() - 48 * 60 * 60 * 1000);
  const filters = [`metric.type="${metricType}"`];
  if (bucketName) {
    filters.push(`resource.label.bucket_name="${bucketName}"`);
  }

  const params = new URLSearchParams({
    filter: filters.join(" AND "),
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": "3600s",
    "aggregation.perSeriesAligner": "ALIGN_MEAN",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
    view: "FULL",
    pageSize: "1",
  });

  const url = `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${params.toString()}`;
  const data = await fetchJson(url, accessToken);
  const series = Array.isArray(data?.timeSeries) ? data.timeSeries : [];
  if (series.length === 0) return null;
  const points = Array.isArray(series[0]?.points) ? series[0].points : [];
  if (points.length === 0) return null;
  const value = points[0]?.value || {};
  return asNumber(value?.int64Value ?? value?.doubleValue);
}

async function queryMetricOrNull(projectId: string, accessToken: string, metricType: string, bucketName: string) {
  try {
    return { value: await queryStorageMetric(projectId, accessToken, metricType, bucketName), permissionDenied: false };
  } catch (error) {
    if (isPermissionDeniedError(error)) return { value: null, permissionDenied: true };
    throw error;
  }
}

export async function GET() {
  try {
    const projectId = getProjectId();
    const bucketName = getBucketName();
    const accessToken = await getAccessToken();
    const plan = await detectPlan(projectId, accessToken);
    const [bytesResult, objectsResult] = await Promise.all([
      queryMetricOrNull(projectId, accessToken, STORAGE_TOTAL_BYTES_METRIC, bucketName),
      queryMetricOrNull(projectId, accessToken, STORAGE_OBJECT_COUNT_METRIC, bucketName),
    ]);

    const storageBytes = bytesResult.value;
    const objectCount = objectsResult.value;
    const storageBytesLimit = plan === "spark" ? SPARK_STORAGE_LIMIT_BYTES : null;

    return NextResponse.json({
      ok: true,
      projectId,
      bucketName,
      plan,
      permissionLimited: bytesResult.permissionDenied || objectsResult.permissionDenied,
      metrics: {
        storageBytes,
        objectCount,
      },
      limits: {
        storageBytes: storageBytesLimit,
      },
      percent: {
        storage: toPercent(storageBytes, storageBytesLimit),
      },
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      ok: true,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      bucketName: getBucketName(),
      plan: getPlanFromEnv(),
      permissionLimited: true,
      metrics: {
        storageBytes: null,
        objectCount: null,
      },
      limits: {
        storageBytes: null,
      },
      percent: {
        storage: null,
      },
      hint: `Unable to read Storage usage: ${message}`,
      updatedAt: new Date().toISOString(),
    });
  }
}
