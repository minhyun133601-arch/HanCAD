import { DrawingDatabase, EventBus } from '@hancad/db';
import { SystemVariableProfile, SystemVariables } from './variables';

export interface DrawingDocument {
  id: string;
  name: string;
  database: DrawingDatabase;
  sysvars: SystemVariables;
}

export type DocumentEvent =
  | {
      type: 'document-created' | 'document-activated' | 'document-closed';
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

  create(database = new DrawingDatabase(), name?: string): DrawingDocument {
    const serial = ++this.serial;
    const document: DrawingDocument = {
      id: `drawing-${serial}`,
      name: name ?? `Drawing${serial}.dwg`,
      database,
      sysvars: new SystemVariables({ database, profile: this.profile }),
    };
    this.documents.set(document.id, document);
    this.events.publish({ type: 'document-created', document });
    this.activate(document.id);
    return document;
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
