import { fitSpline, geometryBounds, geometryEvaluation } from '@hancad/geom';
import type { Vec3 } from '@hancad/geom';
import type { CadPoint } from '@hancad/legacy-bridge';
import type { EntityGrip, GripProvider } from './grip-types';
import { transformGripEntity } from './grip-transform';
import { drawMultiline } from './draw-mline';
import { drawEntityContext } from './draw-regenerate';
import { cloudDirectionReversed, cloudEntity } from './draw-cloud-geometry';
import { cloudArcGrips, stretchCloudArcs } from './draw-cloud-grips';

const model = (p: Vec3): CadPoint => ({ x: p.x, y: -p.y, z: p.z });
const move = (p: Vec3, delta: CadPoint): Vec3 => ({
  x: p.x + delta.x,
  y: p.y - delta.y,
  z: p.z + (delta.z ?? 0),
});
export const drawGripProvider: GripProvider = {
  supports: (entity) =>
    entity.curve !== undefined ||
    entity.mline !== undefined ||
    entity.regionLoops !== undefined ||
    entity.cloudVertices !== undefined ||
    entity.drawFill !== undefined,
  grips(entity, extra, settings) {
    const result: EntityGrip[] = [];
    const add = (key: string, p: CadPoint, kind: EntityGrip['kind'] = 'vertex') =>
      result.push({ entityId: entity.id, key, point: p, kind, actions: ['stretch'] });
    if (entity.regionLoops) {
      const bounds = entity.regionLoops.flat().map(geometryBounds);
      add(
        'center',
        {
          x:
            (Math.min(...bounds.map((b) => b.min.x)) + Math.max(...bounds.map((b) => b.max.x))) / 2,
          y:
            -(Math.min(...bounds.map((b) => b.min.y)) + Math.max(...bounds.map((b) => b.max.y))) /
            2,
        },
        'center',
      );
      return result;
    }
    if (entity.cloudVertices) {
      if (settings?.revcloudGrips === 0 && (entity.type === 'polyline' || entity.type === 'rect'))
        return cloudArcGrips(entity, extra);
      entity.cloudVertices.forEach((point, i) => add(`cloud${i}`, point));
      return result;
    }
    if (entity.drawFill && 'points' in entity) {
      entity.points.forEach((point, i) => add(`v${i}`, point));
      return result;
    }
    if (entity.mline) {
      entity.mline.vertices.forEach((p, i) => add(`m${i}`, p));
      return result;
    }
    const curve = entity.curve;
    if (!curve) return result;
    if (curve.type === 'POINT') add('position', model(curve.position));
    else if (curve.type === 'XLINE' || curve.type === 'RAY') {
      add('base', model(curve.basePoint), 'insertion');
      add(
        'direction',
        model({
          x: curve.basePoint.x + curve.direction.x,
          y: curve.basePoint.y + curve.direction.y,
          z: curve.basePoint.z + curve.direction.z,
        }),
      );
    } else if (curve.type === 'ELLIPSE') {
      add('center', model(curve.center), 'center');
      for (const [key, axis] of [
        ['major', curve.majorAxis],
        ['minor', curve.minorAxis],
      ] as const)
        for (const sign of [-1, 1])
          add(
            `${key}${sign}`,
            model({
              x: curve.center.x + sign * axis.x,
              y: curve.center.y + sign * axis.y,
              z: curve.center.z + sign * axis.z,
            }),
            'quadrant',
          );
      if (Math.abs(curve.sweepParameter) < 2 * Math.PI - 1e-9) {
        add('start', model(geometryEvaluation(curve, 0).point));
        add('end', model(geometryEvaluation(curve, 1).point));
      }
    } else if (curve.type === 'SPLINE') {
      const fit = curve.fitPoints.length > 0;
      (fit ? curve.fitPoints : curve.controlPoints).forEach((p, i) =>
        add(`${fit ? 'fit' : 'cv'}${i}`, model(p)),
      );
    } else if (curve.type === 'POLYLINE' || curve.type === 'LWPOLYLINE')
      curve.vertices.forEach((v, i) => add(`v${i}`, model(v.position)));
    else if (curve.type === 'HELIX') {
      add('center', model(curve.center), 'center');
      add('start', model(geometryEvaluation(curve, 0).point));
      add('end', model(geometryEvaluation(curve, 1).point));
    } else {
      add('start', model(geometryEvaluation(curve, 0).point));
      add('end', model(geometryEvaluation(curve, 1).point));
    }
    return result;
  },
  stretch(entity, keys, delta) {
    const result = structuredClone(entity),
      hot = new Set(keys);
    if (hot.has('center') || hot.has('position'))
      return transformGripEntity(result, 'MOVE', { x: 0, y: 0 }, delta);
    if (result.cloudVertices && (result.type === 'polyline' || result.type === 'rect')) {
      if (keys.some((key) => /^[vs]\d+$/.test(key))) return stretchCloudArcs(result, keys, delta);
      const vertices = result.cloudVertices.map((p, i) =>
        hot.has(`cloud${i}`) ? { ...p, x: p.x + delta.x, y: p.y + delta.y } : p,
      );
      const regenerated = cloudEntity(
        drawEntityContext(result),
        vertices,
        result.closed,
        {
          chord: result.cloudArcLength ?? 1,
          calligraphy: result.cloudStyle === 'Calligraphy',
          variance: result.cloudVariance ?? true,
          reversed: cloudDirectionReversed(result),
        },
        result.id,
      );
      return { ...result, ...regenerated };
    }
    if (result.drawFill && (result.type === 'polyline' || result.type === 'rect')) {
      const selected = result.points.filter((_, i) => hot.has(`v${i}`));
      const map = (p: CadPoint) =>
        selected.some((q) => p.x === q.x && p.y === q.y)
          ? { ...p, x: p.x + delta.x, y: p.y + delta.y }
          : p;
      result.points = result.points.map(map);
      result.drawFill = result.drawFill.map((polygon) => polygon.map(map));
      return result;
    }
    if (result.mline) {
      const data = result.mline;
      const vertices = data.vertices.map((point, i) =>
        hot.has(`m${i}`) ? { ...point, x: point.x + delta.x, y: point.y + delta.y } : point,
      );
      const regenerated = drawMultiline(
        drawEntityContext(entity),
        vertices,
        data.closed,
        data.offsets,
        data.scale,
        data.justification,
        data.style,
      );
      return { ...regenerated, id: entity.id };
    }
    const curve = result.curve;
    if (!curve) return result;
    if (curve.type === 'XLINE' || curve.type === 'RAY') {
      if (hot.has('base')) curve.basePoint = move(curve.basePoint, delta);
      if (hot.has('direction')) curve.direction = move(curve.direction, delta);
    } else if (curve.type === 'SPLINE') {
      curve.fitPoints = curve.fitPoints.map((p, i) => (hot.has(`fit${i}`) ? move(p, delta) : p));
      curve.controlPoints = curve.controlPoints.map((p, i) =>
        hot.has(`cv${i}`) ? move(p, delta) : p,
      );
      if (curve.fitPoints.length) result.curve = fitSpline(curve);
    } else if (curve.type === 'ELLIPSE') {
      for (const [name, axis] of [
        ['major', curve.majorAxis],
        ['minor', curve.minorAxis],
      ] as const)
        for (const sign of [-1, 1])
          if (hot.has(`${name}${sign}`)) {
            const current = Math.hypot(axis.x, axis.y),
              target = { x: axis.x + sign * delta.x, y: axis.y - sign * delta.y };
            if (name === 'minor') {
              const major = Math.hypot(curve.majorAxis.x, curve.majorAxis.y),
                nx = -curve.majorAxis.y / major,
                ny = curve.majorAxis.x / major;
              const length = Math.max(1e-12, Math.abs(target.x * nx + target.y * ny));
              curve.minorAxis = { x: nx * length, y: ny * length, z: 0 };
            } else {
              const length = Math.max(1e-12, Math.hypot(target.x, target.y)),
                minor = Math.hypot(curve.minorAxis.x, curve.minorAxis.y),
                orientation = axis.x * curve.minorAxis.y - axis.y * curve.minorAxis.x < 0 ? -1 : 1;
              if (current > 0) {
                curve.majorAxis = { x: target.x, y: target.y, z: axis.z };
                curve.minorAxis = {
                  x: (-target.y / length) * minor * orientation,
                  y: (target.x / length) * minor * orientation,
                  z: 0,
                };
              }
            }
          }
      for (const key of ['start', 'end'] as const)
        if (hot.has(key)) {
          const direction = curve.sweepParameter < 0 ? -1 : 1;
          const p = move(geometryEvaluation(curve, key === 'start' ? 0 : 1).point, delta),
            dx = p.x - curve.center.x,
            dy = p.y - curve.center.y;
          const a = curve.majorAxis,
            b = curve.minorAxis,
            parameter = Math.atan2(
              (dx * b.x + dy * b.y) / (b.x * b.x + b.y * b.y),
              (dx * a.x + dy * a.y) / (a.x * a.x + a.y * a.y),
            );
          const end = curve.startParameter + curve.sweepParameter;
          if (key === 'start') {
            curve.startParameter = parameter;
            const sweep = direction * (end - parameter);
            curve.sweepParameter =
              direction * (((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
          } else
            curve.sweepParameter =
              direction *
              ((((direction * (parameter - curve.startParameter)) % (2 * Math.PI)) + 2 * Math.PI) %
                (2 * Math.PI));
        }
    } else if (curve.type === 'POLYLINE' || curve.type === 'LWPOLYLINE')
      curve.vertices = curve.vertices.map((v, i) =>
        hot.has(`v${i}`) ? { ...v, position: move(v.position, delta) } : v,
      );
    else if (curve.type === 'HELIX') {
      for (const key of ['start', 'end'] as const)
        if (hot.has(key)) {
          const point = move(geometryEvaluation(curve, key === 'start' ? 0 : 1).point, delta),
            radius = Math.hypot(point.x - curve.center.x, point.y - curve.center.y);
          if (key === 'start') curve.baseRadius = radius;
          else curve.topRadius = radius;
        }
    }
    if (result.type === 'polyline' || result.type === 'rect') {
      if (result.curve?.type === 'SPLINE')
        result.points = (
          result.curve.fitPoints.length ? result.curve.fitPoints : result.curve.controlPoints
        ).map(model);
      else
        result.points = result.points.map((p, i) =>
          hot.has(`v${i}`) ? { ...p, x: p.x + delta.x, y: p.y + delta.y } : p,
        );
    }
    return result;
  },
};
