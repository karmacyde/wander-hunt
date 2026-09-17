/*
 * photos.js — turning a camera capture into something small enough to keep.
 *
 * A phone camera produces 12–48 MP files. We only ever show photos on a
 * phone screen, so each one is decoded, scaled to at most MAX_EDGE pixels
 * on its longest side and re-encoded as JPEG before it goes anywhere near
 * IndexedDB. Orientation is handled by the browser's image decoder, which
 * applies EXIF rotation automatically in every browser we target.
 *
 * Also here: object-URL bookkeeping, sharing, and the journal contact sheet.
 */

const MAX_EDGE = 1400;
const JPEG_QUALITY = 0.82;

/** Decode an image File into a drawable element. */
function decodeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))), type, quality);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Resize a captured image. Resolves { blob, width, height }.
 * Throws if the file is not a usable image.
 */
export async function processImageFile(file) {
  if (!file || !/^image\//.test(file.type || "")) {
    throw new Error("That file isn't a photo");
  }
  const img = await decodeImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw new Error("Empty image");

  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  // Free the canvas memory eagerly; large captures on iPhone add up.
  canvas.width = canvas.height = 0;
  return { blob, width, height };
}

/* ------------------------------------------------------- object URLs */

const urlCache = new Map(); // photo key → { blob, url }

/** A stable object URL for a blob, revoking any stale one for that key. */
export function urlForPhoto(itemId, blob) {
  const cached = urlCache.get(itemId);
  if (cached && cached.blob === blob) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  const url = URL.createObjectURL(blob);
  urlCache.set(itemId, { blob, url });
  return url;
}

export function releasePhotoURL(itemId) {
  const cached = urlCache.get(itemId);
  if (cached) {
    URL.revokeObjectURL(cached.url);
    urlCache.delete(itemId);
  }
}

/* ------------------------------------------------------------- sharing */

function safeFilename(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "photo";
}

/**
 * Share a JPEG blob with the native share sheet.
 * Resolves "shared" | "cancelled" | "unsupported".
 */
export async function shareImage(blob, name, title) {
  const file = new File([blob], `${safeFilename(name)}.jpg`, { type: "image/jpeg" });
  const data = { files: [file], title };
  if (!navigator.share || !navigator.canShare || !navigator.canShare(data)) {
    return "unsupported";
  }
  try {
    await navigator.share(data);
    return "shared";
  } catch (err) {
    if (err && err.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}

/* -------------------------------------------------------- contact sheet */

/**
 * Build a single "journal" image from the found photos.
 * entries: [{ title, blob }] in display order.
 * Resolves a JPEG Blob.
 */
export async function buildContactSheet(entries, { heading, subheading }) {
  const cols = 3;
  const sheetW = 1500;
  const margin = 60;
  const gap = 30;
  const cellW = Math.floor((sheetW - margin * 2 - gap * (cols - 1)) / cols);
  const photoH = cellW; // square crops
  const captionH = 70;
  const cellH = photoH + captionH;
  const headerH = 200;
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const sheetH = headerH + rows * cellH + (rows - 1) * gap + margin;

  const canvas = document.createElement("canvas");
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas unavailable");

  // Paper background
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, sheetW, sheetH);

  ctx.fillStyle = "#1f2a24";
  ctx.font = "600 64px 'New York', 'Iowan Old Style', Georgia, serif";
  ctx.textBaseline = "top";
  ctx.fillText(heading, margin, margin);
  ctx.fillStyle = "#2f6b4f";
  ctx.font = "500 30px -apple-system, 'SF Pro Rounded', system-ui, sans-serif";
  ctx.fillText(subheading, margin, margin + 84);

  const images = await Promise.all(entries.map((e) => decodeImage(e.blob).catch(() => null)));

  entries.forEach((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cellW + gap);
    const y = headerH + row * (cellH + gap);

    // Card
    ctx.fillStyle = "#fffbf3";
    ctx.fillRect(x - 8, y - 8, cellW + 16, cellH + 16);
    ctx.strokeStyle = "#dcd3c1";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 8, y - 8, cellW + 16, cellH + 16);

    const img = images[i];
    if (img) {
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      const side = Math.min(sw, sh);
      const sx = (sw - side) / 2;
      const sy = (sh - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, x, y, cellW, photoH);
    } else {
      ctx.fillStyle = "#e8e1d4";
      ctx.fillRect(x, y, cellW, photoH);
    }

    ctx.fillStyle = "#1f2a24";
    ctx.font = "500 26px -apple-system, 'SF Pro Rounded', system-ui, sans-serif";
    ctx.textBaseline = "middle";
    fitText(ctx, entry.title, x + 6, y + photoH + captionH / 2, cellW - 12);
  });

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  canvas.width = canvas.height = 0;
  return blob;
}

/** Draw text truncated with an ellipsis to fit maxWidth. */
function fitText(ctx, text, x, y, maxWidth) {
  let t = text;
  if (ctx.measureText(t).width <= maxWidth) {
    ctx.fillText(t, x, y);
    return;
  }
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  ctx.fillText(`${t.trimEnd()}…`, x, y);
}
