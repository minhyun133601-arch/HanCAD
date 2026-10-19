import { evaluateGeometry, polylineSegments } from '@hancad/geom';
import type { CurveGeometry } from '@hancad/geom';
import type { CadEntity } from '@hancad/legacy-bridge';
import { wcs } from './draw-curve-helpers';
import { type DrawContext, type DrawProgram } from './draw-program';
import { modifyId, modifyResult } from './modify-common';
import { editCurve, editCurveEntity } from './modify-curve-geometry';
import { dimensionGeometry } from './dimension-style';
import { editSelection } from './modify-topology';

export function* explodeProgram(context: DrawContext): DrawProgram {
  const selected = yield* editSelection(context),
    originals: CadEntity[] = [],
    result: CadEntity[] = [],
    messages = [];
  const blocks = new Set(
    context.blocks?.filter((b) => b.entityIds.some((id) => selected.some((e) => e.id === id))),
  );
  for (const entity of selected) {
    if ([...blocks].some((b) => b.entityIds.includes(entity.id))) {
      continue;
    }
    const c = editCurve(entity);
    let pieces: CurveGeometry[] = [];
    if (entity.regionLoops) pieces = entity.regionLoops.flat();
    else if (entity.mline && entity.drawPaths)
      pieces = entity.drawPaths.flatMap((path) =>
        path.slice(1).map((p, i) => ({ type: 'LINE' as const, start: wcs(path[i]!), end: wcs(p) })),
      );
    else if (c?.type === 'LWPOLYLINE' || c?.type === 'POLYLINE') {
      pieces = polylineSegments(c).map((s) => s.geometry);
      if (c.constantWidth || c.vertices.some((v) => v.startWidth || v.endWidth))
        messages.push({
          ko: '경고: 폴리선의 폭 및 접선 정보가 삭제되었습니다.',
          en: 'Warning: Polyline width and tangent information discarded.',
        });
    } else if (c?.type === 'SPLINE' && entity.sourceType?.startsWith('POLYLINE_SPLINE')) {
      const count = Math.max(
        8,
        Math.abs(Number(context.get('SPLINESEGS')) || 8) *
          Math.max(1, c.controlPoints.length - c.degree),
      );
      pieces = Array.from({ length: count }, (_, i) => ({
        type: 'LINE' as const,
        start: evaluateGeometry(c, i / count),
        end: evaluateGeometry(c, (i + 1) / count),
      }));
    } else if (entity.type === 'dimension') {
      const d = dimensionGeometry(entity);
      if (d) {
        pieces = d.lines.map(([a, b]) => ({ type: 'LINE' as const, start: wcs(a), end: wcs(b) }));
        result.push({
          ...entity,
          id: modifyId(),
          type: 'text',
          text: d.label,
          point: d.textPoint,
          textSize: d.textSize,
          rotation: d.rotation,
        });
        for (const points of d.arrows)
          result.push({
            ...entity,
            id: modifyId(),
            type: 'polyline',
            points,
            closed: true,
            sourceType: 'SOLID',
            drawFill: [points],
          });
        for (const arc of d.arcs)
          pieces.push({
            type: 'ARC',
            center: wcs(arc.center),
            normal: { x: 0, y: 0, z: 1 },
            xAxis: { x: 1, y: 0, z: 0 },
            radius: arc.radius,
            startAngle: -arc.startAngle,
            sweepAngle: -(arc.endAngle - arc.startAngle),
          });
      }
    }
    if (pieces.length) {
      originals.push(entity);
      result.push(...pieces.map((p) => editCurveEntity(entity, p, modifyId())));
    }
  }
  return {
    ...modifyResult(originals, result),
    messages,
    ...(blocks.size ? { removedBlockNames: [...blocks].map((b) => b.name) } : {}),
  };
}
