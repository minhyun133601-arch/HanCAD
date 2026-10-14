import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Original geometric HanCAD icon. The SVG is the editable design source.
const side = 256;
const stride = side * 4 + 1;
const pixels = Buffer.alloc(stride * side);
const palette = {
  background: [33, 40, 48, 255],
  grid: [53, 66, 80, 255],
  letter: [233, 242, 248, 255],
  dimension: [53, 184, 255, 255],
};
function contains(x, y, x1, y1, x2, y2, width) {
  return x >= x1 - width / 2 && x <= x2 + width / 2 && y >= y1 - width / 2 && y <= y2 + width / 2;
}
for (let y = 0; y < side; y++) {
  for (let x = 0; x < side; x++) {
    const px = (x + 0.5) / 4;
    const py = (y + 0.5) / 4;
    const rounded = Math.hypot(Math.max(12 - px, 0, px - 52), Math.max(12 - py, 0, py - 52)) <= 12;
    let color = rounded ? palette.background : [0, 0, 0, 0];
    if (rounded) {
      for (const coordinate of [16, 32, 48]) {
        if (
          contains(px, py, 12, coordinate, 52, coordinate, 1) ||
          contains(px, py, coordinate, 12, coordinate, 52, 1)
        )
          color = palette.grid;
      }
      if (
        contains(px, py, 22, 18, 22, 46, 5) ||
        contains(px, py, 42, 18, 42, 46, 5) ||
        contains(px, py, 22, 32, 42, 32, 5)
      )
        color = palette.letter;
      if (
        contains(px, py, 17, 53, 47, 53, 2) ||
        contains(px, py, 17, 50, 17, 56, 2) ||
        contains(px, py, 47, 50, 47, 56, 2)
      )
        color = palette.dimension;
    }
    pixels.set(color, y * stride + 1 + x * 4);
  }
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const head = Buffer.alloc(4);
  const tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(side, 0);
header.writeUInt32BE(side, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
]);
const directory = new URL('./src-tauri/icons/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('icon.png', directory), png);
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png.length, 14);
icoHeader.writeUInt32LE(22, 18);
writeFileSync(new URL('icon.ico', directory), Buffer.concat([icoHeader, png]));
