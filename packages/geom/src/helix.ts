import { GeometryError, type GeometryBounds, type HelixGeometry, type Vec3 } from './curve-types';
import { add3, clampUnit, cross3, dot3, magnitude3, scale3 } from './vector3';

function validate(curve: HelixGeometry): void {
  if (
    ![
      curve.baseRadius,
      curve.topRadius,
      curve.turns,
      curve.height,
      curve.startAngle,
      curve.center.x,
      curve.center.y,
      curve.center.z,
    ].every(Number.isFinite) ||
    curve.baseRadius < 0 ||
    curve.topRadius < 0 ||
    curve.baseRadius + curve.topRadius <= 0 ||
    curve.turns <= 0 ||
    curve.turns > 500 ||
    typeof curve.clockwise !== 'boolean'
  )
    throw new GeometryError('invalid-helix');
  if (
    !Number.isFinite(magnitude3(curve.normal)) ||
    !Number.isFinite(magnitude3(curve.xAxis)) ||
    Math.abs(magnitude3(curve.normal) - 1) > 1e-10 ||
    Math.abs(magnitude3(curve.xAxis) - 1) > 1e-10 ||
    Math.abs(dot3(curve.normal, curve.xAxis)) > 1e-10
  )
    throw new GeometryError('invalid-helix-axes');
}
export function helixEvaluation(
  curve: HelixGeometry,
  parameter: number,
): { point: Vec3; derivative: Vec3 } {
  validate(curve);
  const t = clampUnit(parameter),
    sweep = (curve.clockwise ? -1 : 1) * curve.turns * Math.PI * 2;
  const angle = curve.startAngle + sweep * t,
    dr = curve.topRadius - curve.baseRadius,
    radius = curve.baseRadius + dr * t;
  const yAxis = cross3(curve.normal, curve.xAxis),
    radial = add3(scale3(curve.xAxis, Math.cos(angle)), scale3(yAxis, Math.sin(angle))),
    tangent = add3(scale3(curve.xAxis, -Math.sin(angle)), scale3(yAxis, Math.cos(angle)));
  return {
    point: add3(curve.center, add3(scale3(radial, radius), scale3(curve.normal, curve.height * t))),
    derivative: add3(
      add3(scale3(radial, dr), scale3(tangent, radius * sweep)),
      scale3(curve.normal, curve.height),
    ),
  };
}
export function helixBounds(curve: HelixGeometry): GeometryBounds {
  validate(curve);
  const radius = Math.max(curve.baseRadius, curve.topRadius),
    yAxis = cross3(curve.normal, curve.xAxis),
    min = { ...curve.center },
    max = { ...curve.center };
  for (const axis of ['x', 'y', 'z'] as const) {
    const halfWidth = radius * Math.hypot(curve.xAxis[axis], yAxis[axis]),
      rise = curve.normal[axis] * curve.height;
    min[axis] += Math.min(0, rise) - halfWidth;
    max[axis] += Math.max(0, rise) + halfWidth;
  }
  return { min, max, kind: 'finite', quality: 'conservative' };
}
/** Quarter-turn breaks prevent winding aliasing during tessellation, integration and picking. */
export function helixBreakpoints(curve: HelixGeometry): number[] {
  validate(curve);
  const count = Math.max(1, Math.ceil(curve.turns * 4));
  return Array.from({ length: count + 1 }, (_, i) => i / count);
}
