import { NextRequest, NextResponse } from "next/server";
import { getDriveClient } from "@/lib/drive";

type DriveImageParams = {
  params: Promise<{ fileId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: DriveImageParams) {
  const { fileId } = await params;
  if (!isSafeDriveFileId(fileId)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  try {
    const drive = getDriveClient();
    const metadata = await drive.files.get({
      fileId,
      supportsAllDrives: true,
      fields: "id,mimeType,name"
    });
    const mimeType = metadata.data.mimeType || "application/octet-stream";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "File is not an image" }, { status: 415 });
    }

    const file = await drive.files.get(
      {
        fileId,
        alt: "media",
        supportsAllDrives: true
      },
      { responseType: "arraybuffer" }
    );
    const body = Buffer.from(file.data as ArrayBuffer);
    return new NextResponse(body, {
      headers: {
        "cache-control": "private, max-age=300",
        "content-disposition": `inline; filename="${safeDownloadName(metadata.data.name || fileId)}"`,
        "content-type": mimeType
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image load failed" }, { status: 404 });
  }
}

function isSafeDriveFileId(value: string) {
  return /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

function safeDownloadName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
}
