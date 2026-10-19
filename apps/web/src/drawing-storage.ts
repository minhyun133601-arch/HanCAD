import { createEmptyCadState } from '@hancad/legacy-bridge';
import { cachedDimensionStyle } from './dimension-style';
import { cachedDraftingVariables } from './drafting-variables';
import { parseDrawingSession } from './drawing-session';
import type { DrawingSession } from './drawing-session';
import { endTemporaryObjectIsolation } from './temporary-object-isolation';
export { parseDrawingSession } from './drawing-session';
export type { DrawingSession } from './drawing-session';

export const drawingStorageKey = 'hancad.active-drawing.v1';
export const drawingViewVariable = 'HANCAD_VIEW_STATE';
const cacheLocationKey = 'hancad.active-drawing.location.v1';
type CacheLocation = 'local' | 'pending' | 'indexed' | 'failed';
const cacheChunkLength = 512 * 1024;
export function restoreDrawing(): {
  drawing: DrawingSession;
  restored: boolean;
  failed: boolean;
  identityMigrated: boolean;
} {
  const empty = {
    state: createEmptyCadState(),
    report: null,
    fileName: '',
    documentId: crypto.randomUUID(),
  };
  try {
    const stored = localStorage.getItem(drawingStorageKey);
    return stored
      ? { ...restoreCachedDrawingSession(stored), restored: true, failed: false }
      : { drawing: empty, restored: false, failed: false, identityMigrated: false };
  } catch {
    return { drawing: empty, restored: false, failed: true, identityMigrated: false };
  }
}

export function restoreCachedDrawingSession(serialized: string): {
  drawing: DrawingSession;
  identityMigrated: boolean;
} {
  const drawing = endTemporaryObjectIsolation(parseDrawingSession(serialized));
  const dimensionStyle = cachedDimensionStyle(drawing.dimensionStyle, drawing.documentId);
  const draftingVariables = cachedDraftingVariables(drawing.draftingVariables, drawing.documentId);
  return {
    drawing: {
      ...drawing,
      documentId: drawing.documentId ?? crypto.randomUUID(),
      ...(dimensionStyle ? { dimensionStyle } : {}),
      ...(draftingVariables ? { draftingVariables } : {}),
    },
    identityMigrated: !drawing.documentId,
  };
}

export function getDrawingCacheLocation(): CacheLocation | undefined {
  try {
    const value = localStorage.getItem(cacheLocationKey);
    return value === 'local' || value === 'pending' || value === 'indexed' || value === 'failed'
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function setDrawingCacheLocation(value: CacheLocation): void {
  try {
    localStorage.setItem(cacheLocationKey, value);
  } catch {
    // IndexedDB remains usable when only Web Storage is denied.
  }
}

async function drawingCacheRequest(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
  readResult: (request: IDBRequest) => unknown = (request) => request.result,
): Promise<unknown> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('hancad-drawing-cache', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drawings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local drawing cache is blocked.'));
  });
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction('drawings', mode);
      const request = operation(transaction.objectStore('drawings'));
      transaction.oncomplete = () => {
        database.close();
        try {
          resolve(readResult(request));
        } catch (error) {
          reject(error);
        }
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? request.error ?? new Error('Local drawing cache failed.'));
      };
    } catch (error) {
      database.close();
      reject(error);
    }
  });
}

export async function readIndexedDrawing(): Promise<string | null> {
  let value: string | null = null;
  let length: number | undefined;
  const parts: string[] = [];
  await drawingCacheRequest('readonly', (store) => {
    const manifest = store.get('active');
    manifest.onsuccess = () => {
      const stored: unknown = manifest.result;
      if (stored === undefined) return;
      if (typeof stored === 'string') {
        value = stored;
        return;
      }
      if (
        typeof stored !== 'object' ||
        stored === null ||
        !('version' in stored) ||
        stored.version !== 2 ||
        !('chunks' in stored) ||
        typeof stored.chunks !== 'number' ||
        !Number.isSafeInteger(stored.chunks) ||
        stored.chunks < 1 ||
        stored.chunks > 4096 ||
        !('length' in stored) ||
        typeof stored.length !== 'number' ||
        !Number.isSafeInteger(stored.length) ||
        stored.length < 1 ||
        Math.ceil(stored.length / cacheChunkLength) !== stored.chunks
      ) {
        store.transaction.abort();
        return;
      }
      length = stored.length;
      for (let index = 0; index < stored.chunks; index++) {
        const chunk = store.get(`chunk:${index}`);
        chunk.onsuccess = () => {
          if (typeof chunk.result !== 'string') store.transaction.abort();
          else parts[index] = chunk.result;
        };
      }
    };
    return manifest;
  });
  if (length === undefined) return value;
  const serialized = parts.join('');
  if (serialized.length !== length) throw new Error('Incomplete local drawing cache.');
  return serialized;
}

export async function writeIndexedDrawing(serialized: string): Promise<void> {
  await drawingCacheRequest('readwrite', (store) => {
    const clear = store.clear();
    clear.onsuccess = () => {
      if (serialized.length <= cacheChunkLength) {
        try {
          store.put(serialized, 'active');
        } catch {
          store.transaction.abort();
        }
        return;
      }
      const chunks = Math.ceil(serialized.length / cacheChunkLength);
      function next(index: number): void {
        try {
          if (index === chunks) {
            store.put({ version: 2, length: serialized.length, chunks }, 'active');
            return;
          }
          // Queue one chunk at a time to avoid cloning the entire large payload at once.
          const chunk = store.put(
            serialized.slice(index * cacheChunkLength, (index + 1) * cacheChunkLength),
            `chunk:${index}`,
          );
          chunk.onsuccess = () => next(index + 1);
        } catch {
          store.transaction.abort();
        }
      }
      next(0);
    };
    return clear;
  });
}

export async function deleteIndexedDrawing(): Promise<void> {
  await drawingCacheRequest('readwrite', (store) => store.clear());
}
