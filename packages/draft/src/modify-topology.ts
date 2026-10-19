import { evaluateGeometry, polylineSegments } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadEntity } from '@hancad/legacy-bridge';
import { drawEntity, type DrawContext, type DrawProgram } from './draw-program';
import { modifyResult, modifySelection } from './modify-common';
import {
  editCurve,
  editCurveEntity,
  near3,
  polylineCurve,
  reverseEditCurve,
} from './modify-curve-geometry';
import { concatenateSplines, curveSpline } from './modify-spline-geometry';
import { extendJoinPair } from './modify-join-extend';
import { editSelection } from './modify-selection';
export { editSelection } from './modify-selection';
export { breakProgram } from './modify-break';
export { explodeProgram } from './modify-explode';

export function joinEntities(
  entities: readonly CadEntity[],
  forcePolyline = false,
  fuzz = 1e-9,
  joinType = 'Add',
): { entities: CadEntity[]; consumed: CadEntity[] } {
  if (entities.length < 2) return { entities: [...entities], consumed: [] };
  const sources = entities.map((e) => {
    const curve = editCurve(e);
    return curve && structuredClone(curve);
  });
  const valid = entities.filter((_, i) => {
    const c = sources[i];
    return (
      !!c &&
      !['POINT', 'RAY', 'XLINE', 'CIRCLE'].includes(c.type) &&
      !('closed' in c && c.closed) &&
      !(c.type === 'ELLIPSE' && Math.abs(c.sweepParameter) >= Math.PI * 2 - 1e-10)
    );
  });
  if (valid.length !== entities.length) {
    const joined = joinEntities(valid, forcePolyline, fuzz, joinType);
    return {
      entities: [...joined.entities, ...entities.filter((e) => !valid.includes(e))],
      consumed: joined.consumed,
    };
  }
  const curves = sources as CurveGeometry[],
    first = entities[0]!;
  if (!forcePolyline && curves.every((c) => c.type === 'LINE')) {
    const line = curves[0];
    if (line?.type === 'LINE') {
      const d = {
          x: line.end.x - line.start.x,
          y: line.end.y - line.start.y,
          z: line.end.z - line.start.z,
        },
        length = Math.hypot(d.x, d.y, d.z);
      const t = (p: { x: number; y: number; z: number }) =>
        ((p.x - line.start.x) * d.x + (p.y - line.start.y) * d.y + (p.z - line.start.z) * d.z) /
        length ** 2;
      const all = curves.flatMap((c) => (c.type === 'LINE' ? [c.start, c.end] : []));
      if (
        length > 0 &&
        all.every((p) =>
          near3(
            p,
            {
              x: line.start.x + t(p) * d.x,
              y: line.start.y + t(p) * d.y,
              z: line.start.z + t(p) * d.z,
            },
            1e-8,
          ),
        )
      ) {
        const sorted = [...all].sort((a, b) => t(a) - t(b));
        return {
          entities: [editCurveEntity(first, { ...line, start: sorted[0]!, end: sorted.at(-1)! })],
          consumed: [...entities],
        };
      }
    }
  }
  if (!forcePolyline && curves.every((c) => c.type === 'ARC')) {
    const arc = curves[0];
    if (
      arc?.type === 'ARC' &&
      curves.every(
        (c) =>
          c.type === 'ARC' &&
          near3(c.center, arc.center) &&
          Math.abs(c.radius - arc.radius) < 1e-9 &&
          near3(c.normal, arc.normal),
      )
    ) {
      const start = Math.min(
        ...curves.flatMap((c) =>
          c.type === 'ARC' ? [c.startAngle, c.startAngle + c.sweepAngle] : [],
        ),
      );
      const end = Math.max(
        ...curves.flatMap((c) =>
          c.type === 'ARC' ? [c.startAngle, c.startAngle + c.sweepAngle] : [],
        ),
      );
      const curve: CurveGeometry =
        end - start >= Math.PI * 2 - 1e-9
          ? { ...arc, type: 'CIRCLE' }
          : { ...arc, startAngle: start, sweepAngle: end - start };
      return { entities: [editCurveEntity(first, curve)], consumed: [...entities] };
    }
  }
  if (!forcePolyline && curves.every((c) => c.type === 'ELLIPSE')) {
    const ellipse = curves[0];
    if (
      ellipse?.type === 'ELLIPSE' &&
      curves.every(
        (c) =>
          c.type === 'ELLIPSE' &&
          near3(c.center, ellipse.center) &&
          near3(c.majorAxis, ellipse.majorAxis) &&
          near3(c.minorAxis, ellipse.minorAxis),
      )
    ) {
      const angles = curves.flatMap((c) =>
        c.type === 'ELLIPSE' ? [c.startParameter, c.startParameter + c.sweepParameter] : [],
      );
      const start = Math.min(...angles),
        end = Math.max(...angles);
      return {
        entities: [
          editCurveEntity(first, {
            ...ellipse,
            startParameter: start,
            sweepParameter: Math.min(Math.PI * 2, end - start),
          }),
        ],
        consumed: [...entities],
      };
    }
  }
  const parts = curves.flatMap((curve, index) =>
    curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE'
      ? polylineSegments(curve).map((s, i) => ({
          curve: s.geometry,
          entity: entities[index]!,
          startWidth: curve.vertices[i]!.startWidth,
          endWidth: curve.vertices[i]!.endWidth,
        }))
      : [{ curve, entity: entities[index]!, startWidth: 0, endWidth: 0 }],
  );
  const chain = [parts.shift()!];
  const consumed = new Set<CadEntity>([chain[0]!.entity]);
  let changed = true;
  while (parts.length && changed) {
    changed = false;
    for (let i = 0; i < parts.length; i++) {
      const candidate = parts[i]!,
        start = evaluateGeometry(chain[0]!.curve, 0),
        end = evaluateGeometry(chain.at(-1)!.curve, 1);
      const a = evaluateGeometry(candidate.curve, 0),
        b = evaluateGeometry(candidate.curve, 1);
      let prepend = false,
        reverse = false;
      if (near3(end, a, fuzz)) {
      } else if (near3(end, b, fuzz)) reverse = true;
      else if (near3(start, b, fuzz)) prepend = true;
      else if (near3(start, a, fuzz)) {
        prepend = true;
        reverse = true;
      } else continue;
      const next = {
        ...candidate,
        curve: reverse ? reverseEditCurve(candidate.curve, true) : candidate.curve,
        startWidth: reverse ? candidate.endWidth : candidate.startWidth,
        endWidth: reverse ? candidate.startWidth : candidate.endWidth,
      };
      const left = prepend ? next.curve : chain.at(-1)!.curve,
        right = prepend ? chain[0]!.curve : next.curve;
      const finish = evaluateGeometry(left, 1),
        begin = evaluateGeometry(right, 0);
      if (!near3(finish, begin)) {
        if (joinType === 'Extend' || joinType === 'Both') {
          const extended = extendJoinPair(left, right);
          if (extended) {
            Object.assign(left, extended[0]);
            Object.assign(right, extended[1]);
          } else if (joinType === 'Extend') continue;
        }
        if (!near3(evaluateGeometry(left, 1), evaluateGeometry(right, 0))) {
          const bridge = {
            curve: { type: 'LINE' as const, start: finish, end: begin },
            entity: candidate.entity,
            startWidth: 0,
            endWidth: 0,
          };
          if (prepend) chain.unshift(bridge);
          else chain.push(bridge);
        }
      }
      if (prepend) chain.unshift(next);
      else chain.push(next);
      parts.splice(i, 1);
      consumed.add(candidate.entity);
      changed = true;
      break;
    }
  }
  if (consumed.size < 2) return { entities: [...entities], consumed: [] };
  const ordered = chain.map((p) => p.curve),
    z = evaluateGeometry(ordered[0]!, 0).z;
  const planar = ordered.every((c) =>
    [0, 0.5, 1].every((t) => Math.abs(evaluateGeometry(c, t).z - z) < 1e-9),
  );
  let joined: CurveGeometry | undefined;
  if (planar && ordered.every((c) => c.type === 'LINE' || c.type === 'ARC')) {
    const original =
      curves[0]?.type === 'LWPOLYLINE' || curves[0]?.type === 'POLYLINE' ? curves[0] : undefined;
    const polyline = polylineCurve(ordered, original);
    joined = {
      ...polyline,
      vertices: polyline.vertices.map((v, i) => ({
        ...v,
        startWidth: chain[i]?.startWidth ?? 0,
        endWidth: chain[i]?.endWidth ?? 0,
      })),
    };
  } else if (!forcePolyline) {
    if (ordered.every((c) => c.type === 'LINE'))
      joined = { ...polylineCurve(ordered), type: 'POLYLINE', is3D: true };
    else {
      const splines = ordered.map(curveSpline);
      if (splines.every((s) => !!s)) joined = concatenateSplines(splines.filter((s) => !!s));
    }
  }
  if (!joined) return { entities: [...entities], consumed: [] };
  return {
    entities: [editCurveEntity(first, joined), ...entities.filter((e) => !consumed.has(e))],
    consumed: [...consumed],
  };
}
function acceptsJoinSource(
  curve: CurveGeometry | undefined,
  candidate: CurveGeometry | undefined,
): boolean {
  if (!curve || !candidate) return false;
  if (curve.type === 'LINE') {
    if (candidate.type !== 'LINE') return false;
    const dx = curve.end.x - curve.start.x,
      dy = curve.end.y - curve.start.y,
      dz = curve.end.z - curve.start.z,
      length = Math.hypot(dx, dy, dz);
    return (
      length > 0 &&
      [candidate.start, candidate.end].every((p) => {
        const x = p.x - curve.start.x,
          y = p.y - curve.start.y,
          z = p.z - curve.start.z;
        return Math.hypot(dy * z - dz * y, dz * x - dx * z, dx * y - dy * x) <= length * 1e-9;
      })
    );
  }
  if (curve.type === 'ARC')
    return (
      candidate.type === 'ARC' &&
      near3(curve.center, candidate.center) &&
      Math.abs(curve.radius - candidate.radius) <= 1e-9 &&
      near3(curve.normal, candidate.normal)
    );
  if (curve.type === 'ELLIPSE')
    return (
      candidate.type === 'ELLIPSE' &&
      near3(curve.center, candidate.center) &&
      near3(curve.majorAxis, candidate.majorAxis) &&
      near3(curve.minorAxis, candidate.minorAxis)
    );
  return true;
}
export function* joinProgram(context: DrawContext): DrawProgram {
  let selected = modifySelection(context);
  if (!selected.length) {
    for (;;) {
      const value = yield {
        kind: 'entity',
        ko: '원본 객체 선택 또는 한 번에 결합할 여러 객체 선택:',
        en: 'Select source object or multiple objects to join at once:',
      };
      if (value === '') return { entities: [] };
      const entity = drawEntity(value);
      if (entity && (!context.editableIds || context.editableIds.has(entity.id))) {
        selected = [entity];
        break;
      }
    }
  }
  if (selected.length === 1) {
    const source = selected[0]!,
      curve = editCurve(source),
      canClose = curve?.type === 'ARC' || curve?.type === 'ELLIPSE';
    let close = false;
    const additions = yield* editSelection(
      context,
      canClose ? '결합할 객체 선택 또는 [닫기(C)]:' : '결합할 객체 선택:',
      canClose ? 'Select objects to join or [Close]:' : 'Select objects to join:',
      false,
      (keyword) => {
        close = canClose && ['C', 'CLOSE'].includes(keyword);
        return close;
      },
    );
    if (close && curve && (curve.type === 'ARC' || curve.type === 'ELLIPSE')) {
      const closed: CurveGeometry =
        curve.type === 'ARC'
          ? { ...curve, type: 'CIRCLE' }
          : { ...curve, startParameter: 0, sweepParameter: Math.PI * 2 };
      return modifyResult([source], [editCurveEntity(source, closed)]);
    }
    selected.push(
      ...additions.filter((e) => e.id !== source.id && acceptsJoinSource(curve, editCurve(e))),
    );
  }
  const joined = joinEntities(selected);
  return joined.consumed.length
    ? modifyResult(selected, joined.entities)
    : { entities: [], messages: [{ ko: '0개의 객체가 결합되었습니다.', en: '0 objects joined.' }] };
}
export function* reverseProgram(context: DrawContext): DrawProgram {
  const selected = yield* editSelection(context),
    changes = selected.flatMap((entity) => {
      const c = editCurve(entity);
      if (!c || !['LINE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'HELIX'].includes(c.type)) return [];
      const result = editCurveEntity(
        entity,
        reverseEditCurve(c, Number(context.get('PLINEREVERSEWIDTHS')) === 1),
      );
      if (
        (entity.type === 'polyline' || entity.type === 'rect') &&
        (result.type === 'polyline' || result.type === 'rect')
      ) {
        if (entity.sourceType?.startsWith('POLYLINE_')) {
          result.points = [...entity.points].reverse();
          result.sourceType = entity.sourceType;
        }
        if (entity.peditTangents)
          result.peditTangents = Object.fromEntries(
            Object.entries(entity.peditTangents).map(([i, angle]) => [
              entity.points.length - 1 - Number(i),
              angle + Math.PI,
            ]),
          );
      }
      return [result];
    });
  return modifyResult(
    selected.filter((e) => changes.some((c) => c.id === e.id)),
    changes,
  );
}
