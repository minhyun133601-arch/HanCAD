import { isCadImportDiagnostic, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadImportReport, LegacyCadState } from '@hancad/legacy-bridge';
import { restoreDimensionStyle } from './dimension-style';
import type { DimensionStyleValues } from './dimension-style';
import { restoreDraftingVariables } from './drafting-variables';
import type { DraftingVariableValues } from './drafting-variables';
import { DrawingDatabase } from '@hancad/db';
import type { DatabaseSnapshot } from '@hancad/db';

/** The app and renderer treat validated sessions as immutable replacement snapshots. */
export interface DrawingSession {
  documentId?: string;
  state: LegacyCadState;
  report: CadImportReport | null;
  fileName: string;
  dimensionStyle?: DimensionStyleValues;
  draftingVariables?: DraftingVariableValues;
  nativeDatabase?: DatabaseSnapshot;
  nativeBlobs?: { name: string; data: number[] }[];
  nativeTitled?: boolean;
}

function restoreReport(value: unknown): CadImportReport | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw new Error('Invalid stored import report.');
  const record = value as Record<string, unknown>;
  if (
    typeof record.format !== 'string' ||
    typeof record.version !== 'string' ||
    !['imported', 'sourceEntities', 'skipped', 'approximated'].every(
      (key) =>
        typeof record[key] === 'number' &&
        Number.isFinite(record[key]) &&
        (record[key] as number) >= 0,
    ) ||
    !Array.isArray(record.warnings) ||
    !record.warnings.every((item: unknown) => typeof item === 'string') ||
    !Array.isArray(record.unsupported) ||
    !record.unsupported.every((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false;
      const entry = item as Record<string, unknown>;
      return (
        typeof entry.type === 'string' &&
        typeof entry.count === 'number' &&
        Number.isFinite(entry.count) &&
        entry.count >= 0
      );
    })
  )
    throw new Error('Invalid stored import report.');
  if (
    record.warningDiagnostics !== undefined &&
    (!Array.isArray(record.warningDiagnostics) ||
      record.warningDiagnostics.length !== record.warnings.length ||
      !record.warningDiagnostics.every(
        (item: unknown) => item === null || isCadImportDiagnostic(item),
      ))
  )
    throw new Error('Invalid stored import diagnostics.');
  return structuredClone(value as CadImportReport);
}

/** Identical validation for parsed caches and direct command commits; never drops invalid entities. */
export function normalizeDrawingSession(value: unknown): DrawingSession {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('fileName' in value) ||
    typeof value.fileName !== 'string' ||
    !('state' in value)
  )
    throw new Error('Invalid stored drawing.');
  const dimensionStyle = restoreDimensionStyle(
    'dimensionStyle' in value ? value.dimensionStyle : undefined,
  );
  const draftingVariables = restoreDraftingVariables(
    'draftingVariables' in value ? value.draftingVariables : undefined,
  );
  if ('documentId' in value && (typeof value.documentId !== 'string' || !value.documentId.length))
    throw new Error('Invalid stored drawing identity.');
  let nativeDatabase: DatabaseSnapshot | undefined;
  if ('nativeTitled' in value && typeof value.nativeTitled !== 'boolean')
    throw new Error('Invalid native drawing title state.');
  if ('nativeDatabase' in value) {
    nativeDatabase = DrawingDatabase.deserialize(JSON.stringify(value.nativeDatabase)).snapshot();
    if (nativeDatabase.drawingVariables.HANCAD_VIEW_STATE !== undefined)
      throw new Error('Recursive native drawing cache.');
  }
  let nativeBlobs: DrawingSession['nativeBlobs'];
  if ('nativeBlobs' in value) {
    const blobs = value.nativeBlobs;
    if (
      !Array.isArray(blobs) ||
      !blobs.every((blob: unknown) => {
        if (
          typeof blob !== 'object' ||
          blob === null ||
          !('name' in blob) ||
          typeof blob.name !== 'string' ||
          !blob.name ||
          blob.name.split(/[\\/]/).some((part) => part === '..') ||
          !('data' in blob) ||
          !Array.isArray(blob.data)
        )
          return false;
        return blob.data.every(
          (byte: unknown) =>
            typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255,
        );
      })
    )
      throw new Error('Invalid native drawing blobs.');
    nativeBlobs = structuredClone(blobs) as NonNullable<DrawingSession['nativeBlobs']>;
  }
  return {
    state: normalizeCadState(value.state),
    fileName: value.fileName,
    report: restoreReport('report' in value ? value.report : undefined),
    ...(dimensionStyle ? { dimensionStyle } : {}),
    ...(draftingVariables ? { draftingVariables } : {}),
    ...(nativeDatabase ? { nativeDatabase } : {}),
    ...(nativeBlobs ? { nativeBlobs } : {}),
    ...('nativeTitled' in value && typeof value.nativeTitled === 'boolean'
      ? { nativeTitled: value.nativeTitled }
      : {}),
    ...('documentId' in value && typeof value.documentId === 'string'
      ? { documentId: value.documentId }
      : {}),
  };
}

export function parseDrawingSession(json: string): DrawingSession {
  const value: unknown = JSON.parse(json);
  return normalizeDrawingSession(value);
}

/** Reuses one validated graph only while its exact journal string is synchronously published. */
export class DrawingSessionTransfer {
  private pending: { serialized: string; session: DrawingSession } | undefined;

  write(value: unknown, operation: (serialized: string) => void): DrawingSession {
    if (this.pending) throw new Error('Nested drawing commits are not supported.');
    const session = normalizeDrawingSession(value);
    const serialized = JSON.stringify(session);
    this.pending = { serialized, session };
    try {
      operation(serialized);
      return session;
    } finally {
      this.pending = undefined;
    }
  }

  read(serialized: string): DrawingSession {
    return this.pending?.serialized === serialized
      ? this.pending.session
      : parseDrawingSession(serialized);
  }
}

/** Avoids copying/encoding enormous strings for a Web Storage write that cannot fit its quota. */
export function canUseLocalDrawingCache(serialized: string): boolean {
  return serialized.length <= 2 * 1024 * 1024;
}
