import { describe, expect, it } from 'vitest';
import { simplifyPoints } from './lod';

describe('display level of detail', () => {
  it('removes subpixel curve steps without changing model points or endpoints', () => {
    const points = Array.from({ length: 1000 }, (_, i) => ({
      x: i / 100,
      y: Math.sin(i / 100) * 0.01,
    }));
    const original = structuredClone(points),
      simplified = simplifyPoints(points, 0.05);
    expect(simplified).toHaveLength(2);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified.at(-1)).toEqual(points.at(-1));
    expect(points).toEqual(original);
    expect(simplifyPoints(points, 0.00001).length).toBeGreaterThan(50);
  });
  it('keeps corners and closed-ring shape within the requested model tolerance', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ];
    expect(simplifyPoints(points, 0.1)).toEqual([
      points[0],
      points[2],
      points[3],
      points[4],
      points[5],
    ]);
  });
});
