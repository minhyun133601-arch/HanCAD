export interface GeometryKernel {
  distance2d(ax: number, ay: number, bx: number, by: number): number;
  midpoint2d(ax: number, ay: number, bx: number, by: number): Float64Array;
}

export async function loadGeometryWasm(
  moduleOrPath?: BufferSource | WebAssembly.Module,
): Promise<GeometryKernel> {
  const module = await import('../wasm/geometry_wasm.js');
  await module.default(moduleOrPath === undefined ? undefined : { module_or_path: moduleOrPath });
  return { distance2d: module.distance2d, midpoint2d: module.midpoint2d };
}
