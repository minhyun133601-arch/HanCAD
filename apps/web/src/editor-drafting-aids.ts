import {
  ObjectTracking,
  acquiredSnapIntersections,
  constrainDraftingPoint,
  extensionTrackingPoints,
  heading,
  querySnapCandidates,
  snapModeBits,
} from '@hancad/draft';
import type {
  DraftPointOptions,
  DraftSnap,
  DraftingConstraintSettings,
  SnapIndex,
  SnapSource,
  TrackingPath,
} from '@hancad/draft';
import type { CadPoint } from '@hancad/legacy-bridge';

export interface AidQuery {
  index: SnapIndex;
  point: CadPoint;
  tolerance: number;
  osmode: number;
  osoptions: number;
  autosnap: number;
  settings: DraftingConstraintSettings;
  base?: CadPoint;
  previous?: CadPoint;
  temporary: readonly CadPoint[];
  shift: boolean;
  time: number;
  explicitIntersection: boolean;
  dynamicUcs?: boolean;
  chordTolerance?: number;
  viewport?: { minX: number; minY: number; maxX: number; maxY: number };
}
export interface AidResult extends DraftPointOptions {
  point: CadPoint;
  snap?: DraftSnap;
  paths: TrackingPath[];
  trackingKind?: 'object' | 'polar' | 'extension' | 'parallel';
  wait?: number;
  gridSnapped?: boolean;
}

/** Per-prompt editor state. Prepared drawing geometry is supplied by the caller. */
export class EditorDraftingAids {
  readonly tracking = new ObjectTracking();
  private candidates: DraftSnap[] = [];
  private candidate = 0;
  private cursor: CadPoint | undefined;
  private sources = new Map<string, SnapSource>();
  private intersection: SnapSource | undefined;
  clear(): void {
    this.tracking.clear();
    this.candidates = [];
    this.candidate = 0;
    this.cursor = undefined;
    this.sources.clear();
    this.intersection = undefined;
  }
  cycle(direction = 1): boolean {
    if (this.candidates.length < 2) return false;
    this.candidate = (this.candidate + direction + this.candidates.length) % this.candidates.length;
    return true;
  }
  /** Extended INT/APP can acquire two distant finite objects before locating their intersection. */
  acquireIntersection(source: SnapSource): void {
    this.intersection = source;
  }
  get hasIntersectionSource(): boolean {
    return this.intersection !== undefined;
  }
  completeIntersection(
    source: SnapSource,
    point: CadPoint,
    osmode: number,
    osoptions: number,
  ): DraftSnap | undefined {
    if (!this.intersection || source.id === this.intersection.id) return;
    return acquiredSnapIntersections(this.intersection, source, osmode, { osoptions }).sort(
      (a, b) =>
        Math.hypot(a.point.x - point.x, a.point.y - point.y) -
        Math.hypot(b.point.x - point.x, b.point.y - point.y),
    )[0];
  }
  resolve(query: AidQuery): AidResult {
    const { point, settings, tolerance, base } = query;
    if (
      !this.cursor ||
      Math.hypot(point.x - this.cursor.x, point.y - this.cursor.y) > tolerance / 4
    )
      this.candidate = 0;
    this.cursor = point;
    for (const [i, temporary] of query.temporary.entries())
      this.tracking.acquire(temporary, `temporary:${i}`);
    const acquired = [...this.sources.values()];
    const intersectionSources = this.intersection
      ? [this.intersection, ...query.index.sourcesNear(point, tolerance)]
      : [];
    this.candidates = querySnapCandidates(query.index, point, tolerance, query.osmode, {
      ...(base ? { basePoint: base } : {}),
      osoptions: query.osoptions,
      extendedIntersection: query.explicitIntersection,
      ...(query.dynamicUcs ? { dynamicUcs: true } : {}),
      intersectionSources,
      extensions: acquired,
      parallels: acquired,
    });
    const snap = this.candidates[this.candidate % Math.max(1, this.candidates.length)];
    const trackingEnabled = Boolean(query.autosnap & 16);
    // EXT/PAR acquire the source's nearest natural point without becoming an accepted snap.
    const acquisition =
      snap ??
      (!(query.osmode & 16384) && query.osmode & (4096 | 8192)
        ? querySnapCandidates(query.index, point, tolerance, 1 | 2 | 512, {
            osoptions: query.osoptions,
          })[0]
        : undefined);
    const wait = this.tracking.move(
      acquisition ? { point: acquisition.point, id: acquisition.source.id } : undefined,
      query.time,
      trackingEnabled || Boolean(query.osmode & (4096 | 8192)),
      Boolean(settings.polarMode & 8),
      query.shift,
    );
    const ids = new Set(this.tracking.acquired.map((item) => item.id));
    if (acquisition && ids.has(acquisition.source.id))
      this.sources.set(acquisition.source.id, acquisition.source);
    for (const id of this.sources.keys()) if (!ids.has(id)) this.sources.delete(id);
    if (snap) {
      const kind = snap.kind === 'extension' || snap.kind === 'parallel' ? snap.kind : undefined;
      const from =
        kind === 'parallel'
          ? base
          : kind
            ? this.tracking.acquired.find((p) => p.id === snap.source.id)?.point
            : undefined;
      const pathPoints =
        kind === 'extension' && from
          ? extensionTrackingPoints(
              snap.source,
              from,
              snap.point,
              query.chordTolerance ?? tolerance / 40,
              query.viewport,
            )
          : undefined;
      return {
        point: snap.point,
        snapped: true,
        constrained: true,
        snap,
        ...(snap.deferred ? { deferred: snap.deferred } : {}),
        ...(kind ? { trackingKind: kind } : {}),
        paths:
          from && kind
            ? [
                {
                  from,
                  to: snap.point,
                  angle: heading(from, snap.point),
                  kind,
                  ...(pathPoints ? { points: pathPoints } : {}),
                },
              ]
            : [],
        ...(wait === undefined ? {} : { wait }),
      };
    }
    const tracking =
      trackingEnabled || query.temporary.length
        ? this.tracking.resolve(
            point,
            tolerance,
            settings,
            query.previous && base ? heading(query.previous, base) : 0,
          )
        : undefined;
    if (tracking)
      return {
        point: tracking.point,
        constrained: true,
        trackingBase: tracking.base,
        paths: tracking.paths,
        trackingKind: 'object',
        ...(wait === undefined ? {} : { wait }),
      };
    const constrained = constrainDraftingPoint(point, base, query.previous, tolerance, settings);
    return {
      point: constrained.point,
      gridSnapped: constrained.kind === 'grid',
      constrained: true,
      paths:
        constrained.kind === 'polar' && base
          ? [{ from: base, to: constrained.point, angle: constrained.angle ?? 0, kind: 'polar' }]
          : [],
      ...(constrained.kind === 'polar'
        ? { trackingKind: 'polar' as const, trackingBase: base }
        : {}),
      ...(wait === undefined ? {} : { wait }),
    };
  }
  typed(
    index: SnapIndex,
    point: CadPoint,
    tolerance: number,
    osmode: number,
    osoptions: number,
    base?: CadPoint,
  ): DraftSnap | undefined {
    return querySnapCandidates(index, point, tolerance, osmode, {
      osoptions,
      ...(base ? { basePoint: base } : {}),
    })[0];
  }
}

export const overrideMode = (kind: keyof typeof snapModeBits | 'none'): number =>
  kind === 'none' ? 0 : snapModeBits[kind];
