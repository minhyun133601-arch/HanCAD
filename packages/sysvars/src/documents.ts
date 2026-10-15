import { DrawingDatabase, EventBus, deserializeHcd, serializeHcd } from '@hancad/db';
import { SystemVariableProfile, SystemVariables } from './variables';

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

export class DocumentManager {
  readonly events = new EventBus<DocumentEvent>();
  readonly profile = new SystemVariableProfile();
  private readonly documents = new Map<string, DrawingDocument>();
  private serial = 0;
  private activeId: string | undefined;

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
        runtimeValues: () => ({
          DWGNAME: document.name,
          DWGPREFIX: '',
          DWGTITLED: document.titled ? 1 : 0,
        }),
      }),
      blobs: new Map([...blobs].map(([key, value]) => [key, new Uint8Array(value)])),
    };
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
    return serializeHcd(document.database, document.blobs);
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
    document.sysvars.dispose();
    this.events.publish({ type: 'document-closed', document });
    if (this.activeId === id) {
      this.activeId = undefined;
      const last = this.all.at(-1);
      if (last) this.activate(last.id);
      else this.events.publish({ type: 'documents-empty' });
    }
  }
}
