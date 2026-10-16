import { boundsOfGeometry } from '../display/bounds';
import { distanceToGeometry } from '../display/distance';
import { clipInfinite } from '../display/infinite';
import type { Bounds2, DisplayEntity, TessellationOptions, Vec2 } from '../display/types';
import { RTree } from './rtree';

interface Entry extends Bounds2 {
  entity: DisplayEntity;
  rank: number;
}
export interface DisplayPick {
  entity: DisplayEntity;
  distance: number;
}
export class DisplaySpatialIndex {
  private readonly tree = new RTree<Entry>();
  private readonly entries = new Map<string, Entry>();
  private readonly unbounded = new Map<string, { entity: DisplayEntity; rank: number }>();
  private nextRank = 0;
  constructor(private options: Partial<TessellationOptions> = {}) {}
  get size(): number {
    return this.entries.size + this.unbounded.size;
  }
  set(entities: readonly DisplayEntity[]): void {
    this.entries.clear();
    this.unbounded.clear();
    this.nextRank = 0;
    const entries: Entry[] = [];
    for (const entity of entities) {
      if (entity.visible === false) continue;
      const bounds = boundsOfGeometry(entity.geometry, this.options),
        rank = this.nextRank++;
      if (bounds) {
        const entry = { ...bounds, entity, rank };
        this.entries.set(entity.id, entry);
        entries.push(entry);
      } else this.unbounded.set(entity.id, { entity, rank });
    }
    this.tree.bulkLoad(entries);
  }
  upsert(entity: DisplayEntity): void {
    const rank =
      this.entries.get(entity.id)?.rank ?? this.unbounded.get(entity.id)?.rank ?? this.nextRank++;
    this.remove(entity.id);
    if (entity.visible === false) return;
    const bounds = boundsOfGeometry(entity.geometry, this.options);
    if (!bounds) this.unbounded.set(entity.id, { entity, rank });
    else {
      const entry = { ...bounds, entity, rank };
      this.entries.set(entity.id, entry);
      this.tree.insert(entry);
    }
  }
  remove(id: string): void {
    const previous = this.entries.get(id);
    if (previous) {
      this.tree.remove(previous);
      this.entries.delete(id);
    }
    this.unbounded.delete(id);
  }
  configure(options: Partial<TessellationOptions>): void {
    this.options = options;
    const entities = [...this.entries.values(), ...this.unbounded.values()]
      .sort((a, b) => a.rank - b.rank)
      .map(({ entity }) => entity);
    this.set(entities);
  }
  search(bounds: Bounds2): DisplayEntity[] {
    const candidates = [...this.tree.search(bounds), ...this.unbounded.values()].filter(
      ({ entity }) => {
        const geometry = entity.geometry;
        return (
          (geometry.type !== 'ray' && geometry.type !== 'xline') ||
          clipInfinite(geometry, bounds) !== undefined
        );
      },
    );
    return candidates.sort((a, b) => a.rank - b.rank).map(({ entity }) => entity);
  }
  pick(point: Vec2, tolerance: number): DisplayPick[] {
    if (!(tolerance >= 0) || !Number.isFinite(tolerance)) return [];
    const bounds = {
      minX: point.x - tolerance,
      minY: point.y - tolerance,
      maxX: point.x + tolerance,
      maxY: point.y + tolerance,
    };
    const candidates = [...this.tree.search(bounds), ...this.unbounded.values()];
    return candidates
      .map(({ entity, rank }) => ({
        entity,
        rank,
        distance: distanceToGeometry(entity.geometry, point, this.options),
      }))
      .filter(({ distance }) => distance <= tolerance)
      .sort((a, b) => a.distance - b.distance || b.rank - a.rank)
      .map(({ entity, distance }) => ({ entity, distance }));
  }
}
