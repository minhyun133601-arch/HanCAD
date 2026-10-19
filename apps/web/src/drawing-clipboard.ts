import {
  editableSelection,
  multilinePaths,
  translateCadEntities,
  validDraftPoint,
} from '@hancad/draft';
import { drawingBounds, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';

export const DRAWING_CLIPBOARD_MIME = 'application/vnd.hancad.drawing+json';
export interface DrawingClipboard {
  format: 'HanCAD.Drawing';
  version: 1;
  basePoint: CadPoint;
  state: LegacyCadState;
}

/** Keep double coordinates in JSON; never derive geometry from the preview image. */
export function copyDrawingSelection(
  source: LegacyCadState,
  ids: readonly string[],
  basePoint?: CadPoint,
): DrawingClipboard | undefined {
  const entities = editableSelection(source, ids);
  if (!entities.length) return undefined;
  const bounds = drawingBounds({ ...source, entities });
  const base = basePoint ?? { x: bounds?.minX ?? 0, y: bounds?.maxY ?? 0 };
  if (!validDraftPoint(base)) throw new Error('Invalid clipboard base point.');
  const selected = new Set(entities.map((entity) => entity.id));
  const state = normalizeCadState({
    ...source,
    entities,
    selectedIds: [],
    groups: (source.groups ?? []).filter((group) => group.ids.every((id) => selected.has(id))),
    clipboardBlocks: (source.clipboardBlocks ?? []).filter((block) =>
      block.entityIds.every((id) => selected.has(id)),
    ),
  });
  return { format: 'HanCAD.Drawing', version: 1, basePoint: { ...base }, state };
}

export function parseDrawingClipboard(text: string): DrawingClipboard {
  if (text.length > 128 * 1024 * 1024) throw new Error('Clipboard payload exceeds 128 MB.');
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('format' in value) ||
    value.format !== 'HanCAD.Drawing' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('basePoint' in value) ||
    typeof value.basePoint !== 'object' ||
    value.basePoint === null ||
    !('x' in value.basePoint) ||
    typeof value.basePoint.x !== 'number' ||
    !('y' in value.basePoint) ||
    typeof value.basePoint.y !== 'number' ||
    ('z' in value.basePoint && typeof value.basePoint.z !== 'number') ||
    !('state' in value)
  )
    throw new Error('Clipboard does not contain HanCAD drawing data.');
  const basePoint: CadPoint = {
    x: value.basePoint.x,
    y: value.basePoint.y,
    ...('z' in value.basePoint ? { z: Number(value.basePoint.z) } : {}),
  };
  if (!validDraftPoint(basePoint)) throw new Error('Invalid clipboard base point.');
  const state = normalizeCadState(value.state);
  if (!state.entities.length) throw new Error('Clipboard contains no drawing entities.');
  return { format: 'HanCAD.Drawing', version: 1, basePoint, state };
}

export function clipboardPreview(payload: DrawingClipboard, point: CadPoint): CadEntity[] {
  return translateCadEntities(payload.state.entities, {
    x: point.x - payload.basePoint.x,
    y: point.y - payload.basePoint.y,
    z: (point.z ?? 0) - (payload.basePoint.z ?? 0),
  });
}

export function pasteDrawingClipboard(
  target: LegacyCadState,
  payload: DrawingClipboard,
  point: CadPoint,
  asBlock = false,
): { state: LegacyCadState; ids: string[] } {
  if (!validDraftPoint(point)) throw new Error('Invalid insertion point.');
  const remap = new Map(
    payload.state.entities.map((entity) => [entity.id, `paste-${crypto.randomUUID()}`]),
  );
  const entities = clipboardPreview(payload, point).map((entity) => ({
    ...entity,
    id: remap.get(entity.id)!,
  }));
  const ids = entities.map((entity) => entity.id);
  const layers = [...target.layers];
  for (const layer of payload.state.layers)
    if (!layers.some((existing) => existing.name.toUpperCase() === layer.name.toUpperCase()))
      layers.push(structuredClone(layer));
  // AutoCAD resolves duplicate named definitions to those already in the target drawing.
  for (const entity of entities) {
    const layer = layers.find((item) => item.name.toUpperCase() === entity.layer.toUpperCase());
    if (layer) entity.layer = layer.name;
  }
  const linetypes = [...(target.linetypes ?? [])];
  for (const line of payload.state.linetypes ?? [])
    if (!linetypes.some((existing) => existing.name.toUpperCase() === line.name.toUpperCase()))
      linetypes.push(structuredClone(line));
  const mlineStyles = [...(target.mlineStyles ?? [])];
  for (const style of payload.state.mlineStyles ?? [])
    if (!mlineStyles.some((existing) => existing.name.toUpperCase() === style.name.toUpperCase()))
      mlineStyles.push(structuredClone(style));
  for (const entity of entities)
    if (entity.mline) {
      const style = mlineStyles.find(
        (existing) => existing.name.toUpperCase() === entity.mline!.style.toUpperCase(),
      );
      if (style) {
        const value = entity.mline;
        entity.mline = { ...value, style: style.name, offsets: [...style.offsets] };
        entity.drawPaths = multilinePaths(
          value.vertices,
          style.offsets,
          value.scale,
          value.justification,
          value.closed,
        );
      }
    }
  const delta = {
    x: point.x - payload.basePoint.x,
    y: point.y - payload.basePoint.y,
    z: (point.z ?? 0) - (payload.basePoint.z ?? 0),
  };
  const clipboardBlocks = [...(target.clipboardBlocks ?? [])];
  if (asBlock)
    clipboardBlocks.push({
      name: `A$C${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
      basePoint: { ...point },
      entityIds: ids,
    });
  else
    for (const block of payload.state.clipboardBlocks ?? [])
      clipboardBlocks.push({
        name: `A$C${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
        basePoint: {
          x: block.basePoint.x + delta.x,
          y: block.basePoint.y + delta.y,
          ...(block.basePoint.z !== undefined || delta.z
            ? { z: (block.basePoint.z ?? 0) + delta.z }
            : {}),
        },
        entityIds: block.entityIds.map((id) => remap.get(id)!).filter(Boolean),
      });
  const groups = [...(target.groups ?? [])];
  for (const group of payload.state.groups ?? [])
    groups.push({
      ...group,
      id: crypto.randomUUID(),
      name: `*A${crypto.randomUUID()}`,
      ids: group.ids.map((id) => remap.get(id)!).filter(Boolean),
    });
  return {
    ids,
    state: normalizeCadState({
      ...target,
      entities: [...target.entities, ...entities],
      layers,
      linetypes,
      groups,
      clipboardBlocks,
      ...(mlineStyles.length ? { mlineStyles } : {}),
      selectedIds: [],
    }),
  };
}
