import type {
  CadBounds,
  CadEntity,
  CadFile,
  CadPoint,
  CadReadOptions,
  CadReadResult,
  LegacyCadRuntime,
  LegacyCadState,
} from './types';
import { CAD_ENTITY_LIMIT } from './limits';
import { CadImportError } from './diagnostics';
import { restoreSelectionMetadata } from './selection-metadata';
import { restoreClipboardMetadata } from './clipboard-metadata';
import { restoreDrawMetadata } from './draw-metadata';
import { drawingExportHooks } from './draw-export-hooks';

export function getLegacyRuntime(): LegacyCadRuntime {
  const runtime = (globalThis as typeof globalThis & { HeechangTool?: LegacyCadRuntime })
    .HeechangTool;
  if (!runtime?.core.cadEngine || !runtime.core.cadImporters || !runtime.core.cadExporters) {
    throw new CadImportError(
      { namespace: 'cad-import', code: 'runtime-unavailable' },
      '로컬 CAD 실행 모듈을 불러오지 못했습니다. 앱을 다시 열어 주세요.',
    );
  }
  runtime.core.cadDrawingExport = drawingExportHooks;
  return runtime;
}

export function createEmptyCadState(name = 'Drawing1.dwg'): LegacyCadState {
  const state = getLegacyRuntime().core.cadEngine.normalizeState({ name });
  state.name = name;
  return state;
}

export function normalizeCadState(value: unknown): LegacyCadState {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('entities' in value) ||
    !Array.isArray(value.entities)
  )
    throw new CadImportError(
      { namespace: 'cad-import', code: 'stored-invalid' },
      '저장된 도면 데이터가 올바르지 않습니다.',
    );
  if (value.entities.length > CAD_ENTITY_LIMIT)
    throw new CadImportError(
      { namespace: 'cad-import', code: 'entity-limit', limit: CAD_ENTITY_LIMIT },
      `도면 객체가 지원 한도 ${CAD_ENTITY_LIMIT.toLocaleString()}개를 초과합니다.`,
    );
  const state = getLegacyRuntime().core.cadEngine.normalizeState(value);
  if (state.entities.length !== value.entities.length)
    throw new CadImportError(
      { namespace: 'cad-import', code: 'stored-entities-invalid' },
      '저장된 도면 객체 검증에 실패했습니다.',
    );
  restoreSelectionMetadata(state, value);
  restoreClipboardMetadata(state, value);
  restoreDrawMetadata(state, value as { entities: unknown[]; mlineStyles?: unknown });
  return state;
}

/** Existing drawings are never mutated: callers replace state only after this promise succeeds. */
export async function readCadFile(
  file: CadFile,
  options: CadReadOptions = {},
): Promise<CadReadResult> {
  checkCancelled(options.signal);
  if (!file.size || file.size > 64 * 1024 * 1024)
    throw new CadImportError(
      { namespace: 'cad-import', code: 'file-size' },
      '64 MB 이하의 DWG / DXF 파일을 선택해 주세요.',
    );
  if (!/\.(dwg|dxf)$/i.test(file.name))
    throw new CadImportError(
      { namespace: 'cad-import', code: 'file-extension' },
      'DWG 또는 DXF 파일만 가져올 수 있습니다.',
    );
  const original = await file.arrayBuffer();
  checkCancelled(options.signal);
  const result = await getLegacyRuntime().core.cadImporters.read(
    { name: file.name, size: original.byteLength, arrayBuffer: async () => original.slice(0) },
    options,
  );
  checkCancelled(options.signal);
  // The offline reader creates a unique normalized graph per invocation; transfer its ownership.
  const state = { ...result.state, name: file.name.replace(/[\u0000-\u001f]/g, '').slice(0, 240) };
  return {
    state,
    report: structuredClone(result.report),
    source: { fileName: file.name, file, bytes: new Uint8Array(original) },
  };
}

export function openCadFile(file: CadFile, signal?: AbortSignal): Promise<CadReadResult> {
  return readCadFile(file, signal === undefined ? {} : { signal });
}
export function drawingToSvg(state: LegacyCadState): string {
  return getLegacyRuntime().core.cadExporters.toSvg(state);
}
export function drawingToDxf(state: LegacyCadState): string {
  return getLegacyRuntime().core.cadExporters.toDxf(state);
}
export function visibleCadEntities(state: LegacyCadState): CadEntity[] {
  const hidden = new Set(state.layers.filter((layer) => !layer.visible).map((layer) => layer.name));
  return state.entities.filter((entity) => !hidden.has(entity.layer));
}
export function drawingBounds(state: LegacyCadState): CadBounds {
  return getLegacyRuntime().core.cadExporters.boundsOf(state, true);
}

export function pickCadEntity(
  state: LegacyCadState,
  point: CadPoint,
  tolerance: number,
): CadEntity | undefined {
  if (!Number.isFinite(tolerance) || tolerance < 0) return undefined;
  const locked = new Set(state.layers.filter((layer) => layer.locked).map((layer) => layer.name));
  const hit = getLegacyRuntime().core.cadEngine.hitTest(
    visibleCadEntities(state).filter((entity) => !locked.has(entity.layer)),
    point,
    tolerance,
  );
  return hit ? structuredClone(hit) : undefined;
}
export function readableCadColor(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return '#26364c';
  if (color.toLowerCase() === '#ffffff') return '#000000';
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const [red = 0, green = 0, blue = 0] = rgb;
  if ((red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255 <= 0.65) return color;
  return `#${rgb
    .map((channel) =>
      Math.round(channel * 0.42)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new CadImportError(
      { namespace: 'cad-import', code: 'cancelled' },
      '가져오기를 취소했습니다.',
    );
}
