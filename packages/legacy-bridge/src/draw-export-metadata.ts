import { transformGeometry } from '@hancad/geom';
import type { Affine3 } from '@hancad/geom';
import { restoreDrawMetadata } from './draw-metadata';
import type { CadEntity, CadPoint } from './types';

export function drawingEntityMetadata(entity: CadEntity): string | undefined {
  return entity.curve ||
    entity.sourceType ||
    entity.drawFill ||
    entity.drawPaths ||
    entity.regionLoops ||
    ((entity.type === 'polyline' || entity.type === 'rect') &&
      (entity.startWidths ||
        entity.endWidths ||
        entity.constantWidth !== undefined ||
        entity.thickness !== undefined))
    ? JSON.stringify({ format: 'HanCAD.DrawingEntity', version: 1, entity })
    : undefined;
}
/** Extension XRECORD data restores app metadata; the corresponding entity is still a real DXF primitive. */
export function importDrawingMetadata(
  json: string,
  matrix: readonly number[],
  style: Record<string, unknown>,
  normalize: (value: unknown) => CadEntity | null,
): CadEntity {
  if (json.length > 64 * 1024 * 1024) throw new Error('Drawing metadata exceeds supported size.');
  const packet: unknown = JSON.parse(json);
  if (
    !packet ||
    typeof packet !== 'object' ||
    !('format' in packet) ||
    packet.format !== 'HanCAD.DrawingEntity' ||
    !('version' in packet) ||
    packet.version !== 1 ||
    !('entity' in packet)
  )
    throw new Error('Invalid drawing metadata version.');
  const source: unknown = packet.entity,
    result = normalize(source);
  if (!result) throw new Error('Invalid native drawing metadata.');
  restoreDrawMetadata({ entities: [result] }, { entities: [source] });
  if (matrix.length < 6 || !matrix.every(Number.isFinite))
    throw new Error('Invalid metadata transform.');
  const [a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0, sz = 1, tz = 0] = matrix;
  const affine: Affine3 = [a, c, 0, tx, b, d, 0, ty, 0, 0, sz, tz];
  const model = (p: CadPoint): CadPoint => ({
    x: a * p.x - c * p.y + tx,
    y: -b * p.x + d * p.y - ty,
    z: sz * (p.z ?? 0) + tz,
  });
  const areaScale = Math.abs(a * d - b * c),
    widthScale = Math.sqrt(areaScale);
  if (result.type === 'line') {
    result.a = model(result.a);
    result.b = model(result.b);
  }
  if (result.type === 'polyline' || result.type === 'rect') {
    result.points = result.points.map(model);
    if (a * d - b * c < 0 && result.bulges) result.bulges = result.bulges.map((value) => -value);
    if (result.startWidths)
      result.startWidths = result.startWidths.map((value) => value * widthScale);
    if (result.endWidths) result.endWidths = result.endWidths.map((value) => value * widthScale);
    if (result.constantWidth !== undefined) result.constantWidth *= widthScale;
    if (result.elevation !== undefined) result.elevation = result.elevation * sz + tz;
    if (result.thickness !== undefined) result.thickness *= sz;
  }
  if (result.type === 'circle' || result.type === 'arc') {
    result.center = model(result.center);
    result.radius *= widthScale;
  }
  if (result.type === 'text') result.point = model(result.point);
  if (result.curve) result.curve = transformGeometry(result.curve, affine);
  if (result.drawFill) result.drawFill = result.drawFill.map((polygon) => polygon.map(model));
  if (result.drawPaths) result.drawPaths = result.drawPaths.map((polygon) => polygon.map(model));
  if (result.regionLoops)
    result.regionLoops = result.regionLoops.map((loop) =>
      loop.map((curve) => transformGeometry(curve, affine)),
    );
  if (result.regionArea !== undefined) result.regionArea *= areaScale;
  if (result.cloudVertices) result.cloudVertices = result.cloudVertices.map(model);
  if (result.cloudArcLength !== undefined) result.cloudArcLength *= widthScale;
  if (result.mline)
    result.mline = {
      ...result.mline,
      vertices: result.mline.vertices.map(model),
      scale: result.mline.scale * widthScale,
    };
  return { ...result, ...style };
}
