import { geometryBounds, RTree } from '@hancad/geom';
import type { SpatialBounds } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import { prepareSnapCurve, snapCurveParts, type PreparedSnapCurve } from './snap-curves';
import { staticSnapPoints, type StaticSnapPoint } from './snap-curve-points';
import { snapWcs, type SnapSource } from './snap-types';

export interface PreparedSnapSource extends SpatialBounds {
  source: SnapSource;
  curves: readonly PreparedSnapCurve[];
  points: readonly StaticSnapPoint[];
  unbounded: boolean;
  order: number;
}
/** Prepared geometry and the shared dynamic R-tree are reused across pointer moves. */
export class SnapIndex {
  private readonly tree = new RTree<PreparedSnapSource>();
  private readonly entries = new Map<string, PreparedSnapSource>();
  private readonly infinite = new Set<PreparedSnapSource>();
  private serial = 0;
  constructor(sources: readonly SnapSource[] = []) {
    this.replaceAll(sources);
  }
  get size(): number {
    return this.entries.size;
  }
  get(id: string): SnapSource | undefined {
    return this.entries.get(id)?.source;
  }
  prepared(id: string): PreparedSnapSource | undefined {
    return this.entries.get(id);
  }
  replaceAll(sources: readonly SnapSource[]): void {
    this.entries.clear();
    this.infinite.clear();
    this.serial = 0;
    for (const source of sources) {
      const entry = this.prepare(source);
      this.entries.set(source.id, entry);
      if (entry.unbounded) this.infinite.add(entry);
    }
    this.tree.bulkLoad([...this.entries.values()].filter((entry) => !entry.unbounded));
  }
  upsert(source: SnapSource): void {
    const old = this.entries.get(source.id);
    this.remove(source.id);
    const entry = this.prepare(source, old?.order);
    this.entries.set(source.id, entry);
    if (entry.unbounded) this.infinite.add(entry);
    else this.tree.insert(entry);
  }
  remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    if (entry.unbounded) this.infinite.delete(entry);
    else this.tree.remove(entry);
    return true;
  }
  query(point: CadPoint, tolerance: number): PreparedSnapSource[] {
    const p = snapWcs(point),
      bounds = {
        minX: p.x - tolerance,
        minY: p.y - tolerance,
        maxX: p.x + tolerance,
        maxY: p.y + tolerance,
      };
    return [...this.tree.search(bounds), ...this.infinite].sort((a, b) => a.order - b.order);
  }
  sourcesNear(point: CadPoint, tolerance: number): SnapSource[] {
    return this.query(point, tolerance).map((entry) => entry.source);
  }
  private prepare(source: SnapSource, order = this.serial++): PreparedSnapSource {
    const bounds = geometryBounds(source.geometry),
      points = [...staticSnapPoints(source.geometry), ...(source.points ?? [])];
    if (source.insertion) points.push({ point: source.insertion, kind: 'insertion' });
    let minX = bounds.min.x,
      minY = bounds.min.y,
      maxX = bounds.max.x,
      maxY = bounds.max.y;
    for (const { point } of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    return {
      source,
      curves: snapCurveParts(source.geometry).map(prepareSnapCurve),
      points,
      minX,
      minY,
      maxX,
      maxY,
      unbounded: bounds.kind === 'unbounded',
      order,
    };
  }
}
