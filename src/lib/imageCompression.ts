export interface CompressImageOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    maxSizeKB?: number;
}

export interface CompressedImageResult {
    file: File;
    base64: string;
    previewUrl: string;
    originalSize: number;
    compressedSize: number;
}

/**
 * Automatically compress and downscale payment slip images in client browser.
 * Ensures the resulting image is crisp for QR/text reading while keeping file size
 * well within Firestore base64 and Storage limits (usually 100KB - 350KB).
 */
export async function compressSlipImage(
    file: File,
    options: CompressImageOptions = {}
): Promise<CompressedImageResult> {
    const {
        maxWidth = 1400,
        maxHeight = 1800,
        quality = 0.82,
        maxSizeKB = 500
    } = options;

    return new Promise((resolve, reject) => {
        // Validate that it's an image
        const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
        if (!isImage) {
            reject(new Error("กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP)"));
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            try {
                let { width, height } = img;

                // Scale down while maintaining aspect ratio
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    throw new Error("เบราว์เซอร์ไม่สามารถประมวลผลรูปภาพได้");
                }

                // Fill with white background to handle transparent PNGs converting to JPEG
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                const exportJpeg = (q: number) => {
                    return new Promise<{ blob: Blob; base64: string }>((resBlob, rejBlob) => {
                        const base64 = canvas.toDataURL("image/jpeg", q);
                        canvas.toBlob(
                            (b) => {
                                if (b) resBlob({ blob: b, base64 });
                                else rejBlob(new Error("แปลงไฟล์รูปภาพไม่สำเร็จ"));
                            },
                            "image/jpeg",
                            q
                        );
                    });
                };

                exportJpeg(quality)
                    .then(async ({ blob, base64 }) => {
                        let finalBlob = blob;
                        let finalBase64 = base64;

                        // If still larger than maxSizeKB, do a second more aggressive pass
                        if (finalBlob.size > maxSizeKB * 1024) {
                            const secondPass = await exportJpeg(0.68);
                            finalBlob = secondPass.blob;
                            finalBase64 = secondPass.base64;
                        }

                        const finalFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                        const compressedFile = new File([finalBlob], finalFileName, {
                            type: "image/jpeg",
                            lastModified: Date.now()
                        });

                        resolve({
                            file: compressedFile,
                            base64: finalBase64,
                            previewUrl: finalBase64,
                            originalSize: file.size,
                            compressedSize: finalBlob.size
                        });
                    })
                    .catch(reject);
            } catch (err) {
                reject(err);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            // Fallback for files that the canvas image loader fails to decode directly
            if (file.size <= 800 * 1024) {
                const reader = new FileReader();
                reader.onload = () => {
                    resolve({
                        file,
                        base64: String(reader.result),
                        previewUrl: String(reader.result),
                        originalSize: file.size,
                        compressedSize: file.size
                    });
                };
                reader.onerror = () => reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
                reader.readAsDataURL(file);
            } else {
                reject(new Error("ไม่สามารถเปิดไฟล์รูปภาพนี้ได้ กรุณาลองบันทึกเป็น JPG หรือจับภาพหน้าจอใหม่"));
            }
        };

        img.src = objectUrl;
    });
}
