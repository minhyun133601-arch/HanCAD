import {
  cross3,
  dot3,
  magnitude3,
  transformGeometry,
  transformPoint3,
  type Affine3,
  type Vec3,
} from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { pointInput, model, wcs } from './draw-curve-helpers';
import { drawKeyword, drawPoint, type DrawContext, type DrawProgram } from './draw-program';
import { modifyResult, modifySelection } from './modify-common';
import { legacyEntitySnapSources } from './snap-legacy-sources';
import { transformMetadata } from './modify-transform-metadata';

const minus = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const times = (v: Vec3, n: number): Vec3 => ({ x: v.x * n, y: v.y * n, z: v.z * n });
function normalized(v: Vec3): Vec3 | undefined {
  const n = magnitude3(v);
  return n > 1e-12 ? times(v, 1 / n) : undefined;
}
function frame(points: readonly Vec3[]): readonly [Vec3, Vec3, Vec3] | undefined {
  const x = normalized(minus(points[1]!, points[0]!));
  if (!x) return;
  const z = normalized(cross3(x, minus(points[2]!, points[0]!)));
  return z ? [x, cross3(z, x), z] : undefined;
}
/** First-pair translation, shortest two-pair rotation, or full three-pair frame alignment. */
export function alignmentMatrix(
  sourcePoints: readonly CadPoint[],
  targetPoints: readonly CadPoint[],
  scale = false,
): Affine3 | undefined {
  const source = sourcePoints.map(wcs),
    target = targetPoints.map(wcs),
    a = source[0],
    b = target[0];
  if (!a || !b || source.length !== target.length) return;
  let rows: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  if (source.length >= 2) {
    const u = normalized(minus(source[1]!, a)),
      v = normalized(minus(target[1]!, b));
    if (!u || !v) return;
    if (source.length === 3) {
      const from = frame(source),
        to = frame(target);
      if (!from || !to) return;
      const coordinates = ['x', 'y', 'z'] as const;
      rows = coordinates.map((axis) =>
        coordinates.map((other) =>
          from.reduce((sum, basis, i) => sum + to[i]![axis] * basis[other], 0),
        ),
      );
    } else {
      let axis = cross3(u, v),
        sine = magnitude3(axis),
        cosine = Math.max(-1, Math.min(1, dot3(u, v)));
      if (sine < 1e-12 && cosine < 0) {
        axis =
          Math.abs(u.z) < 1e-12 && Math.abs(v.z) < 1e-12
            ? { x: 0, y: 0, z: 1 }
            : normalized(
                cross3(u, Math.abs(u.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }),
              )!;
        sine = 0;
        cosine = -1;
      } else if (sine > 1e-12) axis = times(axis, 1 / sine);
      const { x, y, z } = axis,
        c = cosine,
        s = sine,
        t = 1 - c;
      rows = [
        [c + x * x * t, x * y * t - z * s, x * z * t + y * s],
        [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
        [z * x * t - y * s, z * y * t + x * s, c + z * z * t],
      ];
      if (sine < 1e-12 && cosine > 0)
        rows = [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ];
      if (scale) {
        const factor = magnitude3(minus(target[1]!, b)) / magnitude3(minus(source[1]!, a));
        rows = rows.map((row) => row.map((n) => n * factor));
      }
    }
  }
  const values = [a.x, a.y, a.z],
    targets = [b.x, b.y, b.z];
  const row = (i: number): [number, number, number, number] => {
    const r = rows[i]!;
    return [r[0]!, r[1]!, r[2]!, targets[i]! - r.reduce((sum, n, j) => sum + n * values[j]!, 0)];
  };
  return [...row(0), ...row(1), ...row(2)];
}
export function affineEntity(entity: CadEntity, matrix: Affine3): CadEntity {
  const result = structuredClone(entity),
    map = (p: CadPoint) => model(transformPoint3(matrix, wcs(p)));
  const factor = Math.hypot(matrix[0], matrix[4], matrix[8]);
  if (result.peditTangents)
    result.peditTangents = Object.fromEntries(
      Object.entries(result.peditTangents).map(([index, angle]) => {
        const x = Math.cos(angle),
          y = Math.sin(angle),
          u = matrix[0] * x + matrix[1] * y,
          v = matrix[4] * x + matrix[5] * y;
        return [index, Math.hypot(u, v) > 1e-12 ? Math.atan2(v, u) : angle];
      }),
    );
  const originalCurve = result.curve ?? legacyEntitySnapSources(result)[0]?.geometry;
  if (originalCurve && result.type !== 'text' && result.type !== 'dimension')
    result.curve = transformGeometry(originalCurve, matrix);
  if (result.regionLoops)
    result.regionLoops = result.regionLoops.map((loop) =>
      loop.map((curve) => transformGeometry(curve, matrix)),
    );
  if (result.regionArea !== undefined) result.regionArea *= factor * factor;
  if (result.drawFill) result.drawFill = result.drawFill.map((path) => path.map(map));
  if (result.drawPaths) result.drawPaths = result.drawPaths.map((path) => path.map(map));
  if (result.mline) {
    result.mline.vertices = result.mline.vertices.map(map);
    result.mline.scale *= factor;
  }
  if (result.cloudVertices) result.cloudVertices = result.cloudVertices.map(map);
  if (result.cloudArcLength !== undefined) result.cloudArcLength *= factor;
  switch (result.type) {
    case 'line':
      result.a = map(result.a);
      result.b = map(result.b);
      break;
    case 'polyline':
    case 'rect':
      result.points = result.points.map(map);
      if (result.startWidths) result.startWidths = result.startWidths.map((n) => n * factor);
      if (result.endWidths) result.endWidths = result.endWidths.map((n) => n * factor);
      if (result.constantWidth !== undefined) result.constantWidth *= factor;
      break;
    case 'arc':
    case 'circle':
      result.center = map(result.center);
      result.radius *= factor;
      break;
    case 'text': {
      const direction = { x: Math.cos(result.rotation), y: -Math.sin(result.rotation), z: 0 };
      result.point = map(result.point);
      result.textSize *= factor;
      result.rotation = Math.atan2(
        -(matrix[4] * direction.x + matrix[5] * direction.y),
        matrix[0] * direction.x + matrix[1] * direction.y,
      );
      break;
    }
    case 'dimension':
      for (const key of ['a', 'b', 'center', 'placement'] as const)
        if (result[key]) result[key] = map(result[key]);
      if (result.radius !== undefined) result.radius *= factor;
      if (result.offset !== undefined) result.offset *= factor;
      result.dimScale *= factor;
      break;
  }
  return result;
}
export function* alignProgram(context: DrawContext): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  const source: CadPoint[] = [],
    target: CadPoint[] = [];
  for (let index = 0; index < 3; index++) {
    let first: CadPoint | undefined;
    for (;;) {
      const value = yield {
        kind: 'point',
        ko: `${['첫 번째', '두 번째', '세 번째'][index]} 원본 점 지정${index ? ' 또는 <계속>' : ''}:`,
        en: `Specify ${['first', 'second', 'third'][index]} source point${index ? ' or <continue>' : ''}:`,
      };
      if (value === '' && index > 0) break;
      first = drawPoint(value);
      if (first) break;
    }
    if (!first) break;
    source.push(first);
    target.push(
      yield* pointInput({
        ko: `${['첫 번째', '두 번째', '세 번째'][index]} 대상 점 지정:`,
        en: `Specify ${['first', 'second', 'third'][index]} destination point:`,
        base: first,
        preview: (p) => {
          const matrix = alignmentMatrix(source, [...target, p]);
          return matrix ? originals.map((e) => affineEntity(e, matrix)) : [];
        },
      }),
    );
  }
  let scale = false;
  if (source.length === 2)
    for (;;) {
      const answer = yield {
        kind: 'keyword',
        ko: '정렬점을 기준으로 객체의 축척을 조정하시겠습니까? [예(Y)/아니오(N)] <아니오>:',
        en: 'Scale objects based on alignment points? [Yes/No] <No>:',
      };
      const key = drawKeyword(answer);
      if (answer === '' || ['N', 'NO', '아니오', 'Y', 'YES', '예'].includes(key)) {
        scale = ['Y', 'YES', '예'].includes(key);
        break;
      }
    }
  const matrix = alignmentMatrix(source, target, scale);
  return matrix
    ? transformMetadata(
        context,
        originals,
        modifyResult(
          originals,
          originals.map((e) => affineEntity(e, matrix)),
        ),
        (_batch, p) => model(transformPoint3(matrix, wcs(p))),
      )
    : {
        entities: [],
        messages: [
          {
            ko: '정렬점이 같거나 일직선상에 있습니다.',
            en: 'Alignment points are coincident or collinear.',
          },
        ],
      };
}
