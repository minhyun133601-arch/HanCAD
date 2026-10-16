/**
 * File System Access API handles for the user's own support files (acad.pgp and a
 * synonym list), kept in IndexedDB so REINIT can re-read the file on disk.
 * Every operation is best effort: without the API or storage HanCAD keeps a copy.
 */
export interface SupportFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  createWritable?(): Promise<{ write(data: BufferSource): Promise<void>; close(): Promise<void> }>;
}
type OpenFilePicker = (options?: {
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SupportFileHandle[]>;

export function filePicker(): OpenFilePicker | undefined {
  const picker = (globalThis as { showOpenFilePicker?: OpenFilePicker }).showOpenFilePicker;
  return typeof picker === 'function' ? picker.bind(globalThis) : undefined;
}

/** Asks for read or write access; a REINIT or OK click supplies the user activation. */
export async function permitted(
  handle: SupportFileHandle,
  mode: 'read' | 'readwrite',
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  return (await handle.requestPermission({ mode })) === 'granted';
}

const database = 'hancad-support-files';
const store = 'handles';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
}
async function transact<Result>(
  mode: IDBTransactionMode,
  run: (objects: IDBObjectStore) => IDBRequest<Result>,
): Promise<Result> {
  const db = await open();
  try {
    return await new Promise<Result>((resolve, reject) => {
      const request = run(db.transaction(store, mode).objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  } finally {
    db.close();
  }
}

export async function saveHandle(
  key: string,
  handle: SupportFileHandle | undefined,
): Promise<void> {
  try {
    if (handle) await transact('readwrite', (objects) => objects.put(handle, key));
    else await transact('readwrite', (objects) => objects.delete(key));
  } catch {
    // Handles that cannot be stored (or a blocked IndexedDB) stay session-only.
  }
}

export async function loadHandle(key: string): Promise<SupportFileHandle | undefined> {
  try {
    const value: unknown = await transact('readonly', (objects) => objects.get(key));
    return value && typeof (value as SupportFileHandle).getFile === 'function'
      ? (value as SupportFileHandle)
      : undefined;
  } catch {
    return undefined;
  }
}
