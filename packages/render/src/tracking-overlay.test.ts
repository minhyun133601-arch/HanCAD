import { expect, it } from 'vitest';
import { extensionTrackingPoints } from '@hancad/draft';
import type { SnapSource } from '@hancad/draft';
import { drawTrackingOverlay } from './tracking-overlay';

it('renders sampled conic tracking even when straight alignment paths extend across the screen', () => {
  const source: SnapSource = {
    id: 'arc',
    geometry: {
      type: 'ARC',
      center: { x: 0, y: 0, z: 0 },
      radius: 10,
      normal: { x: 0, y: 0, z: 1 },
      xAxis: { x: 1, y: 0, z: 0 },
      startAngle: 0,
      sweepAngle: Math.PI / 2,
    },
  };
  const from = { x: 0, y: -10 },
    to = { x: -10, y: 0 },
    points = extensionTrackingPoints(source, from, to, 0.01)!;
  const drawn: { x: number; y: number }[] = [];
  const context = {
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {},
    stroke() {},
    moveTo(x: number, y: number) {
      drawn.push({ x, y });
    },
    lineTo(x: number, y: number) {
      drawn.push({ x, y });
    },
  } as unknown as CanvasRenderingContext2D;
  drawTrackingOverlay(
    context,
    { width: 800, height: 600 },
    (point) => ({ x: point.x + 100, y: point.y + 100 }),
    { points: [], paths: [{ from, to, angle: 0, kind: 'extension', fullScreen: true, points }] },
  );
  expect(drawn[0]).toEqual({ x: 100, y: 90 });
  expect(drawn.at(-1)).toEqual({ x: 90, y: 100 });
  expect(drawn.length).toBeGreaterThan(3);
  for (const point of drawn) expect(Math.hypot(point.x - 100, point.y - 100)).toBeCloseTo(10, 8);
});
