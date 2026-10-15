import { getCadImportDiagnostic, isCadImportDiagnostic } from '@hancad/legacy-bridge';
import type {
  CadGeometryReason,
  CadImportDiagnostic,
  CadImportPlainCode,
} from '@hancad/legacy-bridge';

export interface CadImportMessages {
  plain: Readonly<Record<CadImportPlainCode, string>>;
  geometry: Readonly<Record<CadGeometryReason, string>>;
  progress: Readonly<Record<'file-reading' | 'dwg-converting' | 'entities-importing', string>>;
  preparing: (entities: number, layers: number, blocks: number) => string;
  groupCode: (line: number) => string;
  invalidNumber: (line: number) => string;
  structure: Readonly<Record<'SECTION' | 'ENDSEC' | 'EOF-after' | 'complete', string>>;
  entityLimit: (limit: number) => string;
  layerLimit: (limit: number) => string;
  dwgDecodeFailed: (detail: string) => string;
  dwgEngineFailed: (detail: string) => string;
  dwgVersion: (version: string) => string;
  blockReference: (name: string) => string;
  entitySkipped: (type: string, reason: string) => string;
}

export function formatCadImportDiagnostic(
  diagnostic: CadImportDiagnostic,
  messages: CadImportMessages,
): string {
  switch (diagnostic.code) {
    case 'file-reading':
    case 'dwg-converting':
    case 'entities-importing':
      return messages.progress[diagnostic.code];
    case 'entities-preparing':
      return messages.preparing(diagnostic.sourceEntities, diagnostic.layers, diagnostic.blocks);
    case 'dxf-group-code':
      return messages.groupCode(diagnostic.line);
    case 'dxf-number':
      return messages.invalidNumber(diagnostic.line);
    case 'dxf-structure':
      return messages.structure[diagnostic.part];
    case 'entity-limit':
      return messages.entityLimit(diagnostic.limit);
    case 'layer-limit':
      return messages.layerLimit(diagnostic.limit);
    case 'invalid-geometry':
      return messages.geometry[diagnostic.reason];
    case 'dwg-decode-failed':
      return messages.dwgDecodeFailed(diagnostic.detail);
    case 'dwg-engine-failed':
      return messages.dwgEngineFailed(diagnostic.detail);
    case 'dwg-version':
      return messages.dwgVersion(diagnostic.version);
    case 'block-reference':
      return messages.blockReference(diagnostic.name);
    case 'entity-skipped':
      return messages.entitySkipped(
        diagnostic.entityType,
        typeof diagnostic.reason === 'string'
          ? diagnostic.reason
          : formatCadImportDiagnostic(diagnostic.reason, messages),
      );
    default:
      return messages.plain[diagnostic.code];
  }
}

/** Unknown third-party errors keep their original diagnostic without keyword translation. */
export function formatCadImportError(
  error: unknown,
  messages: CadImportMessages,
): string | undefined {
  const diagnostic = getCadImportDiagnostic(error);
  return diagnostic ? formatCadImportDiagnostic(diagnostic, messages) : undefined;
}
export function formatCadImportWarning(
  fallback: string,
  diagnostic: unknown,
  messages: CadImportMessages,
): string {
  return isCadImportDiagnostic(diagnostic)
    ? formatCadImportDiagnostic(diagnostic, messages)
    : fallback;
}
