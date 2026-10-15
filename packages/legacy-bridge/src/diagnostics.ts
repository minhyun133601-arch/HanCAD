/** Stable importer identities are independent of the UI and safe across VM/worker realms. */
export const cadImportPlainCodes = [
  'runtime-unavailable',
  'stored-invalid',
  'stored-entities-invalid',
  'file-size',
  'file-extension',
  'cancelled',
  'binary-dxf',
  'dxf-size',
  'dxf-pairs',
  'no-editable-entities',
  'imported-invalid',
  'dwg-browser-unavailable',
  'dwg-engine-unavailable',
  'dwg-timeout',
  'dwg-signature',
  'dxf-engine-unavailable',
  'curve-approximated',
  'spline-approximated',
  'hidden-skipped',
  'tilted-skipped',
  'blocks-exploded',
  'dimensions-exploded',
  'dimension-skipped',
  'polyline-projected',
  'text-approximated',
  'fill-outlined',
  'hatch-spline-skipped',
  'unsupported-skipped',
  'unit-unspecified',
  'dwg-lossy',
] as const;
export type CadImportPlainCode = (typeof cadImportPlainCodes)[number];
export const cadGeometryReasons = [
  'point',
  'coordinate-range',
  'entity',
  'polyline-vertices',
  'polyline-point',
  'polyline-curve-vertices',
  'ellipse',
  'empty-ellipse',
  'spline',
  'spline-interval',
  'spline-weights',
  'block-transform',
  'circle-radius',
  'arc-angle',
  'text-content-size',
  'text-rotation',
  'hatch-boundary',
  'hatch-visible-boundary',
] as const;
export type CadGeometryReason = (typeof cadGeometryReasons)[number];
type Identity = { namespace: 'cad-import' };
export type CadImportProgressDiagnostic = Identity &
  (
    | { code: 'file-reading' | 'dwg-converting' | 'entities-importing' }
    | { code: 'entities-preparing'; sourceEntities: number; layers: number; blocks: number }
  );
export type CadImportDiagnostic =
  | (Identity &
      (
        | { code: CadImportPlainCode }
        | { code: 'dxf-group-code' | 'dxf-number'; line: number }
        | { code: 'dxf-structure'; part: 'SECTION' | 'ENDSEC' | 'EOF-after' | 'complete' }
        | { code: 'entity-limit' | 'layer-limit'; limit: number }
        | { code: 'invalid-geometry'; reason: CadGeometryReason }
        | { code: 'dwg-decode-failed' | 'dwg-engine-failed'; detail: string }
        | { code: 'dwg-version'; version: string }
        | { code: 'block-reference'; name: string }
        | { code: 'entity-skipped'; entityType: string; reason: CadImportDiagnostic | string }
      ))
  | CadImportProgressDiagnostic;

export class CadImportError extends Error {
  constructor(
    readonly diagnostic: CadImportDiagnostic,
    fallback: string,
  ) {
    super(fallback);
    this.name = diagnostic.code === 'cancelled' ? 'AbortError' : 'CadImportError';
  }
}

const plainCodes = new Set<string>(cadImportPlainCodes);
const geometryReasons = new Set<string>(cadGeometryReasons);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isCadImportDiagnostic(value: unknown): value is CadImportDiagnostic {
  return validateDiagnostic(value, 0);
}
function validateDiagnostic(value: unknown, depth: number): value is CadImportDiagnostic {
  if (depth > 4 || typeof value !== 'object' || value === null) return false;
  if (!('namespace' in value) || value.namespace !== 'cad-import' || !('code' in value))
    return false;
  const { code } = value;
  if (typeof code !== 'string') return false;
  if (plainCodes.has(code)) return true;
  switch (code) {
    case 'file-reading':
    case 'dwg-converting':
    case 'entities-importing':
      return true;
    case 'entities-preparing':
      return (
        'sourceEntities' in value &&
        count(value.sourceEntities) &&
        'layers' in value &&
        count(value.layers) &&
        'blocks' in value &&
        count(value.blocks)
      );
    case 'dxf-group-code':
    case 'dxf-number':
      return 'line' in value && count(value.line) && value.line > 0;
    case 'entity-limit':
    case 'layer-limit':
      return 'limit' in value && count(value.limit) && value.limit > 0;
    case 'dxf-structure':
      return (
        'part' in value &&
        typeof value.part === 'string' &&
        ['SECTION', 'ENDSEC', 'EOF-after', 'complete'].includes(value.part)
      );
    case 'invalid-geometry':
      return (
        'reason' in value && typeof value.reason === 'string' && geometryReasons.has(value.reason)
      );
    case 'dwg-decode-failed':
    case 'dwg-engine-failed':
      return 'detail' in value && typeof value.detail === 'string';
    case 'dwg-version':
      return 'version' in value && typeof value.version === 'string';
    case 'block-reference':
      return 'name' in value && typeof value.name === 'string';
    case 'entity-skipped':
      return (
        'entityType' in value &&
        typeof value.entityType === 'string' &&
        'reason' in value &&
        (typeof value.reason === 'string' || validateDiagnostic(value.reason, depth + 1))
      );
    default:
      return false;
  }
}

/** Never rely on instanceof: legacy importer errors originate in a separate VM realm in tests. */
export function getCadImportDiagnostic(error: unknown): CadImportDiagnostic | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('diagnostic' in error) ||
    !('name' in error) ||
    !('message' in error) ||
    typeof error.message !== 'string' ||
    !isCadImportDiagnostic(error.diagnostic)
  )
    return undefined;
  if (
    error.name !== 'CadImportError' &&
    !(error.name === 'AbortError' && error.diagnostic.code === 'cancelled')
  )
    return undefined;
  return error.diagnostic;
}
