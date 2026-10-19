import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { SystemVariables } from '@hancad/sysvars';
import { pointProgram, poly3Program, solidProgram, traceProgram } from './draw-basic';
import { divideProgram, measureProgram, parameterAtDrawDistance } from './draw-divide';
import { drawMultiline, mlineProgram } from './draw-mline';
import type { DrawContext, DrawFactory, DrawResult, DrawValue } from './draw-program';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function context(entities: CadEntity[] = []): DrawContext {
  const vars = new SystemVariables();
  return {
    settings: createEmptyCadState().settings,
    coordinates: () => ({}),
    get: (name) => vars.get(name),
    set: (name, value) => {
      if (typeof value === 'number' || typeof value === 'string') vars.set(name, value);
    },
    entities,
    memory: new Map(),
  };
}
function run(factory: DrawFactory, values: DrawValue[], ctx = context()): DrawResult {
  const program = factory(ctx);
  let step = program.next();
  for (const value of values) {
    if (step.done) throw new Error('Unexpected extra script input.');
    step = program.next(value);
  }
  if (!step.done) throw new Error(`Incomplete script: ${step.value.en}`);
  return step.value;
}
const point = (x: number, y: number, z?: number): CadPoint => ({
  x,
  y,
  ...(z === undefined ? {} : { z }),
});
const line = (ctx: DrawContext): CadEntity => ({
  ...ctx.settings,
  id: 'a',
  type: 'line',
  a: point(0, 0),
  b: point(100, 0),
});

describe('remaining draw-command parity scripts', () => {
  it('POINT preserves exact WCS coordinates and a single native node', () => {
    const entity = run(pointProgram, [point(123.456789123, -9, 4)]).entities[0]!;
    expect(entity.curve).toEqual({ type: 'POINT', position: { x: 123.456789123, y: 9, z: 4 } });
    expect(normalizeCadState({ ...createEmptyCadState(), entities: [entity] }).entities[0]).toEqual(
      entity,
    );
  });
  it('3DPOLY preserves Z and local Undo then closes as a 3D polyline', () => {
    const entity = run(poly3Program, [
      point(0, 0, 1),
      point(10, 0, 2),
      point(10, -10, 3),
      'U',
      point(0, -10, 7),
      'C',
    ]).entities[0]!;
    expect(entity.curve).toMatchObject({
      type: 'POLYLINE',
      is3D: true,
      closed: true,
      vertices: [
        { position: { x: 0, y: 0, z: 1 } },
        { position: { x: 10, y: 0, z: 2 } },
        { position: { x: 0, y: 10, z: 7 } },
      ],
    });
  });
  it('SOLID uses crossed input order and retains shared edges for following faces', () => {
    const result = run(solidProgram, [
      point(0, 0),
      point(10, 0),
      point(0, 10),
      point(10, 10),
      point(0, 20),
      point(10, 20),
      '',
    ]);
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]?.drawFill?.[0]).toEqual([
      point(0, 0),
      point(10, 0),
      point(10, 10),
      point(0, 10),
    ]);
    expect(result.entities[1]?.drawFill?.[0]).toEqual([
      point(0, 10),
      point(10, 10),
      point(10, 20),
      point(0, 20),
    ]);
  });
  it('SOLID accepts a triangular final face', () => {
    const entity = run(solidProgram, [point(0, 0), point(10, 0), point(0, 10), '']).entities[0]!;
    expect(entity.drawFill?.[0]).toHaveLength(3);
  });
  it('legacy TRACE remembers its width without changing lineweight', () => {
    const ctx = context(),
      result = run(traceProgram, ['5', point(0, 0), point(10, 0), ''], ctx);
    expect(result.entities[0]).toMatchObject({
      sourceType: 'TRACE',
      drawFill: [
        [
          { x: 0, y: -2.5 },
          { x: 0, y: 2.5 },
          { x: 10, y: 2.5 },
          { x: 10, y: -2.5 },
        ],
      ],
    });
    expect(ctx.get('TRACEWID')).toBe(5);
  });
  it('DIVIDE places n-1 nodes without changing the selected line', () => {
    const ctx = context(),
      source = line(ctx);
    ctx.entities = [source];
    const result = run(divideProgram, [{ entity: source, point: point(99, 0) }, '4'], ctx);
    expect(result.entities.map((e) => e.curve)).toEqual(
      [25, 50, 75].map((x) => ({ type: 'POINT', position: { x, y: 0, z: 0 } })),
    );
    expect(source).toEqual(line(ctx));
  });
  it('MEASURE leaves the remainder and excludes the endpoint', () => {
    const ctx = context(),
      source = line(ctx);
    ctx.entities = [source];
    const result = run(measureProgram, [{ entity: source, point: point(0, 0) }, '30'], ctx);
    expect(result.entities.map((e) => e.curve)).toEqual(
      [30, 60, 90].map((x) => ({ type: 'POINT', position: { x, y: 0, z: 0 } })),
    );
  });
  it('MEASURE starts at the picked endpoint and circles honor SNAPANG', () => {
    const ctx = context(),
      source = line(ctx);
    ctx.entities = [source];
    const reversed = run(measureProgram, [{ entity: source, point: point(99, 0) }, '30'], ctx);
    expect(
      reversed.entities.map((entity) =>
        entity.curve?.type === 'POINT' ? entity.curve.position.x : undefined,
      ),
    ).toEqual([70, 40, 10]);
    ctx.set('SNAPANG', Math.PI / 2);
    const circle: CadEntity = {
      ...ctx.settings,
      id: 'circle',
      type: 'circle',
      center: point(0, 0),
      radius: 10,
    };
    ctx.entities = [circle];
    const result = run(
      measureProgram,
      [{ entity: circle, point: point(10, 0) }, String(5 * Math.PI)],
      ctx,
    );
    if (result.entities[0]?.curve?.type !== 'POINT') throw new Error('Missing measured node.');
    expect(result.entities[0].curve.position.x).toBeCloseTo(-10, 9);
    expect(result.entities[0].curve.position.y).toBeCloseTo(0, 9);
  });
  it('DIVIDE Block aligns a saved block to the tangent and preserves membership', () => {
    const ctx = context(),
      source = { ...line(ctx), b: point(0, -100) } as CadEntity;
    const blockLine = { ...line(ctx), id: 'member', b: point(10, 0) } as CadEntity;
    ctx.entities = [source, blockLine];
    ctx.blocks = [{ name: 'sample', basePoint: point(0, 0), entityIds: ['member'] }];
    const result = run(
      divideProgram,
      [{ entity: source, point: point(0, 0) }, 'B', 'sample', 'Y', '2'],
      ctx,
    );
    expect(result.clipboardBlocks).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({ type: 'line', a: { x: 0, y: -50 }, b: { y: -60 } });
    if (result.entities[0]?.type === 'line') expect(result.entities[0].b.x).toBeCloseTo(0, 9);
  });
  it('MLINE Top/Zero/Bottom follow metric CMLSCALE and miter adjoining rails', () => {
    const ctx = context();
    const top = drawMultiline(
      ctx,
      [point(0, 0), point(100, 0)],
      false,
      [0.5, -0.5],
      20,
      0,
      'Standard',
    );
    expect(top.drawPaths).toEqual([
      [point(0, 0), point(100, 0)],
      [point(0, 20), point(100, 20)],
    ]);
    const zero = drawMultiline(
      ctx,
      [point(0, 0), point(10, 0), point(10, -10)],
      false,
      [0.5, -0.5],
      2,
      1,
      'Standard',
    );
    expect(zero.drawPaths?.[0]?.[1]).toEqual(point(9, -1));
    const bottom = drawMultiline(
      ctx,
      [point(0, 0), point(100, 0)],
      false,
      [0.5, -0.5],
      20,
      2,
      'Standard',
    );
    expect(bottom.drawPaths?.[0]?.[0]).toEqual(point(0, -20));
  });
  it('MLINE scripted justification/scale/local undo commit a single definition', () => {
    const ctx = context(),
      result = run(
        mlineProgram,
        ['J', 'Z', 'S', '2', point(0, 0), point(10, 0), point(20, 0), 'U', point(10, -10), 'C'],
        ctx,
      );
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.mline).toMatchObject({
      scale: 2,
      justification: 1,
      closed: true,
      vertices: [point(0, 0), point(10, 0), point(10, -10)],
    });
  });
  it('curve-distance inversion meets 1e-9 on an ellipse and a polyline corner', () => {
    expect(
      parameterAtDrawDistance(
        {
          type: 'LWPOLYLINE',
          vertices: [point(0, 0), point(10, 0), point(10, 30)].map((p) => ({
            position: { ...p, z: 0 },
            bulge: 0,
            startWidth: 0,
            endWidth: 0,
          })),
          closed: false,
          is3D: false,
          normal: { x: 0, y: 0, z: 1 },
          constantWidth: 0,
        },
        20,
      ),
    ).toBeCloseTo(2 / 3, 9);
    const ellipse = {
      type: 'ELLIPSE' as const,
      center: { x: 0, y: 0, z: 0 },
      majorAxis: { x: 10, y: 0, z: 0 },
      minorAxis: { x: 0, y: 10, z: 0 },
      startParameter: 0,
      sweepParameter: 2 * Math.PI,
    };
    expect(parameterAtDrawDistance(ellipse, 5 * Math.PI)).toBeCloseTo(0.25, 9);
  });
});
