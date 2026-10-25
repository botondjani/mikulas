/**
 * Ikonok generálása kódból, külső függőség nélkül: ugyanazt a vektoros rajzot
 * SVG-be írjuk, és egy saját, élsimított raszterizálóval PNG-be.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type RGBA = [number, number, number, number];
type Shape =
  | { k: 'rect'; x: number; y: number; w: number; h: number; r?: number; c: RGBA }
  | { k: 'circle'; x: number; y: number; r: number; c: RGBA }
  | { k: 'poly'; pts: [number, number][]; c: RGBA };

const hex = (c: RGBA) => `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
const NIGHT: RGBA = [11, 26, 58, 255];
const SKY: RGBA = [29, 58, 120, 255];
const SNOW: RGBA = [238, 244, 255, 255];
const RED: RGBA = [217, 65, 59, 255];
const DARKRED: RGBA = [160, 40, 36, 255];
const GOLD: RGBA = [255, 211, 107, 255];

/** rajz egy 100×100-as vásznon; `pad` a maszkolható ikon biztonsági zónája */
function shapes(pad: number): Shape[] {
  const s = (v: number) => pad + (v * (100 - 2 * pad)) / 100;
  const star = (cx: number, cy: number, r: number): [number, number][] =>
    Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.42 : r;
      return [s(cx + Math.cos(a) * rr), s(cy + Math.sin(a) * rr)] as [number, number];
    });
  return [
    { k: 'rect', x: 0, y: 0, w: 100, h: 100, c: NIGHT },
    { k: 'circle', x: 50, y: 150, r: 95, c: SKY },
    { k: 'circle', x: s(50), y: s(118), r: (60 * (100 - 2 * pad)) / 100, c: SNOW },
    { k: 'poly', pts: star(78, 20, 9), c: GOLD },
    { k: 'circle', x: s(20), y: s(16), r: 1.5, c: SNOW },
    { k: 'circle', x: s(34), y: s(30), r: 1.2, c: SNOW },
    { k: 'circle', x: s(60), y: s(10), r: 1.2, c: SNOW },
    // ajándékdoboz
    { k: 'rect', x: s(26), y: s(44), w: s(74) - s(26), h: s(82) - s(44), r: 3, c: RED },
    { k: 'rect', x: s(22), y: s(36), w: s(78) - s(22), h: s(48) - s(36), r: 3, c: DARKRED },
    { k: 'rect', x: s(46), y: s(36), w: s(54) - s(46), h: s(82) - s(36), c: GOLD },
    { k: 'circle', x: s(42), y: s(32), r: (7 * (100 - 2 * pad)) / 100, c: GOLD },
    { k: 'circle', x: s(58), y: s(32), r: (7 * (100 - 2 * pad)) / 100, c: GOLD },
  ];
}

function svg(sh: Shape[]): string {
  const body = sh
    .map((x) =>
      x.k === 'rect'
        ? `<rect x="${x.x}" y="${x.y}" width="${x.w}" height="${x.h}" rx="${x.r ?? 0}" fill="${hex(x.c)}"/>`
        : x.k === 'circle'
          ? `<circle cx="${x.x}" cy="${x.y}" r="${x.r}" fill="${hex(x.c)}"/>`
          : `<polygon points="${x.pts.map((p) => p.join(',')).join(' ')}" fill="${hex(x.c)}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
}

function inside(sh: Shape, x: number, y: number): boolean {
  if (sh.k === 'circle') return (x - sh.x) ** 2 + (y - sh.y) ** 2 <= sh.r ** 2;
  if (sh.k === 'rect') {
    if (x < sh.x || x > sh.x + sh.w || y < sh.y || y > sh.y + sh.h) return false;
    const r = sh.r ?? 0;
    const cx = Math.max(sh.x + r, Math.min(sh.x + sh.w - r, x));
    const cy = Math.max(sh.y + r, Math.min(sh.y + sh.h - r, y));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  }
  let c = false;
  const p = sh.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++)
    if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}

function raster(sh: Shape[], size: number): Buffer {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4; // élsimítás: 4×4 minta pixelenként
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const ux = ((x + (sx + 0.5) / SS) / size) * 100;
          const uy = ((y + (sy + 0.5) / SS) / size) * 100;
          let col: RGBA = [0, 0, 0, 255];
          for (const s of sh) if (inside(s, ux, uy)) col = s.c;
          r += col[0];
          g += col[1];
          b += col[2];
        }
      const i = (y * size + x) * 4;
      px[i] = r / (SS * SS);
      px[i + 1] = g / (SS * SS);
      px[i + 2] = b / (SS * SS);
      px[i + 3] = 255;
    }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function png(size: number, rgba: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = 'public/icons';
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/icon.svg`, svg(shapes(0)));
for (const [name, size, pad] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  ['icon-maskable-512.png', 512, 12],
] as const) {
  writeFileSync(`${out}/${name}`, png(size, raster(shapes(pad), size)));
  console.log(`${out}/${name}`);
}
