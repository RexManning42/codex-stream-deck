import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return out;
}

function png(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const offset = y * stride + 1 + x * 4;
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      const key = ((x > size * .18 && x < size * .42) || (x > size * .58 && x < size * .82)) && y > size * .25 && y < size * .75;
      raw[offset] = key ? 78 : 20 + Math.floor(22 * x / size);
      raw[offset + 1] = key ? 226 : 28 + Math.floor(28 * y / size);
      raw[offset + 2] = key ? 196 : 35 + Math.floor(30 * x / size);
      raw[offset + 3] = edge < size * .06 ? Math.max(0, Math.floor(255 * edge / (size * .06))) : 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

for (const [name, size] of [["plugin-icon.png", 256], ["plugin-icon@2x.png", 512]]) {
  const path = resolve("static/imgs", name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png(size));
}
