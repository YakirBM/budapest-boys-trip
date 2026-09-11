/**
 * lib/utils/image.ts — client-side media pipeline (docs/06-features/07 §Upload pipeline).
 * Browser-only: decode → canvas re-encode → WebP derivative (2048px q≈0.8) +
 * 400px thumbnail (q≈0.7). EXIF/GPS is stripped by construction — the canvas
 * re-encode carries no metadata. A decode/encode failure is rejected so an
 * untouched file (including EXIF/GPS) can never be uploaded accidentally.
 */

export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
export const LONG_EDGE = 2048;
export const THUMB_LONG_EDGE = 400;
export const DERIVATIVE_QUALITY = 0.8;
export const THUMB_QUALITY = 0.7;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|hei[cf])$/i;

export interface CompressedImage {
  /** Shared derivative (long edge ≤ 2048, no metadata). */
  blob: Blob;
  /** 400px thumbnail; equals `blob` when the source is already thumbnail-sized. */
  thumbBlob: Blob;
  width: number;
  height: number;
  /** Kept literal for callers that need to assert the privacy-safe path. */
  fallback: false;
  /** Actual mime of the derivative (normally image/webp). */
  mime: string;
}

export function isAllowedImageFile(file: File): boolean {
  if (file.type === "") return ALLOWED_EXTENSIONS.test(file.name);
  return ALLOWED_MIME.has(file.type.toLowerCase()) || ALLOWED_EXTENSIONS.test(file.name);
}

/** Decode to a bitmap; falls back to an <img> element for engines without createImageBitmap(Blob). */
async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // HEIC on Chromium/Firefox and other decode failures → <img> attempt.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sourceSize(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function drawScaled(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** toBlob with WebP intent; falls back to whatever the engine can encode. */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas encode failed"))),
      "image/webp",
      quality,
    );
  });
}

function scaledDimensions(width: number, height: number, longEdge: number): {
  width: number;
  height: number;
} {
  if (width <= 0 || height <= 0) return { width: longEdge, height: longEdge };
  const long = Math.max(width, height);
  if (long <= longEdge) return { width, height };
  const ratio = longEdge / long;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

/**
 * Compress one picked image into the shared WebP derivative + thumbnail.
 * Throws when the browser cannot create privacy-safe derivatives. Callers must
 * surface the error and must not upload the original file.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  try {
    const source = await decodeImage(file);
    const { width: srcW, height: srcH } = sourceSize(source);
    const main = scaledDimensions(srcW, srcH, LONG_EDGE);
    const thumb = scaledDimensions(srcW, srcH, THUMB_LONG_EDGE);

    const mainBlob = await canvasToBlob(drawScaled(source, main.width, main.height), DERIVATIVE_QUALITY);
    const thumbBlob =
      srcW <= THUMB_LONG_EDGE && srcH <= THUMB_LONG_EDGE
        ? mainBlob
        : await canvasToBlob(drawScaled(source, thumb.width, thumb.height), THUMB_QUALITY);

    if (mainBlob.size <= 0 || mainBlob.size > MAX_OUTPUT_BYTES) {
      throw new Error("image_derivative_size_invalid");
    }

    if (source instanceof ImageBitmap) source.close();
    return {
      blob: mainBlob,
      thumbBlob,
      width: main.width,
      height: main.height,
      fallback: false,
      mime: mainBlob.type || "image/webp",
    };
  } catch (error) {
    throw new Error("image_safe_reencode_failed", { cause: error });
  }
}

/** SHA-256 hex of a blob — duplicate-detection key for media items. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
