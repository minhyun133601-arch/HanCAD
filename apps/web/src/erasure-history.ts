import type { DrawingDatabase } from '@hancad/db';
import type { CadEntity } from '@hancad/legacy-bridge';

/** OOPS is session-only and remains associated with its document across tab changes. */
export const drawingErasureHistory = new WeakMap<DrawingDatabase, readonly CadEntity[]>();
const erasureOrder = new WeakMap<readonly CadEntity[], readonly string[]>();

export function rememberDrawingErasure(
  database: DrawingDatabase,
  before: readonly CadEntity[],
  after: readonly CadEntity[],
): readonly CadEntity[] {
  const present = new Set(after.map((entity) => entity.id));
  const erased = before.filter((entity) => !present.has(entity.id));
  if (!erased.length) return drawingErasureHistory.get(database) ?? [];
  drawingErasureHistory.set(database, erased);
  erasureOrder.set(
    erased,
    before.map((entity) => entity.id),
  );
  return erased;
}

/** Unerasing retains the original draw order before objects created by later commands. */
export function restoreDrawingErasure(
  current: readonly CadEntity[],
  erased: readonly CadEntity[],
): CadEntity[] {
  const entities = new Map(current.map((entity) => [entity.id, entity]));
  for (const entity of erased) if (!entities.has(entity.id)) entities.set(entity.id, entity);
  const order = erasureOrder.get(erased);
  if (!order) return [...entities.values()];
  const oldIds = new Set(order);
  return [
    ...order.flatMap((id) => {
      const entity = entities.get(id);
      return entity ? [entity] : [];
    }),
    ...current.filter((entity) => !oldIds.has(entity.id)),
  ];
}
