import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geometryEvaluation } from '@hancad/geom';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { drawGripProvider } from './draw-grips';
import { transformGripEntity } from './grip-transform';
import { selectCadArea } from './selection';
import { selectCadPath } from './selection-path';
import { cloudDirectionReversed, cloudEntity } from './draw-cloud-geometry';
import { drawEntityContext } from './draw-regenerate';
import { gripProvider } from './grip-providers';
import { arcEntity } from './draw-curve-helpers';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const base = (): CadEntity => ({
  id: 'shape',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  type: 'polyline',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
  closed: false,
});
const ellipse = (): CadEntity => ({
  ...base(),
  sourceType: 'ELLIPSE',
  curve: {
    type: 'ELLIPSE',
    center: { x: 0, y: 0, z: 0 },
    majorAxis: { x: 10, y: 0, z: 0 },
    minorAxis: { x: 0, y: 5, z: 0 },
    startParameter: 0,
    sweepParameter: 2 * Math.PI,
  },
});

describe('exact draw metadata across grips and selection', () => {
  it('ARC retains its center/start/end/mid grips and edits refresh exact source geometry', () => {
    const entity = arcEntity(drawEntityContext(base()), { x: 0, y: 0 }, 10, 0, Math.PI / 2);
    const provider = gripProvider(entity);
    expect(provider.grips(entity, true).map((grip) => grip.key)).toEqual([
      'center',
      'start',
      'end',
      'mid',
    ]);
    const result = provider.stretch(entity, ['mid'], { x: 2, y: 0 });
    if (result.type !== 'arc' || result.curve?.type !== 'ARC')
      throw new Error('Missing edited arc source.');
    expect(result.curve.radius).toBe(result.radius);
    expect(result.curve.center.x).toBe(result.center.x);
    expect(result.curve.center.y).toBe(-result.center.y);
    const start = geometryEvaluation(result.curve, 0).point,
      end = geometryEvaluation(result.curve, 1).point;
    expect(start.x).toBeCloseTo(10, 9);
    expect(start.y).toBeCloseTo(0, 9);
    expect(end.x).toBeCloseTo(0, 9);
    expect(end.y).toBeCloseTo(10, 9);
    expect(result.curve).not.toEqual(entity.curve);
  });
  it('ellipse center and axis grips preserve an orthogonal exact curve', () => {
    const entity = ellipse();
    expect(drawGripProvider.grips(entity, true)).toHaveLength(5);
    const moved = drawGripProvider.stretch(entity, ['center'], { x: 20, y: -30 });
    expect(moved.curve).toMatchObject({ center: { x: 20, y: 30, z: 0 } });
    const stretched = drawGripProvider.stretch(entity, ['major1'], { x: 0, y: -10 });
    if (stretched.curve?.type !== 'ELLIPSE') throw new Error('Missing exact ellipse.');
    const a = stretched.curve.majorAxis,
      b = stretched.curve.minorAxis;
    expect(a.x * b.x + a.y * b.y).toBeCloseTo(0, 9);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(Math.sqrt(200), 9);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(5, 9);
  });
  it('elliptical arc endpoint grips preserve sweep sense and major arcs under zero displacement', () => {
    for (const sweep of [-Math.PI / 2, Math.PI / 2, -4, 4])
      for (const key of ['start', 'end']) {
        const entity = ellipse();
        if (entity.curve?.type !== 'ELLIPSE') throw new Error('Missing ellipse source');
        entity.curve.startParameter = 2.9;
        entity.curve.sweepParameter = sweep;
        const result = drawGripProvider.stretch(entity, [key], { x: 0, y: 0 });
        if (result.curve?.type !== 'ELLIPSE') throw new Error('Missing edited ellipse');
        expect(result.curve.sweepParameter).toBeCloseTo(sweep, 12);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const actual = geometryEvaluation(result.curve, t).point,
            expected = geometryEvaluation(entity.curve, t).point;
          expect(actual.x).toBeCloseTo(expected.x, 10);
          expect(actual.y).toBeCloseTo(expected.y, 10);
        }
      }
  });
  it('moves either endpoint of a clockwise elliptical arc while retaining the other endpoint', () => {
    const entity = ellipse();
    if (entity.curve?.type !== 'ELLIPSE') throw new Error('Missing ellipse source');
    entity.curve.sweepParameter = -Math.PI / 2;
    const end = drawGripProvider.stretch(entity, ['end'], { x: 5, y: 5 * (Math.sqrt(3) / 2 - 1) });
    if (end.curve?.type !== 'ELLIPSE') throw new Error('Missing edited ellipse');
    expect(end.curve.sweepParameter).toBeCloseTo(-Math.PI / 3, 12);
    expect(geometryEvaluation(end.curve, 0).point).toEqual(
      geometryEvaluation(entity.curve, 0).point,
    );
    const start = drawGripProvider.stretch(entity, ['start'], {
      x: 10 * (Math.sqrt(3) / 2 - 1),
      y: 2.5,
    });
    if (start.curve?.type !== 'ELLIPSE') throw new Error('Missing edited ellipse');
    expect(start.curve.sweepParameter).toBeCloseTo(-Math.PI / 3, 12);
    const fixedEnd = geometryEvaluation(start.curve, 1).point;
    expect(fixedEnd.x).toBeCloseTo(0, 12);
    expect(fixedEnd.y).toBeCloseTo(-5, 12);
  });
  it('point and ray grips change source geometry without converting to finite linework', () => {
    const point = {
      ...base(),
      sourceType: 'POINT',
      curve: { type: 'POINT' as const, position: { x: 3, y: 4, z: 5 } },
    };
    expect(drawGripProvider.stretch(point, ['position'], { x: 10, y: 20 }).curve).toEqual({
      type: 'POINT',
      position: { x: 13, y: -16, z: 5 },
    });
    const ray = {
      ...base(),
      sourceType: 'RAY',
      curve: {
        type: 'RAY' as const,
        basePoint: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
      },
    };
    expect(drawGripProvider.stretch(ray, ['direction'], { x: 0, y: -2 }).curve).toMatchObject({
      type: 'RAY',
      direction: { x: 1, y: 2, z: 0 },
    });
  });
  it('scale and mirror preserve exact geometry, widths and fill boundaries', () => {
    const source = {
      ...ellipse(),
      constantWidth: 4,
      startWidths: [2, 3],
      endWidths: [3, 4],
      drawFill: [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: -10 },
        ],
      ],
    } as CadEntity;
    const result = transformGripEntity(source, 'SCALE', { x: 0, y: 0 }, 2);
    expect(result).toMatchObject({
      constantWidth: 8,
      startWidths: [4, 6],
      endWidths: [6, 8],
      drawFill: [
        [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 0, y: -20 },
        ],
      ],
    });
    if (!result.curve) throw new Error('Missing curve.');
    expect(geometryEvaluation(result.curve, 0.25).point.y).toBeCloseTo(10, 9);
    const mirrored = transformGripEntity(result, 'MIRROR', { x: 0, y: 0 }, 0);
    if (!mirrored.curve) throw new Error('Missing curve.');
    expect(geometryEvaluation(mirrored.curve, 0.25).point.y).toBeCloseTo(-10, 9);
  });
  it('window/crossing/fence use ellipse extrema instead of its compatibility control points', () => {
    const state = { ...createEmptyCadState(), entities: [ellipse()] };
    expect(selectCadArea(state, { x: -11, y: -6 }, { x: 11, y: 6 }, 'window')).toEqual(['shape']);
    expect(selectCadArea(state, { x: -11, y: -1 }, { x: 11, y: 1 }, 'window')).toEqual([]);
    expect(selectCadArea(state, { x: -1, y: -6 }, { x: 1, y: -4 }, 'crossing')).toEqual(['shape']);
    expect(
      selectCadPath(
        state,
        [
          { x: -1, y: -5 },
          { x: 1, y: -5 },
        ],
        'fence',
      ),
    ).toEqual(['shape']);
  });
  it('construction lines crossing a distant window remain unbounded and never window-contained', () => {
    const entity = {
      ...base(),
      sourceType: 'XLINE',
      curve: {
        type: 'XLINE' as const,
        basePoint: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
      },
    };
    const state = { ...createEmptyCadState(), entities: [entity] };
    expect(
      selectCadArea(state, { x: 200000000, y: -1 }, { x: 200000010, y: 1 }, 'crossing'),
    ).toEqual(['shape']);
    expect(selectCadArea(state, { x: -1, y: -1 }, { x: 10, y: 1 }, 'window')).toEqual([]);
  });
  it('region center grips translate exact boundary definitions and preserve area', () => {
    const entity = {
      ...base(),
      sourceType: 'REGION',
      regionArea: Math.PI * 4,
      regionLoops: [
        [
          {
            type: 'CIRCLE' as const,
            center: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 1 },
            xAxis: { x: 1, y: 0, z: 0 },
            radius: 2,
          },
        ],
      ],
    };
    const grips = drawGripProvider.grips(entity, true);
    expect(grips).toHaveLength(1);
    const result = drawGripProvider.stretch(entity, ['center'], { x: 7, y: 8 });
    expect(result.regionLoops?.[0]?.[0]).toMatchObject({ center: { x: 7, y: -8, z: 0 } });
    expect(result.regionArea).toBeCloseTo(Math.PI * 4, 9);
  });
  it('revision-cloud corner grips regenerate scallops with their saved settings', () => {
    const source = cloudEntity(
      drawEntityContext(base()),
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ],
      true,
      { chord: 5, calligraphy: true, variance: false },
    );
    const result = drawGripProvider.stretch(source, ['cloud1'], { x: 5, y: 0 });
    expect(drawGripProvider.grips(source, true)).toHaveLength(4);
    expect(result.cloudVertices?.[1]).toEqual({ x: 35, y: 0 });
    expect(result.cloudStyle).toBe('Calligraphy');
    expect(result.cloudVariance).toBe(false);
    expect(normalizeCadState({ ...createEmptyCadState(), entities: [result] }).entities[0]).toEqual(
      result,
    );
  });
  it('retains reversed revision-cloud scallops across corner edits, normalization and reflection', () => {
    const source = cloudEntity(
      drawEntityContext(base()),
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ],
      true,
      { chord: 5, calligraphy: true, variance: false, reversed: true },
    );
    expect(cloudDirectionReversed(source)).toBe(true);
    const result = drawGripProvider.stretch(source, ['cloud1'], { x: 5, y: 0 });
    expect(cloudDirectionReversed(result)).toBe(true);
    if (result.type !== 'polyline') throw new Error('Missing revision cloud');
    expect(result.bulges?.every((bulge) => bulge < 0)).toBe(true);
    const restored = normalizeCadState({ ...createEmptyCadState(), entities: [result] })
      .entities[0]!;
    expect(
      cloudDirectionReversed(drawGripProvider.stretch(restored, ['cloud2'], { x: 0, y: 5 })),
    ).toBe(true);
    const reflected = transformGripEntity(restored, 'MIRROR', { x: 0, y: 0 }, 0);
    expect(
      cloudDirectionReversed(drawGripProvider.stretch(reflected, ['cloud1'], { x: 5, y: 0 })),
    ).toBe(true);
    expect(source.cloudVertices?.[1]).toEqual({ x: 30, y: 0 });
  });
});
