import { describe, expect, it } from 'vitest';
import { evaluateGeometry, geometryEvaluation, type SplineGeometry } from '@hancad/geom';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { draftLine, draftPolyline } from './entities';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { cornerFactories } from './modify-corner';
import { filletSolution, trimAt } from './modify-corner-math';
import { blendSpline } from './modify-blend';
import { polylineCorners } from './modify-corner-polyline';
import { cornerExpression } from './modify-corner-expression';

const p = (x: number, y: number): CadPoint => ({ x, y });
const close = (a: number, b: number, t = 1e-8) => expect(Math.abs(a - b)).toBeLessThanOrEqual(t);
function fixture() {
  const context = outlineContext({
      FILLETRAD: 2,
      TRIMMODE: 1,
      CHAMFERA: 2,
      CHAMFERB: 3,
      COMMANDPREVIEW: 1,
    }),
    a = draftLine(context.settings, p(0, 0), p(10, 0)),
    b = draftLine(context.settings, p(0, 0), p(0, 10));
  context.entities = [a, b];
  return {
    context,
    a,
    b,
    first: { entity: a, point: p(9, 0) },
    second: { entity: b, point: p(0, 9) },
  };
}
const spline = (entity: CadEntity | undefined): SplineGeometry => {
  if (entity?.curve?.type !== 'SPLINE') throw new Error('Expected spline');
  return entity.curve;
};
describe('FILLET CHAMFER BLEND parity constructions', () => {
  it('trims perpendicular lines and creates the exact tangent fillet', () => {
    const { context, a, b, first, second } = fixture(),
      result = outlineRun(cornerFactories.FILLET!, [first, second], context);
    expect(result.eraseIds).toEqual([a.id, b.id]);
    expect(result.entities).toHaveLength(3);
    expect(result.entities[0]).toMatchObject({ type: 'line', a: p(2, 0), b: p(10, 0) });
    expect(result.entities[1]).toMatchObject({ type: 'line', a: p(0, 2), b: p(0, 10) });
    expect(result.entities[2]).toMatchObject({ type: 'arc', center: p(2, 2), radius: 2 });
  });
  it.each(['FILLET', 'CHAMFER'] as const)(
    '%s preserves an elevated 2D polyline plane and separate LINE endpoints',
    (command) => {
      const { context, a, b, first, second } = fixture();
      if (a.type !== 'line' || b.type !== 'line') throw new Error('Expected lines');
      a.a.z = a.b.z = b.a.z = b.b.z = 7;
      const result = outlineRun(cornerFactories[command]!, [first, second], context);
      for (const entity of result.entities) {
        if (entity.type === 'line') expect([entity.a.z, entity.b.z]).toEqual([7, 7]);
        else if (entity.type === 'arc') expect(entity.curve).toMatchObject({ center: { z: 7 } });
      }
      const source = draftPolyline(context.settings, [p(0, 10), p(0, 0), p(10, 0)], false);
      if (source.type !== 'polyline') throw new Error('Expected polyline');
      source.elevation = 7;
      context.entities = [source];
      const edited = outlineRun(
        cornerFactories[command]!,
        ['P', { entity: source, point: p(0, 5) }],
        context,
      ).entities[0];
      if (edited?.type !== 'polyline' || edited.curve?.type !== 'LWPOLYLINE')
        throw new Error('Expected exact polyline');
      expect(edited.points.every((point) => point.z === 7)).toBe(true);
      expect(edited.curve.vertices.every((vertex) => vertex.position.z === 7)).toBe(true);
    },
  );
  it('Shift-pick makes a sharp corner and retains remembered FILLETRAD', () => {
    const { context, first, second } = fixture();
    let shift = false;
    context.isShiftPressed = () => shift;
    const program = cornerFactories.FILLET!(context);
    program.next();
    program.next(first);
    shift = true;
    const result = program.next(second);
    expect(result.done).toBe(true);
    if (!result.done) throw new Error('Expected result');
    expect(result.value.entities).toHaveLength(2);
    expect(context.get('FILLETRAD')).toBe(2);
  });
  it('uses half the line separation for parallel-line fillets independently of radius', () => {
    const { context, a } = fixture(),
      b = draftLine(context.settings, p(0, 6), p(10, 6)),
      solutions = [0, 100].map((radius) => filletSolution(a, b, p(9, 0), p(9, 6), radius)!);
    for (const solution of solutions) {
      expect(solution.radius).toBe(3);
      expect(solution.first).toEqual(p(10, 0));
      expect(solution.second).toEqual(p(10, 6));
    }
  });
  it.each(['FILLET', 'CHAMFER'] as const)(
    '%s trims construction supports into authoritative rays and finite ray fragments',
    (command) => {
      const { context, a } = fixture();
      const ray: CadEntity = {
        ...a,
        id: 'ray',
        type: 'polyline',
        points: [p(0, 0), p(10, 0)],
        closed: false,
        sourceType: 'RAY',
        curve: { type: 'RAY', basePoint: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
      };
      const xline: CadEntity = {
        ...ray,
        id: 'xline',
        sourceType: 'XLINE',
        curve: { type: 'XLINE', basePoint: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: -1, z: 0 } },
      };
      context.entities = [ray, xline];
      const result = outlineRun(
        cornerFactories[command]!,
        [
          { entity: ray, point: p(9, 0) },
          { entity: xline, point: p(0, 9) },
        ],
        context,
      );
      expect(result.eraseIds).toEqual(['ray', 'xline']);
      expect(result.entities.find((e) => e.id === 'ray')?.curve).toMatchObject({
        type: 'RAY',
        basePoint: { x: 2, y: -0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
      });
      expect(result.entities.find((e) => e.id === 'xline')?.curve).toMatchObject({
        type: 'RAY',
        basePoint: { x: 0, y: command === 'FILLET' ? -2 : -3, z: 0 },
        direction: { x: 0, y: -1, z: 0 },
      });
      expect(trimAt(ray, p(5, 0), p(2, 0))).toMatchObject({
        type: 'line',
        a: p(0, 0),
        b: p(5, 0),
        curve: { type: 'LINE', start: { x: 0, y: -0, z: 0 }, end: { x: 5, y: -0, z: 0 } },
      });
    },
  );
  it('solves line-circle and circle-circle tangency analytically', () => {
    const { context, a } = fixture(),
      circle: CadEntity = { ...a, id: 'circle', type: 'circle', center: p(10, 10), radius: 3 },
      other: CadEntity = { ...circle, id: 'other', center: p(20, 10) };
    for (const [first, second, pickA, pickB] of [
      [a, circle, p(9, 0), p(10, 7)],
      [circle, other, p(13, 10), p(17, 10)],
    ] as const) {
      const solution = filletSolution(first, second, pickA, pickB, first.type === 'line' ? 4 : 3)!;
      expect(solution).toBeDefined();
      close(
        Math.hypot(solution.first.x - solution.center!.x, solution.first.y - solution.center!.y),
        solution.radius,
      );
      close(
        Math.hypot(solution.second.x - solution.center!.x, solution.second.y - solution.center!.y),
        solution.radius,
      );
    }
    context.set('FILLETRAD', 4);
    context.entities = [a, circle];
    const result = outlineRun(
      cornerFactories.FILLET!,
      [
        { entity: a, point: p(9, 0) },
        { entity: circle, point: p(10, 7) },
      ],
      context,
    );
    expect(result.eraseIds).not.toContain(circle.id);
  });
  it('remembers Radius/Trim, keeps accepted Multiple work and supports in-command Undo', () => {
    const { context, first, second } = fixture(),
      result = outlineRun(
        cornerFactories.FILLET!,
        ['R', '3', 'T', 'N', 'M', first, second, 'U', first, second, ''],
        context,
      );
    expect(result.entities).toHaveLength(1);
    expect(result.eraseIds).toEqual([]);
    expect(result.entities[0]).toMatchObject({ type: 'arc', radius: 3 });
    expect(context.get('TRIMMODE')).toBe(0);
    expect(context.get('FILLETRAD')).toBe(3);
  });
  it('CHAMFER Distance, Angle, Method and numeric Expression produce measured intersections', () => {
    const { context, first, second } = fixture();
    const distance = outlineRun(
      cornerFactories.CHAMFER!,
      ['D', 'E', '(2+3)*2', '4', first, second],
      context,
    );
    expect(distance.entities[2]).toMatchObject({ type: 'line', a: p(10, 0), b: p(0, 4) });
    const angle = outlineRun(cornerFactories.CHAMFER!, ['A', '2', '45', first, second], context);
    const connector = angle.entities[2];
    if (connector?.type !== 'line') throw new Error('Expected chamfer line');
    close(connector.a.x, 2);
    close(connector.b.y, 2);
    expect(context.get('CHAMMODE')).toBe(1);
    outlineRun(cornerFactories.CHAMFER!, ['E', 'D', first, second], context);
    expect(context.get('CHAMMODE')).toBe(0);
    expect(cornerExpression('1/0')).toBeUndefined();
    expect(cornerExpression('globalThis')).toBeUndefined();
  });
  it('Polyline rounds or chamfers all eligible corners into one native polyline', () => {
    const { context } = fixture(),
      poly = draftPolyline(context.settings, [p(0, 0), p(20, 0), p(20, 20), p(0, 20)], true);
    context.entities = [poly];
    const result = outlineRun(
      cornerFactories.FILLET!,
      ['P', { entity: poly, point: p(10, 0) }],
      context,
    );
    expect(result.entities).toHaveLength(1);
    const rounded = result.entities[0];
    if (rounded?.type !== 'polyline') throw new Error('Expected polyline');
    expect(rounded.points).toHaveLength(8);
    expect(rounded.bulges!.filter((b) => Math.abs(b) > 1e-10)).toHaveLength(4);
    expect(rounded.curve?.type).toBe('LWPOLYLINE');
    if (poly.type !== 'polyline' && poly.type !== 'rect') throw new Error('Expected polyline');
    const chamfered = polylineCorners(poly, {
      fillet: false,
      radius: 0,
      distance1: 2,
      distance2: 3,
    });
    expect(chamfered.points).toHaveLength(8);
    expect(chamfered.bulges!.every((b) => b === 0)).toBe(true);
  });
  it('BLEND Tangent makes degree 3 G1 and Smooth degree 5 G2 without changing either source', () => {
    const { context } = fixture(),
      a = draftLine(context.settings, p(-10, 0), p(0, 0)),
      b = draftLine(context.settings, p(10, 10), p(10, 20));
    context.entities = [a, b];
    for (const smooth of [false, true]) {
      const result = outlineRun(
          cornerFactories.BLEND!,
          [
            'CO',
            smooth ? 'S' : 'T',
            { entity: a, point: p(0, 0) },
            { entity: b, point: p(10, 10) },
          ],
          context,
        ),
        curve = spline(result.entities[0]);
      expect(curve.degree).toBe(smooth ? 5 : 3);
      expect(result.eraseIds).toBeUndefined();
      expect(evaluateGeometry(curve, 0)).toEqual({ x: 0, y: 0, z: 0 });
      expect(evaluateGeometry(curve, 1)).toEqual({ x: 10, y: -10, z: 0 });
      const start = geometryEvaluation(curve, 0).derivative,
        end = geometryEvaluation(curve, 1).derivative;
      close(start.y, 0);
      close(end.x, 0);
      expect(start.x).toBeGreaterThan(0);
      expect(end.y).toBeLessThan(0);
      if (smooth) {
        const h = 1e-6,
          d0 = geometryEvaluation(curve, h).derivative,
          d1 = geometryEvaluation(curve, 1 - h).derivative;
        close((d0.y - start.y) / h, 0, 0.002);
        close((end.x - d1.x) / h, 0, 0.002);
      }
    }
  });
  it('Smooth blend preserves arc endpoint curvature numerically', () => {
    const { a } = fixture(),
      arc: CadEntity = {
        ...a,
        type: 'arc',
        center: p(0, 0),
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI / 2,
        clockwise: true,
      },
      line = draftLine(outlineContext().settings, p(-10, 10), p(-20, 10));
    const result = blendSpline(arc, line, p(0, 5), p(-10, 10), true)!;
    const h = 1e-6,
      v = geometryEvaluation(result, 0).derivative,
      w = geometryEvaluation(result, h).derivative,
      curvature = (v.x * (w.y - v.y) - v.y * (w.x - v.x)) / (h * Math.hypot(v.x, v.y) ** 3);
    close(Math.abs(curvature), 1 / 5, 2e-5);
  });
  it('previews regenerate and COMMANDPREVIEW suppresses only the preview', () => {
    const { context, first } = fixture(),
      program = cornerFactories.FILLET!(context);
    program.next();
    const state = program.next(first);
    if (state.done) throw new Error('Expected second pick');
    expect(state.value.preview?.(p(0, 8))).toHaveLength(3);
    context.set('COMMANDPREVIEW', 0);
    expect(state.value.preview?.(p(0, 8))).toEqual([]);
  });
  it('selects adjacent or separated segments of one polyline and preserves its identity', () => {
    const { context } = fixture(),
      poly = draftPolyline(context.settings, [p(0, 10), p(0, 0), p(10, 0)], false);
    context.entities = [poly];
    for (const command of ['FILLET', 'CHAMFER']) {
      const result = outlineRun(
        cornerFactories[command]!,
        [
          { entity: poly, point: p(0, 8) },
          { entity: poly, point: p(8, 0) },
        ],
        context,
      );
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]).toMatchObject({ type: 'polyline', id: poly.id });
      expect(result.eraseIds).toEqual([poly.id]);
    }
    const rounded = draftPolyline(context.settings, [p(0, 10), p(0, 2), p(2, 0), p(10, 0)], false);
    if (rounded.type !== 'polyline') throw new Error('Expected polyline');
    rounded.bulges = [0, Math.tan(Math.PI / 8), 0, 0];
    context.entities = [rounded];
    context.isShiftPressed = () => true;
    const sharp = outlineRun(
      cornerFactories.FILLET!,
      [
        { entity: rounded, point: p(0, 8) },
        { entity: rounded, point: p(8, 0) },
      ],
      context,
    ).entities[0];
    expect(sharp).toMatchObject({ points: [p(0, 10), p(0, 0), p(10, 0)] });
  });
  it('joins a line to an open polyline and NoTrim Polyline creates only independent connectors', () => {
    const { context, a } = fixture(),
      poly = draftPolyline(context.settings, [p(0, 0), p(0, 10), p(5, 15)], false);
    context.entities = [a, poly];
    const joined = outlineRun(
      cornerFactories.FILLET!,
      [
        { entity: a, point: p(8, 0) },
        { entity: poly, point: p(0, 8) },
      ],
      context,
    );
    expect(joined.entities).toHaveLength(1);
    expect(joined.entities[0]).toMatchObject({ type: 'polyline', id: poly.id });
    expect(joined.eraseIds).toEqual(expect.arrayContaining([a.id, poly.id]));
    const rect = draftPolyline(context.settings, [p(0, 0), p(20, 0), p(20, 20), p(0, 20)], true);
    context.entities = [rect];
    const independent = outlineRun(
      cornerFactories.FILLET!,
      ['T', 'N', 'P', { entity: rect, point: p(10, 0) }],
      context,
    );
    expect(independent.eraseIds).toEqual([]);
    expect(independent.entities).toHaveLength(4);
    expect(independent.entities.every((e) => e.type === 'arc')).toBe(true);
    close(cornerExpression('sqrt(9)+sin(30)*2')!, 4);
    close(cornerExpression('-2^2')!, -4);
  });
  it('Polyline radius zero removes an existing arc and nonzero radius replaces it', () => {
    const { context } = fixture(),
      rounded = draftPolyline(context.settings, [p(0, 10), p(0, 2), p(2, 0), p(10, 0)], false);
    if (rounded.type !== 'polyline') throw new Error('Expected polyline');
    rounded.bulges = [0, Math.tan(Math.PI / 8), 0, 0];
    rounded.startWidths = [0, 0, 0, 0];
    rounded.endWidths = [0, 0, 0, 0];
    const sharp = polylineCorners(rounded, { fillet: true, radius: 0, distance1: 0, distance2: 0 });
    expect(sharp.points).toEqual([p(0, 10), p(0, 0), p(10, 0)]);
    expect(sharp.bulges).toEqual([0, 0, 0]);
    expect(sharp.startWidths).toHaveLength(3);
    const next = polylineCorners(rounded, { fillet: true, radius: 3, distance1: 0, distance2: 0 });
    expect(next.points[1]!.y).toBeCloseTo(3);
    expect(next.points[2]!.x).toBeCloseTo(3);
  });
  it('fillets an external line into either selected branch of an interior polyline segment', () => {
    const { context } = fixture(),
      poly = draftPolyline(context.settings, [p(-10, -10), p(0, -10), p(0, 10), p(10, 10)], false),
      line = draftLine(context.settings, p(2, 0), p(20, 0));
    context.entities = [line, poly];
    for (const side of [-1, 1]) {
      const result = outlineRun(
        cornerFactories.FILLET!,
        [
          { entity: line, point: p(15, 0) },
          { entity: poly, point: p(0, side * 8) },
        ],
        context,
      );
      expect(result.entities).toHaveLength(1);
      const joined = result.entities[0];
      if (joined?.type !== 'polyline') throw new Error('Expected polyline');
      expect(joined.points).toContainEqual(side > 0 ? p(10, 10) : p(-10, -10));
      expect(joined.points).not.toContainEqual(side < 0 ? p(10, 10) : p(-10, -10));
      expect(result.eraseIds).toEqual(expect.arrayContaining([line.id, poly.id]));
    }
  });
  it('closes an open polyline when its start and end segments are filleted', () => {
    const { context } = fixture(),
      poly = draftPolyline(
        context.settings,
        [p(0, 0), p(10, 0), p(10, 10), p(0, 10), p(0, 1)],
        false,
      );
    context.entities = [poly];
    const result = outlineRun(
      cornerFactories.FILLET!,
      [
        { entity: poly, point: p(1, 0) },
        { entity: poly, point: p(0, 2) },
      ],
      context,
    ).entities[0];
    if (result?.type !== 'polyline') throw new Error('Expected polyline');
    expect(result.closed).toBe(true);
    expect(result.points).toEqual([p(2, 0), p(10, 0), p(10, 10), p(0, 10), p(0, 2)]);
    expect(result.bulges!.at(-1)).toBeCloseTo(Math.tan(Math.PI / 8), 10);
  });
});
