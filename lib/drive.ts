import { Readable } from "node:stream";
import { google } from "googleapis";

type UploadBillImageContext = {
  sequence?: string;
  projectId?: string;
  billDate?: string;
};

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("Missing Google service account credentials.");
  }
  return { client_email: clientEmail, private_key: privateKey };
}

export function getDriveClient() {
  const credentials = getCredentials();
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });
  return google.drive({ version: "v3", auth });
}

export async function uploadBillImage(file: File, context: UploadBillImageContext = {}) {
  const folderId = process.env.GOOGLE_DRIVE_BILL_FOLDER_ID;
  if (!folderId) {
    throw new Error("Missing GOOGLE_DRIVE_BILL_FOLDER_ID. Share a Drive folder with the service account and set the folder id.");
  }

  const fileName = buildBillFileName(file.name, context);
  const mimeType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());
  const webAppUrl = process.env.GOOGLE_DRIVE_UPLOAD_WEBAPP_URL;

  if (webAppUrl) {
    return uploadViaAppsScript({
      webAppUrl,
      folderId,
      fileName,
      mimeType,
      buffer
    });
  }

  const drive = getDriveClient();
  await assertBillFolderReady(drive, folderId);
  const result = await createDriveFile(drive, {
    fileName,
    folderId,
    mimeType,
    buffer
  });

  const fileId = result.data.id;
  if (!fileId) throw new Error("Google Drive upload did not return a file id.");

  if (process.env.GOOGLE_DRIVE_PUBLIC_UPLOADS === "1") {
    await drive.permissions.create({
      fileId,
      supportsAllDrives: true,
      requestBody: {
        role: "reader",
        type: "anyone"
      }
    });
  }

  return result.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}

async function assertBillFolderReady(drive: ReturnType<typeof getDriveClient>, folderId: string) {
  try {
    const result = await drive.files.get({
      fileId: folderId,
      supportsAllDrives: true,
      fields: "id,name,mimeType,driveId,capabilities/canAddChildren,trashed"
    });
    const folder = result.data;
    if (folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed) {
      throw new Error("Google Drive bill upload target is not an active folder.");
    }
    if (!folder.driveId) {
      throw new Error("serviceAccountMyDriveFolder");
    }
    if (!folder.capabilities?.canAddChildren) {
      throw new Error("serviceAccountCannotAddChildren");
    }
  } catch (error) {
    throw new Error(formatDriveUploadError(error));
  }
}

async function uploadViaAppsScript({
  webAppUrl,
  folderId,
  fileName,
  mimeType,
  buffer
}: {
  webAppUrl: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: process.env.GOOGLE_DRIVE_UPLOAD_TOKEN || "",
      folderId,
      fileName,
      mimeType,
      data: buffer.toString("base64")
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.url) {
    throw new Error(payload.error || "อัปโหลดรูปผ่าน Google Apps Script ไม่สำเร็จ");
  }
  return String(payload.url);
}

async function createDriveFile(
  drive: ReturnType<typeof getDriveClient>,
  {
    fileName,
    folderId,
    mimeType,
    buffer
  }: {
    fileName: string;
    folderId: string;
    mimeType: string;
    buffer: Buffer;
  }
) {
  try {
    return await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        mimeType,
        parents: [folderId]
      },
      media: {
        mimeType,
        body: Readable.from(buffer)
      },
      fields: "id,name,webViewLink,webContentLink"
    });
  } catch (error) {
    throw new Error(formatDriveUploadError(error));
  }
}

function formatDriveUploadError(error: unknown) {
  const message = getErrorMessage(error);
  if (message.includes("drive.googleapis.com") || message.includes("Google Drive API has not been used")) {
    const projectId = message.match(/project\s+(\d+)/i)?.[1];
    const projectHint = projectId ? ` project ${projectId}` : "";
    return `อัปโหลดรูปไม่ได้: ยังไม่ได้เปิด Google Drive API ใน Google Cloud${projectHint} ให้เปิด Drive API แล้วรอสักครู่ก่อนลองใหม่`;
  }
  if (message.includes("Service Accounts do not have storage quota") || message.includes("storage quota")) {
    return "อัปโหลดรูปไม่ได้: service account ไม่มี storage quota จึงสร้างไฟล์ใน My Drive ไม่ได้ ให้ย้ายโฟลเดอร์รูปบิลไปไว้ใน Shared Drive แล้วเพิ่ม service account เป็น Contributor หรือใช้ OAuth ของผู้ใช้แทน";
  }
  if (message.includes("serviceAccountMyDriveFolder")) {
    return "อัปโหลดรูปไม่ได้: GOOGLE_DRIVE_BILL_FOLDER_ID ตอนนี้เป็นโฟลเดอร์ใน My Drive แต่ service account ไม่มี storage quota ให้สร้าง/เลือกโฟลเดอร์ใน Shared Drive แล้วเพิ่ม service account เป็น Contributor จากนั้นเปลี่ยนค่า GOOGLE_DRIVE_BILL_FOLDER_ID เป็น folder id ใหม่นั้น";
  }
  if (message.includes("serviceAccountCannotAddChildren")) {
    return "อัปโหลดรูปไม่ได้: service account ยังไม่มีสิทธิ์เพิ่มไฟล์ในโฟลเดอร์รูปบิล ให้เพิ่ม service account เป็น Contributor หรือ Content manager ใน Shared Drive/folder นี้";
  }
  if (message.includes("File not found") || message.includes("notFound")) {
    return "อัปโหลดรูปไม่ได้: ไม่พบโฟลเดอร์ Google Drive หรือ service account ยังไม่มีสิทธิ์เข้าถึงโฟลเดอร์นี้";
  }
  if (message.includes("insufficient") || message.includes("permission") || message.includes("forbidden")) {
    return "อัปโหลดรูปไม่ได้: service account ไม่มีสิทธิ์เขียนไฟล์ใน Google Drive folder";
  }
  return message || "อัปโหลดรูปไป Google Drive ไม่สำเร็จ";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function buildBillFileName(originalName: string, context: UploadBillImageContext) {
  const extension = getExtension(originalName);
  const parts = [
    context.sequence ? `bill-${context.sequence}` : "bill",
    context.projectId ? `project-${context.projectId}` : "",
    context.billDate || "",
    timestamp()
  ].filter(Boolean);
  return `${safeFileName(parts.join("_"))}${extension}`;
}

function getExtension(name: string) {
  const match = name.match(/\.[A-Za-z0-9]{1,12}$/);
  return match ? match[0].toLowerCase() : "";
}

function safeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 140);
}

function timestamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
