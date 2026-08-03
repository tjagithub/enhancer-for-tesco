const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---- minimal PNG encoder (RGBA, 8-bit) ----
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- drawing ----
function lerp(a, b, t) { return a + (b - a) * t; }
function mixRGB(c1, c2, t) {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}

const GREEN = [0x18, 0x80, 0x38];
const AMBER = [0xe8, 0xa4, 0x00];
const RED = [0xc5, 0x22, 0x1f];
const WHITE = [0xff, 0xff, 0xff];

function renderIcon(size) {
  const SS = 4; // supersample factor
  const S = size * SS;
  const px = new Float64Array(S * S * 4);

  const setPx = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    px[i] += r * a; px[i + 1] += g * a; px[i + 2] += b * a; px[i + 3] += a;
  };

  const R = S * 0.22; // corner radius
  const insideRounded = (x, y) => {
    const cx = Math.min(Math.max(x, R), S - R);
    const cy = Math.min(Math.max(y, R), S - R);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= R * R;
  };

  // background gradient + rounded corners
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!insideRounded(x, y)) continue;
      const t = (x + y) / (2 * S);
      let col = t < 0.55 ? mixRGB(GREEN, AMBER, t / 0.55) : mixRGB(AMBER, RED, (t - 0.55) / 0.45);
      setPx(x, y, col[0], col[1], col[2], 255);
    }
  }

  // "£" glyph in white
  const stroke = (x1, y1, x2, y2, w) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = lerp(x1, x2, t), cy = lerp(y1, y2, t);
      for (let dy = -w / 2; dy <= w / 2; dy++) {
        for (let dx = -w / 2; dx <= w / 2; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= w / 2) setPx(cx + dx, cy + dy, WHITE[0], WHITE[1], WHITE[2], 255 * (1 - (d / (w / 2)) * 0.4));
        }
      }
    }
  };

  const ring = (cx, cy, r, w) => {
    for (let a = 0; a < 360; a += 0.4) {
      const rad = (a * Math.PI) / 180;
      const x = cx + Math.cos(rad) * r;
      const y = cy + Math.sin(rad) * r;
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const rr = r + (i / steps - 0.5) * w;
        setPx(cx + Math.cos(rad) * rr, cy + Math.sin(rad) * rr, WHITE[0], WHITE[1], WHITE[2], 200);
      }
    }
  };

  const w = S * 0.16;
  // cross bar
  stroke(S * 0.30, S * 0.32, S * 0.66, S * 0.32, w);
  // stem
  stroke(S * 0.38, S * 0.32, S * 0.38, S * 0.68, w);
  // loop (right of stem)
  ring(S * 0.46, S * 0.40, S * 0.075, w * 0.85);
  // bottom foot
  stroke(S * 0.30, S * 0.70, S * 0.56, S * 0.70, w);

  // downsample
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * S + (x * SS + dx)) * 4;
          a += px[i + 3]; r += px[i]; g += px[i + 1]; b += px[i + 2];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / n);
      } else {
        out[o] = out[o + 1] = out[o + 2] = 0; out[o + 3] = 0;
      }
    }
  }
  return encodePNG(size, size, out);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), renderIcon(size));
  console.log('wrote icon' + size + '.png');
}
