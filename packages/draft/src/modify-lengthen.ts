import {
  closestGeometryPoint,
  evaluateGeometry,
  geometryLength,
  polylineSegments,
} from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { heading, model, numeric, wcs } from './draw-curve-helpers';
import {
  drawEntity,
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawProgram,
} from './draw-program';
import { editCurve, editCurveEntity } from './modify-curve-geometry';
import { modifyResult } from './modify-common';

function dynamicLength(
  curve: CurveGeometry,
  point: CadPoint,
  atStart: boolean,
): number | undefined {
  const length = geometryLength(curve),
    fixed = evaluateGeometry(curve, atStart ? 1 : 0),
    end = evaluateGeometry(curve, atStart ? 0 : 1);
  if (curve.type === 'LINE')
    return (
      ((point.x - fixed.x) * (end.x - fixed.x) + (-point.y - fixed.y) * (end.y - fixed.y)) / length
    );
  if (curve.type === 'ARC' || curve.type === 'ELLIPSE') {
    const sign =
      Math.sign(curve.type === 'ARC' ? curve.sweepAngle : curve.sweepParameter) *
      (atStart ? -1 : 1);
    const angle =
      curve.type === 'ARC'
        ? Math.atan2(-point.y - curve.center.y, point.x - curve.center.x)
        : closestGeometryPoint(
            { ...curve, startParameter: 0, sweepParameter: Math.PI * 2 },
            wcs(point),
          ).parameter *
          Math.PI *
          2;
    const fixedAngle =
      curve.type === 'ARC'
        ? Math.atan2(fixed.y - curve.center.y, fixed.x - curve.center.x)
        : atStart
          ? curve.startParameter + curve.sweepParameter
          : curve.startParameter;
    const sweep = (((sign * (angle - fixedAngle)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (curve.type === 'ARC') return sweep * curve.radius;
    const next = {
      ...curve,
      startParameter: atStart ? angle : fixedAngle,
      sweepParameter: (atStart ? -sign : sign) * sweep,
    };
    return geometryLength(next);
  }
  if ((curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') && !curve.closed) {
    const segments = polylineSegments(curve),
      segment = atStart ? segments[0] : segments.at(-1);
    if (!segment) return;
    const next = dynamicLength(segment.geometry, point, atStart);
    return next === undefined ? undefined : length - geometryLength(segment.geometry) + next;
  }
  return;
}

export function lengthenCurve(
  curve: CurveGeometry,
  target: number,
  atStart: boolean,
): CurveGeometry | undefined {
  if (!(target > 1e-10)) return;
  if (curve.type === 'LINE') {
    const length = geometryLength(curve),
      ratio = target / length;
    if (!(length > 0)) return;
    return {
      ...curve,
      ...(atStart
        ? {
            start: {
              x: curve.end.x + (curve.start.x - curve.end.x) * ratio,
              y: curve.end.y + (curve.start.y - curve.end.y) * ratio,
              z: curve.end.z + (curve.start.z - curve.end.z) * ratio,
            },
          }
        : {
            end: {
              x: curve.start.x + (curve.end.x - curve.start.x) * ratio,
              y: curve.start.y + (curve.end.y - curve.start.y) * ratio,
              z: curve.start.z + (curve.end.z - curve.start.z) * ratio,
            },
          }),
    };
  }
  if (curve.type === 'ARC') {
    if (target >= curve.radius * Math.PI * 2 - 1e-10) return;
    const sweep = (Math.sign(curve.sweepAngle) * target) / curve.radius;
    const result = {
      ...curve,
      startAngle: atStart ? curve.startAngle + curve.sweepAngle - sweep : curve.startAngle,
      sweepAngle: sweep,
    };
    delete result.startPoint;
    return result;
  }
  if (curve.type === 'ELLIPSE' && Math.abs(curve.sweepParameter) < Math.PI * 2 - 1e-10) {
    const originalEnd = curve.startParameter + curve.sweepParameter;
    const candidate = (sweep: number) => ({
      ...curve,
      startParameter: atStart ? originalEnd - sweep : curve.startParameter,
      sweepParameter: sweep,
    });
    let lo = 0,
      hi = Math.PI * 2 - 1e-9;
    if (geometryLength(candidate(Math.sign(curve.sweepParameter) * hi)) < target) return;
    for (let i = 0; i < 52; i++) {
      const mid = (lo + hi) / 2;
      if (geometryLength(candidate(Math.sign(curve.sweepParameter) * mid)) < target) lo = mid;
      else hi = mid;
    }
    return candidate((Math.sign(curve.sweepParameter) * (lo + hi)) / 2);
  }
  if ((curve.type === 'LWPOLYLINE' || curve.type === 'POLYLINE') && !curve.closed) {
    const segments = polylineSegments(curve),
      segment = atStart ? segments[0] : segments.at(-1);
    if (!segment) return;
    const otherLength = geometryLength(curve) - geometryLength(segment.geometry);
    const next = lengthenCurve(segment.geometry, target - otherLength, atStart);
    if (!next) return;
    const vertices = curve.vertices.map((v) => ({ ...v })),
      index = atStart ? 0 : vertices.length - 1;
    vertices[index]!.position = evaluateGeometry(next, atStart ? 0 : 1);
    if (next.type === 'ARC')
      vertices[atStart ? 0 : vertices.length - 2]!.bulge = Math.tan(next.sweepAngle / 4);
    return { ...curve, vertices };
  }
  return;
}
export function* lengthenProgram(context: DrawContext): DrawProgram {
  type Mode = 'DE' | 'P' | 'T' | 'DY';
  let mode: Mode | undefined,
    amount = 0,
    angle = false;
  const originals = new Map<string, CadEntity>(),
    changed = new Map<string, CadEntity>(),
    history: Map<string, CadEntity>[] = [];
  let notice: { ko: string; en: string } | undefined;
  const result = () =>
    modifyResult(
      [...originals.values()].filter((e) => changed.has(e.id)),
      [...changed.values()],
    );
  const targetLength = (curve: CurveGeometry): number =>
    angle && curve.type === 'ARC'
      ? (mode === 'DE' ? Math.abs(curve.sweepAngle) + amount : amount) * curve.radius
      : mode === 'DE'
        ? geometryLength(curve) + amount
        : mode === 'P'
          ? (geometryLength(curve) * amount) / 100
          : amount;
  for (;;) {
    const partial = result();
    const value = yield {
      kind: 'entity',
      ko: mode
        ? '변경할 객체 선택 또는 [명령 취소(U)]:'
        : '객체 선택 또는 [증분(DE)/백분율(P)/합계(T)/동적(DY)]:',
      en: mode
        ? 'Select an object to change or [Undo]:'
        : 'Select an object or [DElta/Percent/Total/DYnamic]:',
      partial: partial.entities,
      partialEraseIds: partial.eraseIds ?? [],
      ...(notice ? { notice } : {}),
      preview: (point) => {
        if (!mode || mode === 'DY' || Number(context.get('COMMANDPREVIEW')) === 0)
          return partial.entities;
        const picked = context.pickEntity?.(point);
        if (!picked || (context.editableIds && !context.editableIds.has(picked.id)))
          return partial.entities;
        const original = changed.get(picked.id) ?? picked,
          curve = editCurve(original);
        if (!curve || (angle && curve.type !== 'ARC')) return partial.entities;
        const next = lengthenCurve(
          curve,
          targetLength(curve),
          closestGeometryPoint(curve, wcs(point)).parameter < 0.5,
        );
        return next
          ? [
              ...partial.entities.filter((e) => e.id !== original.id),
              editCurveEntity(original, next),
            ]
          : partial.entities;
      },
    };
    notice = undefined;
    const option = drawKeyword(value);
    if (value === '') return result();
    if (option === 'U' || option === 'UNDO') {
      const last = history.pop();
      if (last) {
        changed.clear();
        for (const [key, e] of last) changed.set(key, e);
      }
      continue;
    }
    if (['DE', 'DELTA', 'P', 'PERCENT', 'T', 'TOTAL', 'DY', 'DYNAMIC'].includes(option)) {
      mode = option.startsWith('DE')
        ? 'DE'
        : option.startsWith('DY')
          ? 'DY'
          : option.startsWith('P')
            ? 'P'
            : 'T';
      angle = false;
      if (mode !== 'DY') {
        for (;;) {
          const input = yield {
            kind: 'number',
            ko:
              mode === 'DE'
                ? '증분 길이 입력 또는 [각도(A)] <0.0000>:'
                : mode === 'P'
                  ? '백분율 길이 입력 <100.0000>:'
                  : '총 길이 지정 또는 [각도(A)] <1.0000>:',
            en:
              mode === 'DE'
                ? 'Enter delta length or [Angle] <0.0000>:'
                : mode === 'P'
                  ? 'Enter percentage length <100.0000>:'
                  : 'Specify total length or [Angle] <1.0000>:',
          };
          if (mode !== 'P' && ['A', 'ANGLE'].includes(drawKeyword(input))) {
            angle = true;
            for (;;) {
              const a = yield {
                kind: 'angle',
                ko: mode === 'DE' ? '증분 각도 입력 <0>:' : '총 각도 지정 <57>:',
                en: mode === 'DE' ? 'Enter delta angle <0>:' : 'Specify total angle <57>:',
              };
              const n = a === '' ? (mode === 'DE' ? 0 : 1) : heading(a, context, undefined, true);
              if (n !== undefined && (mode === 'DE' || (n > 0 && n < Math.PI * 2))) {
                amount = n;
                break;
              }
            }
            break;
          }
          const n =
            input === '' ? (mode === 'DE' ? 0 : mode === 'P' ? 100 : 1) : numeric(input, context);
          if (n !== undefined && (mode === 'DE' || n > 0)) {
            amount = n;
            break;
          }
        }
      }
      continue;
    }
    const picked = drawEntity(value),
      point = drawPoint(value);
    if (!picked || !point || (context.editableIds && !context.editableIds.has(picked.id))) continue;
    const original = changed.get(picked.id) ?? picked,
      curve = editCurve(original);
    if (!curve || !['LINE', 'ARC', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE'].includes(curve.type))
      continue;
    if (!mode) {
      const length = geometryLength(curve),
        degrees =
          curve.type === 'ARC'
            ? `, 포함된 각도 = ${(Math.abs(curve.sweepAngle) * 180) / Math.PI}`
            : '';
      notice = {
        ko: `현재 길이 = ${length.toFixed(4)}${degrees}`,
        en: `Current length = ${length.toFixed(4)}`,
      };
      continue;
    }
    const atStart = closestGeometryPoint(curve, wcs(point)).parameter < 0.5;
    let target = targetLength(curve);
    if (angle && curve.type !== 'ARC') continue;
    if (mode === 'DY') {
      const end = evaluateGeometry(curve, atStart ? 0 : 1);
      const targetFromPoint = (p: CadPoint): number => dynamicLength(curve, p, atStart) ?? 0;
      let dynamic;
      while (!dynamic)
        dynamic = drawPoint(
          yield {
            kind: 'point',
            ko: '새 끝점 지정:',
            en: 'Specify new end point:',
            base: model(end),
            preview: (p) => {
              if (Number(context.get('COMMANDPREVIEW')) === 0) return [];
              const next = lengthenCurve(curve, targetFromPoint(p), atStart);
              return next ? [editCurveEntity(original, next)] : [];
            },
            partial: partial.entities,
            partialEraseIds: partial.eraseIds ?? [],
          },
        );
      target = targetFromPoint(dynamic);
    }
    const next = lengthenCurve(curve, target, atStart);
    if (next) {
      history.push(new Map(changed));
      originals.set(picked.id, picked);
      changed.set(picked.id, editCurveEntity(original, next));
    }
  }
}
