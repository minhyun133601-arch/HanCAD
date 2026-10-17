import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { bulgeArc } from '@hancad/geom';
import { getLegacyRuntime } from '@hancad/legacy-bridge';
import { gripBulgeThrough, gripCircumcenter } from './grip-geometry';
export { gripCircumcenter } from './grip-geometry';
import { editableSelection } from './selection';
import { gripTranslate, transformGripEntity } from './grip-transform';
import type { EntityGrip, GripAction, GripProvider, GripSettings } from './grip-types';

const midpoint = (a: CadPoint, b: CadPoint): CadPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  ...(a.z === undefined && b.z === undefined ? {} : { z: ((a.z ?? 0) + (b.z ?? 0)) / 2 }),
});
const circlePoint = (center: CadPoint, radius: number, angle: number): CadPoint => ({
  ...center,
  x: center.x + radius * Math.cos(angle),
  y: center.y + radius * Math.sin(angle),
});
export function gripArcMidpoint(entity: Extract<CadEntity, { type: 'arc' }>): CadPoint {
  const tau = Math.PI * 2,
    direction = entity.clockwise ? 1 : -1;
  const sweep = (((direction * (entity.endAngle - entity.startAngle)) % tau) + tau) % tau;
  return circlePoint(entity.center, entity.radius, entity.startAngle + (direction * sweep) / 2);
}
export function gripPolylineMidpoint(
  entity: Extract<CadEntity, { points: CadPoint[] }>,
  index: number,
): CadPoint {
  const a = entity.points[index]!,
    b = entity.points[(index + 1) % entity.points.length]!;
  const arc = bulgeArc(a, b, entity.bulges?.[index] ?? 0);
  return arc
    ? circlePoint(arc.center, arc.radius, arc.startAngle + arc.sweepAngle / 2)
    : midpoint(a, b);
}

export const defaultGripProvider: GripProvider = {
  supports: () => true,
  grips(entity, extra) {
    const result: EntityGrip[] = [];
    function add(
      key: string,
      point: CadPoint,
      kind: EntityGrip['kind'],
      actions: readonly GripAction[] = ['stretch'],
    ): void {
      result.push({ entityId: entity.id, key, point: { ...point }, kind, actions });
    }
    switch (entity.type) {
      case 'line':
        add('a', entity.a, 'vertex', ['stretch', 'lengthen']);
        add('b', entity.b, 'vertex', ['stretch', 'lengthen']);
        add('mid', midpoint(entity.a, entity.b), 'midpoint');
        break;
      case 'polyline':
      case 'rect':
        entity.points.forEach((point, index) =>
          add(`v${index}`, point, 'vertex', [
            'stretch',
            'addVertex',
            ...(entity.points.length > 2 ? ['removeVertex' as const] : []),
            ...(entity.closed || index < entity.points.length - 1
              ? [(entity.bulges?.[index] ?? 0) ? ('convertLine' as const) : ('convertArc' as const)]
              : []),
          ]),
        );
        if (extra)
          for (let i = 0; i < entity.points.length - (entity.closed ? 0 : 1); i++)
            add(`s${i}`, gripPolylineMidpoint(entity, i), 'midpoint', [
              'stretch',
              'addVertex',
              (entity.bulges?.[i] ?? 0) ? 'convertLine' : 'convertArc',
            ]);
        break;
      case 'circle':
        add('center', entity.center, 'center');
        for (let i = 0; i < 4; i++)
          add(`q${i}`, circlePoint(entity.center, entity.radius, (i * Math.PI) / 2), 'quadrant');
        break;
      case 'arc':
        add('center', entity.center, 'center');
        add('start', circlePoint(entity.center, entity.radius, entity.startAngle), 'vertex');
        add('end', circlePoint(entity.center, entity.radius, entity.endAngle), 'vertex');
        add('mid', gripArcMidpoint(entity), 'midpoint');
        break;
      case 'text':
        add('point', entity.point, 'insertion');
        break;
      case 'dimension': {
        for (const key of ['a', 'b', 'center', 'placement'] as const)
          if (entity[key]) add(key, entity[key], 'vertex');
        if (!entity.placement && entity.a && entity.b && entity.offset !== undefined) {
          const angle =
            entity.axisAngle ??
            (entity.kind === 'vertical'
              ? -Math.PI / 2
              : entity.kind === 'horizontal'
                ? 0
                : Math.atan2(entity.b.y - entity.a.y, entity.b.x - entity.a.x));
          const mid = midpoint(entity.a, entity.b);
          add(
            'offset',
            {
              x: mid.x - Math.sin(angle) * entity.offset,
              y: mid.y + Math.cos(angle) * entity.offset,
            },
            'midpoint',
          );
        }
        break;
      }
    }
    return result;
  },
  stretch(entity, keys, delta) {
    const hot = new Set(keys),
      translated = (point: CadPoint) => gripTranslate(point, delta);
    const result = structuredClone(entity);
    switch (result.type) {
      case 'line':
        if (hot.has('a') || hot.has('mid')) result.a = translated(result.a);
        if (hot.has('b') || hot.has('mid')) result.b = translated(result.b);
        return result;
      case 'polyline':
      case 'rect': {
        const segmentMoves = (index: number): boolean =>
          hot.has(`s${index}`) && !(result.bulges?.[index] ?? 0);
        result.points = result.points.map((point, index) =>
          hot.has(`v${index}`) ||
          segmentMoves(index) ||
          segmentMoves((index - 1 + result.points.length) % result.points.length)
            ? translated(point)
            : point,
        );
        if (result.bulges)
          result.bulges = result.bulges.map((bulge, index) => {
            if (
              !bulge ||
              !hot.has(`s${index}`) ||
              (!result.closed && index === result.points.length - 1)
            )
              return bulge;
            const a = result.points[index]!,
              b = result.points[(index + 1) % result.points.length]!;
            const original = entity.type === 'polyline' || entity.type === 'rect' ? entity : result;
            return gripBulgeThrough(a, translated(gripPolylineMidpoint(original, index)), b);
          });
        return result;
      }
      case 'circle':
        if (hot.has('center')) return transformGripEntity(result, 'MOVE', result.center, delta);
        for (const grip of this.grips(result, true))
          if (hot.has(grip.key)) {
            const p = translated(grip.point);
            result.radius = Math.hypot(p.x - result.center.x, p.y - result.center.y);
            break;
          }
        return result;
      case 'arc': {
        if (hot.has('center')) return transformGripEntity(result, 'MOVE', result.center, delta);
        const grips = this.grips(result, true);
        if (hot.has('start') || hot.has('end') || hot.has('mid')) {
          const originalA = grips.find((g) => g.key === 'start')!.point,
            originalB = grips.find((g) => g.key === 'end')!.point,
            originalMid = gripArcMidpoint(result);
          const a = hot.has('start') ? translated(originalA) : originalA,
            b = hot.has('end') ? translated(originalB) : originalB,
            p = hot.has('mid') ? translated(originalMid) : originalMid;
          const center = gripCircumcenter(a, p, b);
          if (center) {
            result.center = center;
            result.radius = Math.hypot(a.x - center.x, a.y - center.y);
            result.startAngle = Math.atan2(a.y - center.y, a.x - center.x);
            result.endAngle = Math.atan2(b.y - center.y, b.x - center.x);
            result.clockwise = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x) > 0;
          }
        }
        return result;
      }
      case 'text':
        return { ...result, point: translated(result.point) };
      case 'dimension':
        for (const key of ['a', 'b', 'center', 'placement'] as const)
          if (hot.has(key) && result[key]) result[key] = translated(result[key]);
        if (hot.has('offset') && result.a && result.b) {
          const angle =
            result.axisAngle ??
            (result.kind === 'vertical'
              ? -Math.PI / 2
              : result.kind === 'horizontal'
                ? 0
                : Math.atan2(result.b.y - result.a.y, result.b.x - result.a.x));
          result.offset =
            (result.offset ?? 0) - delta.x * Math.sin(angle) + delta.y * Math.cos(angle);
        }
        return result;
    }
  },
};

const providers: GripProvider[] = [defaultGripProvider];
export function registerGripProvider(provider: GripProvider): () => void {
  providers.unshift(provider);
  return () => {
    const index = providers.indexOf(provider);
    if (index >= 0) providers.splice(index, 1);
  };
}
export function gripProvider(entity: CadEntity): GripProvider {
  return providers.find((provider) => provider.supports(entity)) ?? defaultGripProvider;
}
export function collectEntityGrips(
  state: LegacyCadState,
  ids: readonly string[],
  settings: GripSettings,
): EntityGrip[] {
  const requested = new Set(ids);
  const selectedBlocks = (state.clipboardBlocks ?? []).filter(
    (block) => block.entityIds.length > 0 && block.entityIds.every((id) => requested.has(id)),
  );
  const blockChildren = new Set(selectedBlocks.flatMap((block) => block.entityIds));
  const objectCount = requested.size - blockChildren.size + selectedBlocks.length;
  if (settings.grips === 0 || (settings.limit > 0 && objectCount > settings.limit)) return [];
  const selected = editableSelection(state, ids),
    eligible = new Set(selected.map((entity) => entity.id));
  const groups =
    (settings.groupMode ?? 2) !== 0 && ((settings.pickstyle ?? 1) & 1) !== 0
      ? (state.groups ?? []).filter(
          (group) =>
            group.selectable && group.ids.length > 0 && group.ids.every((id) => eligible.has(id)),
        )
      : [];
  const groupChildren = new Set(groups.flatMap((group) => group.ids));
  const blocks =
    settings.block === 1
      ? []
      : selectedBlocks.filter(
          (block) =>
            block.entityIds.length > 0 &&
            block.entityIds.every((id) => eligible.has(id)) &&
            !block.entityIds.some((id) => groupChildren.has(id)),
        );
  const children = new Set([...groupChildren, ...blocks.flatMap((block) => block.entityIds)]);
  const grips: EntityGrip[] = [
    ...selected
      .filter((entity) => !children.has(entity.id))
      .flatMap((entity) => gripProvider(entity).grips(entity, settings.grips === 2)),
    ...blocks.map((block): EntityGrip => ({
      entityId: block.entityIds[0]!,
      entityIds: [...block.entityIds],
      key: `block:${block.name}`,
      kind: 'insertion',
      point: { ...block.basePoint },
      actions: ['stretch'],
    })),
    ...groups.flatMap((group): EntityGrip[] => {
      const memberIds = new Set(group.ids);
      const bounds = getLegacyRuntime().core.cadEngine.bounds(
        selected.filter((entity) => memberIds.has(entity.id)),
      );
      return bounds
        ? [
            {
              entityId: group.ids[0]!,
              entityIds: [...group.ids],
              key: `group:${group.name}`,
              kind: 'center',
              point: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
              actions: ['stretch'],
            },
          ]
        : [];
    }),
  ];
  return settings.multifunctional === 0
    ? grips.map((grip) => ({ ...grip, actions: ['stretch'] }))
    : grips;
}
export function nearestEntityGrip(
  grips: readonly EntityGrip[],
  point: CadPoint,
  tolerance: number,
): EntityGrip | undefined {
  let best: EntityGrip | undefined,
    distance = tolerance;
  for (const grip of grips) {
    const d = Math.max(Math.abs(point.x - grip.point.x), Math.abs(point.y - grip.point.y));
    if (d <= distance) {
      distance = d;
      best = grip;
    }
  }
  return best;
}
