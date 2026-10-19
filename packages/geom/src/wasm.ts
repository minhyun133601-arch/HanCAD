export interface GeometryKernel {
  distance2d(ax: number, ay: number, bx: number, by: number): number;
  midpoint2d(ax: number, ay: number, bx: number, by: number): Float64Array;
  parallelOffset(vertices: Float64Array, closed: boolean, distance: number): OffsetPolyline[];
}
export interface OffsetPolyline {
  closed: boolean;
  vertices: Float64Array;
}
let offsetKernel: GeometryKernel['parallelOffset'] | undefined;
export function parallelOffsetWasm(
  vertices: Float64Array,
  closed: boolean,
  distance: number,
): OffsetPolyline[] {
  if (
    vertices.length < 6 ||
    vertices.length % 3 !== 0 ||
    !Number.isFinite(distance) ||
    !vertices.every((v, i) => Number.isFinite(v) && (i % 3 !== 2 || Math.abs(v) <= 1 + 1e-12))
  )
    throw new Error('Invalid offset polyline.');
  if (!offsetKernel) throw new Error('Geometry WASM has not been initialized.');
  return offsetKernel(vertices, closed, distance);
}

export async function loadGeometryWasm(
  moduleOrPath?: BufferSource | WebAssembly.Module,
): Promise<GeometryKernel> {
  const module = await import('../wasm/geometry_wasm.js');
  await module.default(moduleOrPath === undefined ? undefined : { module_or_path: moduleOrPath });
  offsetKernel = module.parallelOffset;
  return {
    distance2d: module.distance2d,
    midpoint2d: module.midpoint2d,
    parallelOffset: module.parallelOffset,
  };
}
