import { invoke } from '@tauri-apps/api/core';
import type { DrawingDatabase } from '@hancad/db';
import { drawingBounds, getLegacyRuntime } from '@hancad/legacy-bridge';
import { DRAWING_CLIPBOARD_MIME } from './drawing-clipboard';
import type { DrawingClipboard } from './drawing-clipboard';
import { drawingExportState } from './drawing-export-state';

export interface DrawingClipboardPacket {
  payload: string;
  png: number[];
  dib: number[];
}
export type ClipboardSource = 'system' | 'browser';
const storageKey = 'hancad.drawing-clipboard.v1';

export class DrawingClipboardUnavailableError extends Error {
  constructor() {
    super('System clipboard and persistent browser backup are unavailable.');
    this.name = 'DrawingClipboardUnavailableError';
  }
}

/** One shared store prevents an older backup from shadowing a newer copy. */
async function storedPayload(value?: string): Promise<string | undefined> {
  try {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(storageKey, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('clipboard');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string | undefined>((resolve, reject) => {
        const transaction = database.transaction(
          'clipboard',
          value === undefined ? 'readonly' : 'readwrite',
        );
        const store = transaction.objectStore('clipboard');
        const request = value === undefined ? store.get('drawing') : store.put(value, 'drawing');
        transaction.oncomplete = () =>
          resolve(value ?? (typeof request.result === 'string' ? request.result : undefined));
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  } catch {
    return undefined;
  }
}

export async function drawingClipboardImage(
  payload: DrawingClipboard,
  database: Pick<DrawingDatabase, 'getVariable'>,
): Promise<{ png: number[]; dib: number[] }> {
  const runtime = getLegacyRuntime();
  const imageState = drawingExportState(payload.state, database);
  const bounds = drawingBounds(imageState);
  if (!bounds) throw new Error('Unable to render clipboard image.');
  const width = Math.max(bounds.maxX - bounds.minX, 1),
    height = Math.max(bounds.maxY - bounds.minY, 1),
    scale = Math.min(992 / width, 736 / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale) + 32;
  canvas.height = Math.ceil(height * scale) + 32;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create clipboard image.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(16 - bounds.minX * scale, 16 - bounds.minY * scale);
  context.scale(scale, scale);
  for (const entity of imageState.entities)
    runtime.core.cadExporters.drawEntity(context, entity, {
      state: imageState,
      exporting: true,
      scale,
      unit: payload.state.settings.unit,
    });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const dib = new Uint8Array(40 + pixels.length),
    header = new DataView(dib.buffer);
  header.setUint32(0, 40, true);
  header.setInt32(4, canvas.width, true);
  header.setInt32(8, -canvas.height, true);
  header.setUint16(12, 1, true);
  header.setUint16(14, 32, true);
  header.setUint32(20, pixels.length, true);
  for (let index = 0; index < pixels.length; index += 4) {
    dib[40 + index] = pixels[index + 2]!;
    dib[40 + index + 1] = pixels[index + 1]!;
    dib[40 + index + 2] = pixels[index]!;
    dib[40 + index + 3] = 255;
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('PNG encoding failed.'))),
      'image/png',
    ),
  );
  return { png: Array.from(new Uint8Array(await blob.arrayBuffer())), dib: Array.from(dib) };
}

export async function writeDrawingClipboard(
  payload: DrawingClipboard,
  database: Pick<DrawingDatabase, 'getVariable'>,
): Promise<ClipboardSource> {
  const json = JSON.stringify(payload),
    { png, dib } = await drawingClipboardImage(payload, database);
  if ('__TAURI_INTERNALS__' in window) {
    await invoke('write_drawing_clipboard', { packet: { payload: json, png, dib } });
    return 'system';
  }
  const backup = await storedPayload(json);
  try {
    const text = new Blob([json], { type: 'text/plain' }),
      image = new Blob([new Uint8Array(png)], { type: 'image/png' });
    const custom = `web ${DRAWING_CLIPBOARD_MIME}`;
    const data: Record<string, Blob> = { 'text/plain': text, 'image/png': image };
    if (typeof ClipboardItem.supports === 'function' && ClipboardItem.supports(custom))
      data[custom] = new Blob([json], { type: DRAWING_CLIPBOARD_MIME });
    await navigator.clipboard.write([new ClipboardItem(data)]);
    return 'system';
  } catch {
    // A window-local copy cannot support another window or survive a reload.
    // In particular, CUTCLIP must not erase its source without a durable copy.
    if (backup !== json) throw new DrawingClipboardUnavailableError();
    return 'browser';
  }
}

export async function readDrawingClipboard(): Promise<string | undefined> {
  if ('__TAURI_INTERNALS__' in window) return invoke<string | undefined>('read_drawing_clipboard');
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const custom = `web ${DRAWING_CLIPBOARD_MIME}`;
      for (const type of [custom, DRAWING_CLIPBOARD_MIME, 'text/plain'])
        if (item.types.includes(type)) return (await item.getType(type)).text();
    }
    // An externally replaced clipboard must not resurrect an earlier HanCAD copy.
    return undefined;
  } catch {
    return storedPayload();
  }
}
