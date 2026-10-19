import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRuntime } from './test-runtime';
import { createEmptyCadState, normalizeCadState } from './bridge';
import type { CadEntity } from './types';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
const base = (): CadEntity => ({
  id: 'source',
  type: 'polyline',
  layer: '0',
  color: '#ffffff',
  lineWidth: 1,
  closed: false,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ],
});
const drawing = (entity: unknown) => ({ ...createEmptyCadState(), entities: [entity] });

describe('drawing metadata validation and recovery', () => {
  it('preserves exact curves, per-vertex widths and multilingual multiline styles through JSON', () => {
    const entity = {
      ...base(),
      curve: {
        type: 'ELLIPSE',
        center: { x: 200000000, y: 500000000, z: 0 },
        majorAxis: { x: 10, y: 5, z: 0 },
        minorAxis: { x: -2, y: 4, z: 0 },
        startParameter: 0,
        sweepParameter: 2 * Math.PI,
      },
      sourceType: 'ELLIPSE',
      constantWidth: 2,
      startWidths: [1, 2],
      endWidths: [2, 3],
      elevation: 4,
      thickness: -2,
    };
    const source = {
      ...drawing(entity),
      mlineStyles: [{ name: '벽체', description: '이중선', offsets: [0.5, -0.5] }],
    };
    const result = normalizeCadState(JSON.parse(JSON.stringify(source)));
    expect(result.entities[0]).toEqual(entity);
    expect(result.mlineStyles).toEqual(source.mlineStyles);
  });
  it('rejects malformed curve fields and invalid geometric domains at the persistent boundary', () => {
    for (const curve of [
      {
        type: 'CIRCLE',
        center: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        xAxis: { x: 1, y: 0, z: 0 },
        radius: -1,
      },
      { type: 'XLINE', basePoint: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } },
      {
        type: 'ELLIPSE',
        center: { x: 0, y: 0, z: 0 },
        majorAxis: { x: 1, y: 0, z: 0 },
        minorAxis: { x: 0, y: 0, z: 0 },
        startParameter: 0,
        sweepParameter: 1,
      },
      { type: 'POINT', position: { x: '0', y: 0, z: 0 } },
    ])
      expect(() => normalizeCadState(drawing({ ...base(), curve }))).toThrow();
  });
  it('rejects nonfinite geometry and mismatched width arrays without dropping the entity', () => {
    expect(() => normalizeCadState(drawing({ ...base(), startWidths: [1] }))).toThrow('width');
    expect(() => normalizeCadState(drawing({ ...base(), endWidths: [1, -1] }))).toThrow('width');
    expect(() =>
      normalizeCadState(
        drawing({ ...base(), curve: { type: 'POINT', position: { x: Infinity, y: 0, z: 0 } } }),
      ),
    ).toThrow();
  });
  it('validates exact region boundaries and multiline paths before cache or clipboard publication', () => {
    const region = {
      ...base(),
      sourceType: 'REGION',
      regionArea: 100,
      regionLoops: [[{ type: 'LINE', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } }]],
    };
    expect(normalizeCadState(drawing(region)).entities[0]?.regionLoops).toEqual(region.regionLoops);
    expect(() => normalizeCadState(drawing({ ...region, regionArea: -100 }))).toThrow('region');
    expect(() =>
      normalizeCadState(
        drawing({
          ...base(),
          drawPaths: [
            [
              { x: 0, y: 0 },
              { x: 'invalid', y: 1 },
            ],
          ],
        }),
      ),
    ).toThrow('paths');
    expect(() =>
      normalizeCadState(
        drawing({
          ...base(),
          mline: {
            vertices: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            offsets: ['bad'],
            style: 'bad',
            justification: 0,
            scale: 1,
            closed: false,
          },
        }),
      ),
    ).toThrow('multiline');
  });
});
