import type { DrawingDatabase } from '@hancad/db';
import type { CadReadResult } from '@hancad/legacy-bridge';

type DocumentSource = CadReadResult['source'];
const sources = new WeakMap<DrawingDatabase, DocumentSource>();

/** Original local bytes belong to the document, independently of mounted workspace hooks. */
export function setDocumentSource(database: DrawingDatabase, source?: DocumentSource): void {
  if (source) sources.set(database, source);
  else sources.delete(database);
}
export function getDocumentSource(database: DrawingDatabase): DocumentSource | undefined {
  return sources.get(database);
}
