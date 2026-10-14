import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';

export type DraftSnapKind = 'endpoint' | 'midpoint' | 'center' | 'quadrant' | 'nearest';
export interface DraftSnap {
  point: CadPoint;
  kind: DraftSnapKind;
  entityId: string;
}

/** Initial running snaps; unsupported OSMODE bits never silently enable another mode. */
export function snapDraftPoint(
  state: LegacyCadState,
  point: CadPoint,
  tolerance: number,
  osmode: number,
): DraftSnap | undefined {
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isInteger(osmode) ||
    osmode <= 0 ||
    osmode & 16384
  )
    return;
  const hidden = new Set(state.layers.filter((layer) => !layer.visible).map((layer) => layer.name));
  let best: DraftSnap | undefined;
  let nearestDistance = tolerance;
  const offer = (candidate: CadPoint, kind: DraftSnapKind, entityId: string): void => {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance <= nearestDistance && (!best || distance < nearestDistance)) {
      best = { point: { ...candidate }, kind, entityId };
      nearestDistance = distance;
    }
  };
  for (const entity of state.entities) {
    if (hidden.has(entity.layer)) continue;
    const segment = (a: CadPoint, b: CadPoint): void => {
      if (osmode & 1) {
        offer(a, 'endpoint', entity.id);
        offer(b, 'endpoint', entity.id);
      }
      if (osmode & 2)
        offer({ x: a.x + (b.x - a.x) / 2, y: a.y + (b.y - a.y) / 2 }, 'midpoint', entity.id);
      if (osmode & 512) offer(projectSegment(point, a, b), 'nearest', entity.id);
    };
    if (entity.type === 'line') segment(entity.a, entity.b);
    else if (entity.type === 'polyline' || entity.type === 'rect') {
      for (let i = 1; i < entity.points.length; i++) {
        const a = entity.points[i - 1],
          b = entity.points[i];
        if (a && b) segment(a, b);
      }
      const first = entity.points[0],
        last = entity.points.at(-1);
      if (entity.closed && first && last) segment(last, first);
    } else if (entity.type === 'circle' || entity.type === 'arc') {
      if (osmode & 4) offer(entity.center, 'center', entity.id);
      const at = (angle: number): CadPoint => ({
        x: entity.center.x + entity.radius * Math.cos(angle),
        y: entity.center.y + entity.radius * Math.sin(angle),
      });
      if (entity.type === 'arc') {
        if (osmode & 1) {
          offer(at(entity.startAngle), 'endpoint', entity.id);
          offer(at(entity.endAngle), 'endpoint', entity.id);
        }
        if (osmode & 2) offer(at(entity.startAngle + arcSweep(entity) / 2), 'midpoint', entity.id);
      }
      if (osmode & 16)
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
          if (entity.type === 'circle' || arcContains(entity, angle))
            offer(at(angle), 'quadrant', entity.id);
        }
      if (osmode & 512 && Math.hypot(point.x - entity.center.x, point.y - entity.center.y) > 0) {
        const angle = Math.atan2(point.y - entity.center.y, point.x - entity.center.x);
        if (entity.type === 'circle' || arcContains(entity, angle))
          offer(at(angle), 'nearest', entity.id);
      }
    } else if (entity.type === 'dimension' && osmode & 1) {
      if (entity.a) offer(entity.a, 'endpoint', entity.id);
      if (entity.b) offer(entity.b, 'endpoint', entity.id);
    }
  }
  return best;
}

function projectSegment(point: CadPoint, a: CadPoint, b: CadPoint): CadPoint {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    square = dx * dx + dy * dy;
  const amount =
    square > 0
      ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square))
      : 0;
  return { x: a.x + amount * dx, y: a.y + amount * dy };
}
function modulo(angle: number): number {
  const turn = Math.PI * 2;
  return ((angle % turn) + turn) % turn;
}
function arcSweep(entity: Extract<CadEntity, { type: 'arc' }>): number {
  const span = entity.endAngle - entity.startAngle;
  if (Math.abs(span) >= Math.PI * 2 - 1e-10) return entity.clockwise ? Math.PI * 2 : -Math.PI * 2;
  return entity.clockwise ? modulo(span) : -modulo(-span);
}
function arcContains(entity: Extract<CadEntity, { type: 'arc' }>, angle: number): boolean {
  const sweep = arcSweep(entity);
  const offset = entity.clockwise
    ? modulo(angle - entity.startAngle)
    : modulo(entity.startAngle - angle);
  return offset <= Math.abs(sweep) + 1e-10;
}
