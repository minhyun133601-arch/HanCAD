import { DrawingDatabase, EventBus, deserializeHcd, serializeHcd } from '@hancad/db';
import { SystemVariableProfile, SystemVariables } from './variables';
import type { SysvarValue } from './registry';
import { calendarDate, elapsedDays, localJulianDate, universalJulianDate } from './clock';

export interface DrawingDocument {
  id: string;
  name: string;
  titled: boolean;
  notice?: 'restored' | 'opened';
  database: DrawingDatabase;
  sysvars: SystemVariables;
  blobs: Map<string, Uint8Array>;
}

export type DocumentEvent =
  | {
      type: 'document-created' | 'document-activated' | 'document-closed' | 'document-renamed';
      document: DrawingDocument;
    }
  | { type: 'documents-empty' };

export interface DocumentManagerOptions {
  /** Injected for deterministic tests; defaults to the local system clock. */
  clock?: () => Date;
  /** Host facts (view, screen, locale, extents) supplied by the running shell. */
  hostValue?: (document: DrawingDocument, name: string) => SysvarValue | undefined;
}

const localTimes = ['TDCREATE', 'TDUPDATE'] as const;
const universalTimes = ['TDUCREATE', 'TDUUPDATE'] as const;
const timerVariables = ['TDINDWG', 'TDUSRTIMER'] as const;

export class DocumentManager {
  readonly events = new EventBus<DocumentEvent>();
  readonly profile = new SystemVariableProfile();
  private readonly documents = new Map<string, DrawingDocument>();
  private readonly sessionStarts = new Map<string, number>();
  private readonly clock: () => Date;
  private readonly hostValue: DocumentManagerOptions['hostValue'];
  private serial = 0;
  private activeId: string | undefined;

  constructor(options: DocumentManagerOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.hostValue = options.hostValue;
  }

  get active(): DrawingDocument | undefined {
    return this.activeId === undefined ? undefined : this.documents.get(this.activeId);
  }
  get all(): readonly DrawingDocument[] {
    return [...this.documents.values()];
  }

  create(
    database = new DrawingDatabase(),
    name?: string,
    blobs: ReadonlyMap<string, Uint8Array> = new Map(),
    notice?: DrawingDocument['notice'],
    titled = name !== undefined,
  ): DrawingDocument {
    const serial = ++this.serial;
    let drawingNumber = serial;
    while (this.all.some((entry) => entry.name === `Drawing${drawingNumber}.dwg`)) drawingNumber++;
    const document: DrawingDocument = {
      id: `drawing-${serial}`,
      name: name ?? `Drawing${drawingNumber}.dwg`,
      titled,
      ...(notice ? { notice } : {}),
      database,
      sysvars: new SystemVariables({
        database,
        profile: this.profile,
        runtimeValue: (name) => this.runtimeValue(document, name),
      }),
      blobs: new Map([...blobs].map(([key, value]) => [key, new Uint8Array(value)])),
    };
    this.initializeTimes(database);
    this.sessionStarts.set(document.id, this.clock().getTime());
    this.documents.set(document.id, document);
    this.events.publish({ type: 'document-created', document });
    this.activate(document.id);
    return document;
  }

  rename(id: string, name: string): void {
    const document = this.documents.get(id);
    if (!document) throw new Error(`Unknown document: ${id}`);
    if (!name.trim()) throw new Error('A document name is required.');
    document.name = name;
    document.titled = true;
    this.events.publish({ type: 'document-renamed', document });
  }

  openHcd(bytes: Uint8Array, name: string): DrawingDocument {
    // Decode and validate completely before changing the active document.
    const loaded = deserializeHcd(bytes);
    return this.create(loaded.database, name, loaded.blobs, 'opened');
  }

  saveHcd(id: string): Uint8Array {
    const document = this.documents.get(id);
    if (!document) throw new Error(`Unknown document: ${id}`);
    this.recordSave(document);
    return serializeHcd(document.database, document.blobs);
  }

  /** A save stamps TDUPDATE/TDUUPDATE and folds this session's editing time into the timers. */
  recordSave(document: DrawingDocument): void {
    const now = this.clock();
    const started = this.sessionStarts.get(document.id) ?? now.getTime();
    for (const name of timerVariables)
      document.database.writeUntrackedVariable(
        name,
        storedNumber(document.database, name) + elapsedDays(started, now.getTime()),
      );
    document.database.writeUntrackedVariable('TDUPDATE', localJulianDate(now));
    document.database.writeUntrackedVariable('TDUUPDATE', universalJulianDate(now));
    this.sessionStarts.set(document.id, now.getTime());
  }

  activate(id: string): void {
    const document = this.documents.get(id);
    if (!document) throw new Error(`Unknown document: ${id}`);
    this.activeId = id;
    this.events.publish({ type: 'document-activated', document });
  }

  close(id: string): void {
    const document = this.documents.get(id);
    if (!document) throw new Error(`Unknown document: ${id}`);
    this.documents.delete(id);
    this.sessionStarts.delete(id);
    document.sysvars.dispose();
    this.events.publish({ type: 'document-closed', document });
    if (this.activeId === id) {
      this.activeId = undefined;
      const last = this.all.at(-1);
      if (last) this.activate(last.id);
      else this.events.publish({ type: 'documents-empty' });
    }
  }

  private runtimeValue(document: DrawingDocument, name: string): SysvarValue | undefined {
    const now = this.clock();
    switch (name) {
      case 'DATE':
        return localJulianDate(now);
      case 'CDATE':
        return calendarDate(now);
      case 'DWGNAME':
        return document.name;
      case 'DWGPREFIX':
        return '';
      case 'DWGTITLED':
        return document.titled ? 1 : 0;
      case 'UCSNAME':
        return '';
      case 'TDINDWG':
      case 'TDUSRTIMER':
        return (
          storedNumber(document.database, name) +
          elapsedDays(this.sessionStarts.get(document.id) ?? now.getTime(), now.getTime())
        );
      default:
        return this.hostValue?.(document, name);
    }
  }

  /** New drawings are stamped once; opened drawings keep their saved times. */
  private initializeTimes(database: DrawingDatabase): void {
    if (typeof database.getVariable('TDCREATE') === 'number') return;
    const now = this.clock();
    const local = localJulianDate(now),
      universal = universalJulianDate(now);
    for (const name of localTimes) database.writeUntrackedVariable(name, local);
    for (const name of universalTimes) database.writeUntrackedVariable(name, universal);
    for (const name of timerVariables) database.writeUntrackedVariable(name, 0);
  }
}

function storedNumber(database: DrawingDatabase, name: string): number {
  const value = database.getVariable(name);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
