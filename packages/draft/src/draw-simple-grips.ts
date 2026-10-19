import type { GripProvider } from './grip-types';
import { arcSweep } from './snap-geometry';
import type { CadEntity } from '@hancad/legacy-bridge';

export function syncSimpleDrawCurve(result: CadEntity): CadEntity {
  if (!result.curve) return result;
  if (result.type === 'line' && result.curve.type === 'LINE')
    result.curve = {
      type: 'LINE',
      start: { x: result.a.x, y: -result.a.y, z: result.a.z ?? 0 },
      end: { x: result.b.x, y: -result.b.y, z: result.b.z ?? 0 },
    };
  if (
    (result.type === 'circle' && result.curve.type === 'CIRCLE') ||
    (result.type === 'arc' && result.curve.type === 'ARC')
  ) {
    const common = {
      center: { x: result.center.x, y: -result.center.y, z: result.center.z ?? 0 },
      radius: result.radius,
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
    };
    result.curve =
      result.type === 'circle'
        ? { type: 'CIRCLE', ...common }
        : { type: 'ARC', ...common, startAngle: -result.startAngle, sweepAngle: -arcSweep(result) };
  }
  return result;
}

/** Native primitives keep their existing grip semantics and refresh redundant source data. */
export function simpleCurveGripProvider(base: GripProvider): GripProvider {
  return {
    supports: (entity) =>
      (entity.type === 'line' && entity.curve?.type === 'LINE') ||
      (entity.type === 'circle' && entity.curve?.type === 'CIRCLE') ||
      (entity.type === 'arc' && entity.curve?.type === 'ARC'),
    grips: (entity, extra) => base.grips(entity, extra),
    stretch(entity, keys, delta) {
      const result = base.stretch(entity, keys, delta);
      return syncSimpleDrawCurve(result);
    },
  };
}
