"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

type BillImageThumbnailProps = {
  value: unknown;
};

export function BillImageThumbnail({ value }: BillImageThumbnailProps) {
  const rawValue = formatValue(value).trim();
  const [open, setOpen] = useState(false);
  const imageUrl = imagePreviewUrl(rawValue);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!rawValue) return null;

  if (!imageUrl) {
    return <span className="bill-image-path" title={rawValue}>{rawValue}</span>;
  }

  return (
    <>
      <button type="button" className="bill-thumb-link" title="ดูรูปถ่ายบิล" onClick={() => setOpen(true)}>
        <img src={imageUrl} alt="รูปถ่ายบิล" loading="lazy" />
      </button>
      {open ? (
        <div className="image-preview-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="image-preview-dialog" role="dialog" aria-modal="true" aria-label="รูปถ่ายบิล" onClick={event => event.stopPropagation()}>
            <header className="image-preview-header">
              <strong>รูปถ่ายบิล</strong>
              <div className="image-preview-actions">
                <a className="image-preview-open" href={imageUrl} target="_blank" rel="noreferrer" aria-label="เปิดรูปในแท็บใหม่">
                  <ExternalLink size={18} />
                </a>
                <button className="image-preview-close" type="button" aria-label="ปิดรูป" onClick={() => setOpen(false)}>
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="image-preview-body">
              <img src={imageUrl} alt="รูปถ่ายบิล" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}

function imagePreviewUrl(value: string) {
  if (/^\/api\/drive-image\/[A-Za-z0-9_-]+/.test(value)) return value;
  const driveFileId = driveFileIdFromUrl(value);
  if (driveFileId) return `/api/drive-image/${encodeURIComponent(driveFileId)}`;
  if (/^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value)) return value;
  return "";
}

function driveFileIdFromUrl(value: string) {
  const proxyPathMatch = value.match(/\/api\/drive-image\/([^/?#]+)/i);
  if (proxyPathMatch?.[1]) return proxyPathMatch[1];
  const filePathMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (filePathMatch?.[1]) return filePathMatch[1];
  const queryMatch = value.match(/[?&]id=([^&#]+)/i);
  if (queryMatch?.[1] && value.includes("drive.google.com")) return queryMatch[1];
  return "";
}
