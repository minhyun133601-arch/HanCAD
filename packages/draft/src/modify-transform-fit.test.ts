import { describe, expect, it } from 'vitest';
import { evaluateGeometry } from '@hancad/geom';
import type { CadLine, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { draftLine, draftPolyline } from './entities';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawContext } from './draw-program';
import { peditFit, peditSpline } from './modify-poly-geometry';
import { transformFactories } from './modify-transform';
import { affineEntity } from './modify-transform-align';
import { stretchEntities } from './modify-transform-stretch';
import { gripProvider } from './grip-providers';
import { transformGripEntity } from './grip-transform';

const p = (x: number, y: number): CadPoint => ({ x, y: -y });
function fixture() {
  const c = outlineContext(),
    poly = draftPolyline(c.settings, [p(0, 0), p(10, 10), p(20, 0)]) as CadPolyline;
  return { c, poly };
}
describe('transforming PEDIT control frames and scoped crossing masks', () => {
  it('existing fit/spline grips acquire the original control frame and regenerate only that frame', () => {
    const { poly } = fixture();
    for (const entity of [peditFit(poly), peditSpline(poly, 6, 8)]) {
      const provider = gripProvider(entity),
        grips = provider.grips(entity, false);
      expect(grips.map((g) => g.point)).toEqual(entity.points);
      const result = provider.stretch(entity, ['v1'], p(4, 0)) as CadPolyline;
      expect(result.points).toHaveLength(3);
      expect(result.points[1]).toEqual(p(14, 10));
      expect(result.sourceType).toBe(entity.sourceType);
      expect(result.curve).not.toEqual(entity.curve);
      const rotated = transformGripEntity(result, 'ROTATE', p(0, 0), -Math.PI / 2);
      expect(rotated.sourceType).toBe(entity.sourceType);
    }
  });
  it('ROTATE and MIRROR transform persisted PEDIT tangent directions with the exact fit curve', () => {
    const { c, poly } = fixture(),
      fit = peditFit(
        poly,
        new Map([
          [0, Math.PI / 4],
          [2, -Math.PI / 4],
        ]),
      ),
      context = { ...c, entities: [fit], selectedIds: [fit.id] };
    const rotated = outlineRun(transformFactories.ROTATE!, [p(0, 0), '90'], context)
      .entities[0] as CadPolyline;
    expect(rotated.sourceType).toBe('POLYLINE_FIT');
    expect(rotated.points).toHaveLength(3);
    expect(rotated.peditTangents!['0']).toBeCloseTo((3 * Math.PI) / 4, 9);
    expect(rotated.peditTangents!['2']).toBeCloseTo(Math.PI / 4, 9);
    const mirrored = outlineRun(transformFactories.MIRROR!, [p(0, 0), p(1, 0), 'Y'], context)
      .entities[0]!;
    expect(mirrored.peditTangents!['0']).toBeCloseTo(-Math.PI / 4, 9);
    expect(mirrored.peditTangents!['2']).toBeCloseTo(Math.PI / 4, 9);
  });
  it('affine ALIGN rotates tangent vectors and retains spline control-frame points separately from samples', () => {
    const { c, poly } = fixture(),
      spline = peditSpline({ ...poly, peditTangents: { '0': Math.PI / 4 } }, 6, 8),
      result = affineEntity(spline, [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]) as CadPolyline;
    expect(result.sourceType).toBe('POLYLINE_SPLINE_CUBIC');
    expect(result.points).toHaveLength(3);
    expect(result.peditTangents!['0']).toBeCloseTo((3 * Math.PI) / 4, 9);
    const sample = evaluateGeometry(result.curve!, 0.37),
      before = evaluateGeometry(spline.curve!, 0.37);
    expect(sample.x).toBeCloseTo(-before.y, 9);
    expect(sample.y).toBeCloseTo(before.x, 9);
    expect(c.entities).toEqual([]);
  });
  it('STRETCH moves fit/spline frame vertices and regenerates their curve without converting sample points into controls', () => {
    const { c, poly } = fixture(),
      context: DrawContext = {
        ...c,
        selectionWindows: [
          { points: [p(9, 9), p(11, 9), p(11, 11), p(9, 11)], crossing: true, ids: [poly.id] },
        ],
      };
    for (const entity of [peditFit(poly, new Map([[0, 0]])), peditSpline(poly, 6, 8)]) {
      const result = stretchEntities(context, [entity], p(5, 0))[0] as CadPolyline;
      expect(result.sourceType).toBe(entity.sourceType);
      expect(result.points).toHaveLength(3);
      expect(result.points[1]).toEqual(p(15, 10));
      expect(result.curve).toBeDefined();
      expect(result.peditTangents).toEqual(entity.peditTangents);
    }
  });
  it('STRETCH applies a crossing acquisition only to the IDs retained in that acquisition', () => {
    const { c } = fixture(),
      a = draftLine(c.settings, p(0, 0), p(10, 0), 'A'),
      b = draftLine(c.settings, p(0, 0), p(10, 0), 'B');
    const context: DrawContext = {
      ...c,
      selectionWindows: [
        { points: [p(9, -1), p(11, -1), p(11, 1), p(9, 1)], crossing: true, ids: ['A'] },
      ],
    };
    const result = stretchEntities(context, [a, b], p(3, 0));
    expect((result[0] as CadLine).b.x).toBe(13);
    expect((result[1] as CadLine).b.x).toBe(10);
  });
});
