import { decodeSupportText } from '@hancad/input';
import type { SupportTextEncoding } from '@hancad/input';
import { filePicker, loadHandle, permitted, saveHandle } from './support-file-handles';
import type { SupportFileHandle } from './support-file-handles';

/** acad.pgp (aliases and external commands) and the synonym list. */
export type PgpKind = 'aliases' | 'synonyms';
export interface PgpFile {
  name: string;
  text: string;
  encoding: SupportTextEncoding;
}
export type PgpReload =
  { status: 'reloaded' | 'copy' | 'none' } | { status: 'denied' | 'failed'; name: string };

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
const storageKey = 'hancad.user-pgp.v1';
const kinds: readonly PgpKind[] = ['aliases', 'synonyms'];

function validFile(value: unknown): PgpFile | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { name, text, encoding } = value as Partial<PgpFile>;
  return typeof name === 'string' && typeof text === 'string'
    ? { name, text, encoding: encoding === 'cp949' ? 'cp949' : 'utf-8' }
    : undefined;
}

/**
 * The user's PGP files for the profile, shared by every open drawing. A copy is kept
 * in browser storage; when the browser can keep a file handle, REINIT re-reads the
 * file itself and ALIASEDIT writes it back (UTF-8).
 */
export class PgpStore {
  private readonly files = new Map<PgpKind, PgpFile>();
  private readonly handles = new Map<PgpKind, SupportFileHandle>();
  private removedAliases: string[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage?: Storage) {
    try {
      const raw = (storage ?? localStorage).getItem(storageKey);
      const stored: unknown = raw ? JSON.parse(raw) : undefined;
      if (typeof stored === 'object' && stored !== null) {
        const record = stored as Record<string, unknown>;
        for (const kind of kinds) {
          const file = validFile(record[kind]);
          if (file) this.files.set(kind, file);
        }
        if (Array.isArray(record.removed))
          this.removedAliases = record.removed.filter(
            (alias): alias is string => typeof alias === 'string' && /^[-\w.]+$/.test(alias),
          );
      }
    } catch {
      // A missing or corrupt copy leaves the built-in aliases in effect.
    }
  }

  /** Restores remembered file handles after a restart. */
  async restoreHandles(): Promise<void> {
    for (const kind of kinds) {
      const handle = await loadHandle(kind);
      if (handle && this.files.has(kind)) this.handles.set(kind, handle);
    }
    this.notify();
  }

  file(kind: PgpKind): PgpFile | undefined {
    return this.files.get(kind);
  }
  linked(kind: PgpKind): boolean {
    return this.handles.has(kind);
  }
  get removed(): readonly string[] {
    return this.removedAliases;
  }
  get canPick(): boolean {
    return filePicker() !== undefined;
  }

  /** Opens the system file picker; false when the user cancels. */
  async pick(kind: PgpKind): Promise<boolean> {
    const picker = filePicker();
    if (!picker) return false;
    let handle: SupportFileHandle | undefined;
    try {
      [handle] = await picker({
        types: [{ description: 'Program parameters (*.pgp)', accept: { 'text/plain': ['.pgp'] } }],
      });
    } catch {
      return false;
    }
    if (!handle) return false;
    await this.load(kind, await handle.getFile(), handle);
    return true;
  }

  /** Reads a chosen file; without a handle only the stored copy can be reloaded. */
  async load(
    kind: PgpKind,
    file: Blob & { name: string },
    handle?: SupportFileHandle,
  ): Promise<void> {
    const decoded = decodeSupportText(new Uint8Array(await file.arrayBuffer()));
    this.files.set(kind, { name: file.name, ...decoded });
    if (handle) this.handles.set(kind, handle);
    else this.handles.delete(kind);
    await saveHandle(kind, handle);
    this.persist();
    this.notify();
  }

  /** REINIT: re-reads the linked file, or reapplies the stored copy. */
  async reload(kind: PgpKind = 'aliases'): Promise<PgpReload> {
    const current = this.files.get(kind);
    const handle = this.handles.get(kind);
    if (!current) return { status: 'none' };
    if (!handle) {
      this.notify();
      return { status: 'copy' };
    }
    try {
      if (!(await permitted(handle, 'read'))) return { status: 'denied', name: current.name };
      const file = await handle.getFile();
      const decoded = decodeSupportText(new Uint8Array(await file.arrayBuffer()));
      this.files.set(kind, { name: current.name, ...decoded });
      this.persist();
      this.notify();
      return { status: 'reloaded' };
    } catch {
      return { status: 'failed', name: current.name };
    }
  }

  /** ALIASEDIT: stores edited text and writes it back to a linked file. */
  async save(
    kind: PgpKind,
    text: string,
    removed?: readonly string[],
  ): Promise<'written' | 'copy' | 'denied'> {
    const current = this.files.get(kind);
    const name = current?.name ?? (kind === 'aliases' ? 'acad.pgp' : 'acadSynonymsGlobalDB.pgp');
    this.files.set(kind, { name, text, encoding: 'utf-8' });
    if (removed) this.removedAliases = [...new Set(removed.map((alias) => alias.toUpperCase()))];
    this.persist();
    this.notify();
    const handle = this.handles.get(kind);
    if (!handle?.createWritable) return 'copy';
    try {
      if (!(await permitted(handle, 'readwrite'))) return 'denied';
      const writable = await handle.createWritable();
      await writable.write(new TextEncoder().encode(text));
      await writable.close();
      return 'written';
    } catch {
      return 'denied';
    }
  }

  /** Forgets the user's file; the built-in aliases apply again. */
  clear(kind: PgpKind): void {
    this.files.delete(kind);
    this.handles.delete(kind);
    if (kind === 'aliases') this.removedAliases = [];
    void saveHandle(kind, undefined);
    this.persist();
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(): void {
    for (const listener of this.listeners) listener();
  }
  private persist(): void {
    try {
      (this.storage ?? localStorage).setItem(
        storageKey,
        JSON.stringify({
          aliases: this.files.get('aliases'),
          synonyms: this.files.get('synonyms'),
          removed: this.removedAliases,
        }),
      );
    } catch {
      // The files stay in memory for this session when storage is unavailable.
    }
  }
}

let shared: PgpStore | undefined;
export function pgpStore(): PgpStore {
  if (!shared) {
    shared = new PgpStore();
    void shared.restoreHandles();
  }
  return shared;
}
