import zlib from 'node:zlib';
import sharp from 'sharp';

const W = 1200;
const H = 630;

const FONT = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 14, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 4],
  '/': [1, 2, 2, 4, 8, 8, 16],
  '+': [0, 4, 4, 31, 4, 4, 0],
  ':': [0, 4, 0, 0, 0, 4, 0],
  '?': [14, 17, 1, 2, 4, 0, 4],
  '(': [4, 8, 8, 8, 8, 8, 4],
  ')': [8, 4, 4, 4, 4, 4, 8],
  0: [14, 17, 19, 21, 25, 17, 14],
  1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 2, 4, 8, 31],
  3: [14, 17, 1, 6, 1, 17, 14],
  4: [2, 6, 10, 18, 31, 2, 2],
  5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14],
  7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 19, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [1, 1, 1, 1, 17, 17, 14],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [14, 17, 16, 14, 1, 17, 14],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
};

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function poster(text, fallback) {
  const clean = String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 +\-./:?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || String(fallback || 'MCQ EXAM').toUpperCase();
}

function setPx(px, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
}

function fillRect(px, x, y, w, h, r, g, b) {
  const x2 = Math.min(W, x + w);
  const y2 = Math.min(H, y + h);
  for (let yy = Math.max(0, y); yy < y2; yy += 1) {
    for (let xx = Math.max(0, x); xx < x2; xx += 1) setPx(px, xx, yy, r, g, b);
  }
}

function drawChar(px, x, y, ch, scale, r, g, b) {
  const glyph = FONT[ch] || FONT['?'];
  for (let row = 0; row < 7; row += 1) {
    const bits = glyph[row];
    for (let col = 0; col < 5; col += 1) {
      if (bits & (16 >> col)) {
        fillRect(px, x + col * scale, y + row * scale, scale, scale, r, g, b);
      }
    }
  }
}

function drawText(px, x, y, text, scale, r, g, b, maxWidth) {
  const gap = Math.max(2, Math.round(scale * 0.4));
  const advance = 5 * scale + gap;
  let cx = x;
  for (const ch of text) {
    if (maxWidth && cx + 5 * scale - x > maxWidth) break;
    drawChar(px, cx, y, ch, scale, r, g, b);
    cx += advance;
  }
  return cx;
}

function wrap(text, scale, maxWidth) {
  const gap = Math.max(2, Math.round(scale * 0.4));
  const advance = 5 * scale + gap;
  const words = String(text).split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length * advance - gap > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

export function renderShareCard(meta) {
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    const t = y / (H - 1);
    const r = Math.round(16 + (26 - 16) * t);
    const g = Math.round(10 + (18 - 10) * t);
    const b = Math.round(36 + (64 - 36) * t);
    fillRect(px, 0, y, W, 1, r, g, b);
  }
  fillRect(px, 0, 0, 18, H, 255, 122, 89);
  fillRect(px, 56, 48, 180, 8, 255, 154, 122);

  const group = poster(meta.group, 'QUIZ97');
  drawText(px, 56, 78, group, 4, 255, 209, 102, 700);

  const title = poster(meta.exam_title, 'MCQ EXAM');
  const titleLines = wrap(title, 8, 1080);
  titleLines.forEach((line, i) => {
    drawText(px, 56, 150 + i * 78, line, 8, 246, 241, 255, 1080);
  });

  const paper = poster(meta.paper_title, '');
  if (paper && paper !== title) {
    drawText(px, 56, 150 + titleLines.length * 78 + 8, paper, 4, 255, 154, 122, 1080);
  }

  const details = poster(
    `${meta.question_count || 0} QUESTIONS - ${meta.mode_label || 'EXAM'}${
      meta.mode !== 'read' && meta.duration_minutes ? ` - ${meta.duration_minutes} MIN` : ''
    }`,
    ''
  );
  drawText(px, 56, 520, details, 4, 184, 174, 212, 1080);
  drawText(px, 56, 572, 'QUIZ97', 3, 139, 124, 255, 400);

  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y += 1) {
    raw[y * (W * 3 + 1)] = 0;
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function renderShareImage(coverBuffer, meta) {
  if (coverBuffer?.length) {
    try {
      const body = await sharp(coverBuffer)
        .rotate()
        .resize(W, H, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 86, chromaSubsampling: '4:2:0' })
        .toBuffer();
      return { mime: 'image/jpeg', body };
    } catch {
      // fall through to the generated card
    }
  }

  const png = renderShareCard(meta);
  try {
    const body = await sharp(png).jpeg({ quality: 90 }).toBuffer();
    return { mime: 'image/jpeg', body };
  } catch {
    return { mime: 'image/png', body: png };
  }
}
