import { expect, it } from 'vitest';
import { evaluateGeometry, type HelixGeometry } from '@hancad/geom';
import { curveBreaks } from './curves';
import { collectGeometry } from './tessellate';
import { distanceToGeometry } from './distance';

it('renders and picks all spiral turns without multi-turn aliasing', () => {
  const curve: HelixGeometry = {
    type: 'HELIX',
    center: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xAxis: { x: 1, y: 0, z: 0 },
    baseRadius: 1,
    topRadius: 9,
    turns: 12,
    height: 0,
    clockwise: false,
    startAngle: 0,
  };
  const source = { type: 'curve' as const, curve },
    tolerance = 0.01;
  expect(curveBreaks(curve)).toHaveLength(49);
  const run = collectGeometry(source, { tolerance }).runs[0]!;
  expect(run.closed).toBe(false);
  expect(run.vertices.length / 3).toBeGreaterThan(500);
  const first = { x: run.vertices[0]!, y: run.vertices[1]! },
    last = { x: run.vertices.at(-3)!, y: run.vertices.at(-2)! };
  expect(first.x).toBe(1);
  expect(last.x).toBeCloseTo(9, 12);
  const point = evaluateGeometry(curve, 0.213);
  expect(distanceToGeometry(source, point)).toBeLessThan(1e-8);
});
