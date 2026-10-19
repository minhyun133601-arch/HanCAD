import type { Bounds2, DisplayEntity } from '../display/types';
import { boundsOfGeometry } from '../display/bounds';
import type { GpuChunk } from './gpu';
import type { TextBuffers } from './text-device';
import type { RenderEnvironment } from './styles';

export interface Chunk {
  entries: { entity: DisplayEntity; slot: number }[];
  gpu?: GpuChunk;
  lod: number;
  dirty: boolean;
  stressFirst?: number;
  stressCount?: number;
  texts?: TextBuffers[];
  visible?: number;
  viewKey?: string;
  curved?: boolean;
  /** Last CPU mesh/upload cost, used to avoid starting work outside a frame's remaining slice. */
  rebuildMs?: number;
}
export function partitionEntities(entities: readonly DisplayEntity[]): Chunk[] {
  const cells = new Map<string, { entity: DisplayEntity; slot: number }[]>();
  entities.forEach((entity, slot) => {
    const b = boundsOfGeometry(entity.geometry),
      key = b
        ? `${Math.floor((b.minX + (b.maxX - b.minX) / 2) / 4096)},${Math.floor((b.minY + (b.maxY - b.minY) / 2) / 4096)}`
        : 'unbounded';
    const cell = cells.get(key) ?? [];
    cell.push({ entity, slot });
    cells.set(key, cell);
  });
  const chunks: Chunk[] = [];
  for (const cell of cells.values())
    for (let i = 0; i < cell.length; i += 4096)
      chunks.push({ entries: cell.slice(i, i + 4096), lod: 0, dirty: true });
  return chunks;
}
export function visibleDisplayBounds(
  entities: readonly DisplayEntity[],
  environment: RenderEnvironment,
  regenHeight: number,
  ids?: readonly string[],
): Bounds2 | undefined {
  const wanted = ids ? new Set(ids) : undefined;
  let result: Bounds2 | undefined;
  for (const entity of entities) {
    if (
      (wanted && !wanted.has(entity.id)) ||
      entity.visible === false ||
      environment.layers.get(entity.layer)?.visible === false
    )
      continue;
    const b = boundsOfGeometry(entity.geometry, {
      pdmode: Number(environment.variable('PDMODE') ?? 0),
      pdsize: Number(environment.variable('PDSIZE') ?? 0),
      regenViewHeight: regenHeight,
    });
    if (!b) continue;
    if (!result) result = { ...b };
    else {
      result.minX = Math.min(result.minX, b.minX);
      result.minY = Math.min(result.minY, b.minY);
      result.maxX = Math.max(result.maxX, b.maxX);
      result.maxY = Math.max(result.maxY, b.maxY);
    }
  }
  return result;
}
