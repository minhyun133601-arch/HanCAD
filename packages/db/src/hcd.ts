import { DrawingDatabase } from './database';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const magic = { local: 0x04034b50, central: 0x02014b50, end: 0x06054b50 };

/** Standard ZIP with stored entries, UTF-8 filenames and CRC32; all work stays local. */
export function serializeHcd(
  database: DrawingDatabase,
  blobs: ReadonlyMap<string, Uint8Array> = new Map(),
): Uint8Array {
  const entries = [
    { name: 'database.json', data: encoder.encode(database.serialize()) },
    ...[...blobs].map(([name, data]) => ({ name: `blobs/${validateBlobName(name)}`, data })),
  ];
  if (entries.length > 65535) throw new Error('HCD ZIP64 is not supported.');
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    if (name.length > 65535 || entry.data.length > 0xffffffff)
      throw new Error('HCD entry exceeds ZIP limits.');
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, magic.local, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    const directory = new Uint8Array(46 + name.length);
    const centralView = new DataView(directory.buffer);
    centralView.setUint32(0, magic.central, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x800, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    directory.set(name, 46);
    chunks.push(local, entry.data);
    central.push(directory);
    offset += local.length + entry.data.length;
  }
  const directorySize = central.reduce((total, chunk) => total + chunk.length, 0);
  if (offset + directorySize > 0xffffffff) throw new Error('HCD ZIP64 is not supported.');
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, magic.end, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  return concatenate([...chunks, ...central, end]);
}

export function deserializeHcd(data: Uint8Array): {
  database: DrawingDatabase;
  blobs: ReadonlyMap<string, Uint8Array>;
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 22 || view.getUint32(data.length - 22, true) !== magic.end)
    throw new Error('Invalid HCD ZIP container.');
  const endOffset = data.length - 22;
  const count = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (
    view.getUint16(endOffset + 4, true) !== 0 ||
    view.getUint16(endOffset + 6, true) !== 0 ||
    view.getUint16(endOffset + 8, true) !== count ||
    centralOffset + centralSize !== endOffset
  )
    throw new Error('Unsupported multi-disk or corrupt HCD container.');
  let offset = centralOffset;
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index++) {
    requireRange(offset, 46, endOffset);
    if (view.getUint32(offset, true) !== magic.central) throw new Error('Invalid HCD directory.');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (flags !== 0x800 || method !== 0 || compressed !== size)
      throw new Error('HCD supports only stored, unencrypted UTF-8 ZIP entries.');
    requireRange(offset + 46, nameLength + extraLength + commentLength, endOffset);
    const nameBytes = data.subarray(offset + 46, offset + 46 + nameLength);
    const name = decoder.decode(nameBytes);
    requireRange(localOffset, 30, centralOffset);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    if (
      view.getUint32(localOffset, true) !== magic.local ||
      view.getUint16(localOffset + 6, true) !== flags ||
      view.getUint16(localOffset + 8, true) !== method ||
      view.getUint32(localOffset + 14, true) !== crc ||
      view.getUint32(localOffset + 18, true) !== size ||
      view.getUint32(localOffset + 22, true) !== size
    )
      throw new Error('HCD local entry disagrees with its directory.');
    const contentOffset = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(localOffset + 30, localNameLength + localExtraLength + size, centralOffset);
    if (
      decoder.decode(data.subarray(localOffset + 30, localOffset + 30 + localNameLength)) !== name
    )
      throw new Error('HCD filename mismatch.');
    const content = data.slice(contentOffset, contentOffset + size);
    if (crc32(content) !== crc) throw new Error(`HCD checksum failed: ${name}`);
    if (entries.has(name)) throw new Error(`Duplicate HCD entry: ${name}`);
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== endOffset) throw new Error('HCD directory size mismatch.');
  const json = entries.get('database.json');
  if (!json) throw new Error('HCD database.json is missing.');
  const blobs = new Map<string, Uint8Array>();
  for (const [name, content] of entries) {
    if (name === 'database.json') continue;
    if (!name.startsWith('blobs/')) throw new Error(`Unknown HCD entry: ${name}`);
    blobs.set(validateBlobName(name.slice(6)), content);
  }
  return { database: DrawingDatabase.deserialize(decoder.decode(json)), blobs };
}

function validateBlobName(name: string): string {
  if (
    !name ||
    name.startsWith('/') ||
    name.includes('\\') ||
    name.split('/').some((part) => part === '' || part === '..' || part === '.') ||
    /[\x00-\x1f:]/.test(name)
  )
    throw new Error(`Invalid HCD blob name: ${name}`);
  return name;
}
function requireRange(offset: number, length: number, limit: number): void {
  if (offset < 0 || length < 0 || offset + length > limit)
    throw new Error('Truncated HCD container.');
}
function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
