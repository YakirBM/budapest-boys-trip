/**
 * scripts/generate-icons.mjs — PWA icon generator with ZERO dependencies.
 *
 * Hand-rolled minimal PNG encoder (RGBA scanlines + zlib deflate + CRC32) and
 * a tiny triangle/rounded-rect rasterizer rendered at 4x and box-downsampled
 * for anti-aliased edges.
 *
 * Brand (docs/05-ui-ux-design-system.md §4): rounded-square background with a
 * diagonal cyan/teal gradient (#0e7490 → #155e75), white two-triangle
 * upward paper-plane glyph. Maskable variant keeps a ≥10% (we use ~19%)
 * safe zone; apple-touch-icon is full-bleed 180x180 with no transparency.
 *
 * Run: node scripts/generate-icons.mjs
 * Output: public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(scriptDir, "../public/icons");

/* ---------------- PNG encoder ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------------- Rasterizer (supersampled) ---------------- */

const SS = 4; // supersample factor
const BG_A = [0x0e, 0x74, 0x90]; // brand light
const BG_B = [0x15, 0x5e, 0x75]; // brand-strong (diagonal gradient target)
const CORNER_RADIUS_RATIO = 0.2;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Signed distance to a rounded rectangle centered at (cx, cy). */
function roundedRectSDF(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Point-in-triangle via barycentric sign method. */
function inTriangle(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Render one icon.
 * @param size        output size in px
 * @param fullBleed   true → square background (maskable / apple), false → rounded corners w/ transparency
 * @param glyphScale  uniform scale for the glyph about the canvas center
 */
function renderIcon(size, { fullBleed = false, glyphScale = 1 } = {}) {
  const N = size * SS;
  const buf = new Float64Array(N * N * 4); // premultiplied accumulators

  // Glyph geometry in unit coords (y down): paper-plane pointing up.
  // Scaled to output-pixel units (px/py space) with an optional uniform
  // glyphScale about the canvas center (maskable safe zone).
  const A = [0.5, 0.16]; // apex
  const BL = [0.24, 0.8]; // bottom-left wing tip
  const BR = [0.76, 0.8]; // bottom-right wing tip
  const M = [0.5, 0.62]; // center notch (fold)
  const cx = 0.5,
    cy = 0.5;
  const g = ([x, y]) => [((x - cx) * glyphScale + cx) * size, ((y - cy) * glyphScale + cy) * size];
  const apex = g(A);
  const bl = g(BL);
  const br = g(BR);
  const mid = g(M);

  // px/py are output-pixel units → radius in output pixels (no ×SS).
  const cornerRadius = size * CORNER_RADIUS_RATIO;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = (x + 0.5) / SS;
      const py = (y + 0.5) / SS;

      // Background coverage (1 inside, 0 outside; AA comes from downsampling).
      let bg = 1;
      if (!fullBleed) {
        const d = roundedRectSDF(px, py, size / 2, size / 2, size / 2, size / 2, cornerRadius);
        bg = d <= 0 ? 1 : 0;
      }

      // Diagonal gradient background color.
      const t = (px + py) / (2 * size);
      const r = lerp(BG_A[0], BG_B[0], t);
      const gg = lerp(BG_A[1], BG_B[1], t);
      const b = lerp(BG_A[2], BG_B[2], t);

      // Glyph: two triangles — left wing solid white, right wing 72% white.
      let alpha = 0;
      if (inTriangle(px, py, apex, bl, mid)) alpha = 1;
      else if (inTriangle(px, py, apex, mid, br)) alpha = 0.72;

      const outR = lerp(r, 255, alpha);
      const outG = lerp(gg, 255, alpha);
      const outB = lerp(b, 255, alpha);
      const outA = Math.max(alpha, bg);

      const i = (y * N + x) * 4;
      // Premultiplied accumulation: RGB premultiplied by alpha fraction (0..255),
      // alpha accumulated on a 0..255 byte scale.
      buf[i] = outR * outA;
      buf[i + 1] = outG * outA;
      buf[i + 2] = outB * outA;
      buf[i + 3] = outA * 255;
    }
  }

  // Box downsample N×N → size×size, unpremultiply alpha.
  const out = new Uint8Array(size * size * 4);
  const samples = SS * SS;
  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        gAcc = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * N + (x * SS + sx)) * 4;
          r += buf[i];
          gAcc += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const alphaByte = a / samples; // 0..255
      const o = (y * size + x) * 4;
      if (alphaByte > 0.5) {
        const k = 255 / alphaByte;
        out[o] = clamp255(Math.round((r / samples) * k));
        out[o + 1] = clamp255(Math.round((gAcc / samples) * k));
        out[o + 2] = clamp255(Math.round((b / samples) * k));
        out[o + 3] = Math.round(alphaByte);
      }
    }
  }
  return encodePNG(size, size, out);
}

/* ---------------- Emit ---------------- */

mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, opts: { fullBleed: false, glyphScale: 1 } },
  { file: "icon-512.png", size: 512, opts: { fullBleed: false, glyphScale: 1 } },
  // Launcher masks crop to the central ~80% circle → glyph scaled into safe zone.
  { file: "maskable-512.png", size: 512, opts: { fullBleed: true, glyphScale: 0.62 } },
  // iOS masks corners itself → full-bleed square, no transparency, standard glyph.
  { file: "apple-touch-icon.png", size: 180, opts: { fullBleed: true, glyphScale: 0.9 } },
];

for (const target of targets) {
  const png = renderIcon(target.size, target.opts);
  const dest = join(outDir, target.file);
  writeFileSync(dest, png);
  const bytes = statSync(dest).size;
  console.log(`${target.file}  ${target.size}x${target.size}  ${(bytes / 1024).toFixed(1)} KB`);
}

console.log("done →", outDir);
