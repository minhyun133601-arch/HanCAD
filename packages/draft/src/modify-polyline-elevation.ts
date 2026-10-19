import type { CadPoint, CadPolyline } from '@hancad/legacy-bridge';

export function polylineElevation(entity: CadPolyline): number | undefined {
  const curve = entity.curve;
  const z =
    (curve?.type === 'POLYLINE' || curve?.type === 'LWPOLYLINE'
      ? curve.vertices[0]?.position.z
      : undefined) ??
    entity.elevation ??
    entity.points[0]?.z;
  return z === 0 &&
    entity.elevation === undefined &&
    entity.points.every((point) => point.z === undefined)
    ? undefined
    : z;
}

/** XY modify constructions retain the source 2D polyline's plane in both representations. */
export function preservePolylineElevation(source: CadPolyline, output: CadPolyline): CadPolyline {
  const z = polylineElevation(source);
  if (z === undefined) return output;
  const lift = (point: CadPoint): CadPoint => ({ ...point, z });
  return {
    ...output,
    points: output.points.map(lift),
    ...(source.elevation === undefined ? {} : { elevation: z }),
    ...(output.curve?.type === 'POLYLINE' || output.curve?.type === 'LWPOLYLINE'
      ? {
          curve: {
            ...output.curve,
            vertices: output.curve.vertices.map((vertex) => ({
              ...vertex,
              position: { ...vertex.position, z },
            })),
          },
        }
      : {}),
  };
}
