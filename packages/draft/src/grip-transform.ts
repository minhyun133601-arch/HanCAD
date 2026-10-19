import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { GripMode } from './grip-types';
import { transformGeometry } from '@hancad/geom';

export function gripTranslate(point: CadPoint, delta: CadPoint): CadPoint {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
    ...(point.z === undefined && delta.z === undefined
      ? {}
      : { z: (point.z ?? 0) + (delta.z ?? 0) }),
  };
}

export function transformGripPoint(
  point: CadPoint,
  mode: GripMode,
  base: CadPoint,
  value: number | CadPoint,
): CadPoint {
  if ((mode === 'MOVE' || mode === 'STRETCH') && typeof value !== 'number')
    return gripTranslate(point, value);
  const x = point.x - base.x,
    y = point.y - base.y;
  const angle = typeof value === 'number' ? value : Math.atan2(value.y - base.y, value.x - base.x);
  if (mode === 'MIRROR') {
    const c = Math.cos(2 * angle),
      s = Math.sin(2 * angle);
    return { ...point, x: base.x + x * c + y * s, y: base.y + x * s - y * c };
  }
  const factor = mode === 'SCALE' && typeof value === 'number' ? value : 1;
  const c = Math.cos(mode === 'ROTATE' ? angle : 0),
    s = Math.sin(mode === 'ROTATE' ? angle : 0);
  return {
    x: base.x + factor * (x * c - y * s),
    y: base.y + factor * (x * s + y * c),
    ...(point.z === undefined ? {} : { z: (base.z ?? 0) + factor * (point.z - (base.z ?? 0)) }),
  };
}

/** Coordinates in the transitional drawing are Y down; angular deltas here are Y down too. */
export function transformGripEntity(
  entity: CadEntity,
  mode: GripMode,
  base: CadPoint,
  value: number | CadPoint,
  mirrorText = false,
): CadEntity {
  const factor = mode === 'SCALE' && typeof value === 'number' ? value : 1;
  const angle = typeof value === 'number' ? value : Math.atan2(value.y - base.y, value.x - base.x);
  const mirror = mode === 'MIRROR';
  const rotation = mode === 'ROTATE' ? angle : 0;
  const map = (point: CadPoint): CadPoint => transformGripPoint(point, mode, base, value);
  const orientation = (heading: number): number =>
    mirror ? 2 * angle - heading : heading + rotation;
  const result = structuredClone(entity);
  if (result.curve || result.regionLoops) {
    const o = map({ x: 0, y: 0, z: 0 }),
      x = map({ x: 1, y: 0, z: 0 }),
      y = map({ x: 0, y: -1, z: 0 }),
      z = map({ x: 0, y: 0, z: 1 });
    const matrix = [
      x.x - o.x,
      y.x - o.x,
      z.x - o.x,
      o.x,
      o.y - x.y,
      o.y - y.y,
      o.y - z.y,
      -o.y,
      (x.z ?? 0) - (o.z ?? 0),
      (y.z ?? 0) - (o.z ?? 0),
      (z.z ?? 0) - (o.z ?? 0),
      o.z ?? 0,
    ] as const;
    if (result.curve) result.curve = transformGeometry(result.curve, matrix);
    if (result.regionLoops)
      result.regionLoops = result.regionLoops.map((loop) =>
        loop.map((curve) => transformGeometry(curve, matrix)),
      );
    if (result.regionArea !== undefined) result.regionArea *= factor * factor;
  }
  if (result.drawFill) result.drawFill = result.drawFill.map((polygon) => polygon.map(map));
  if (result.drawPaths) result.drawPaths = result.drawPaths.map((path) => path.map(map));
  if (result.mline) {
    result.mline.vertices = result.mline.vertices.map(map);
    result.mline.scale *= mirror ? -Math.abs(factor) : Math.abs(factor);
  }
  if (result.cloudVertices) result.cloudVertices = result.cloudVertices.map(map);
  if (result.cloudArcLength !== undefined) result.cloudArcLength *= Math.abs(factor);
  switch (result.type) {
    case 'line':
      return { ...result, a: map(result.a), b: map(result.b) };
    case 'polyline':
    case 'rect':
      return {
        ...result,
        points: result.points.map(map),
        ...(result.bulges ? { bulges: result.bulges.map((b) => (mirror ? -b : b)) } : {}),
        ...(result.startWidths
          ? { startWidths: result.startWidths.map((width) => width * Math.abs(factor)) }
          : {}),
        ...(result.endWidths
          ? { endWidths: result.endWidths.map((width) => width * Math.abs(factor)) }
          : {}),
        ...(result.constantWidth !== undefined
          ? { constantWidth: result.constantWidth * Math.abs(factor) }
          : {}),
      };
    case 'circle':
      return { ...result, center: map(result.center), radius: result.radius * Math.abs(factor) };
    case 'arc':
      return {
        ...result,
        center: map(result.center),
        radius: result.radius * Math.abs(factor),
        startAngle: orientation(result.startAngle),
        endAngle: orientation(result.endAngle),
        clockwise: mirror ? !result.clockwise : result.clockwise,
      };
    case 'text':
      return {
        ...result,
        point: map(result.point),
        textSize: result.textSize * Math.abs(factor),
        rotation: mirror && !mirrorText ? result.rotation : orientation(result.rotation),
      };
    case 'dimension': {
      for (const key of ['a', 'b', 'center', 'placement'] as const)
        if (result[key]) result[key] = map(result[key]);
      if (result.radius !== undefined) result.radius *= Math.abs(factor);
      if (result.offset !== undefined) result.offset *= mirror ? -factor : factor;
      if (result.axisAngle !== undefined) result.axisAngle = orientation(result.axisAngle);
      else if (rotation !== 0 && (result.kind === 'horizontal' || result.kind === 'vertical'))
        result.axisAngle = orientation(result.kind === 'vertical' ? -Math.PI / 2 : 0);
      if (mirror && result.clockwise !== undefined) result.clockwise = !result.clockwise;
      if (result.textRotation !== undefined) result.textRotation = orientation(result.textRotation);
      result.dimScale *= Math.abs(factor);
      return result;
    }
  }
}
