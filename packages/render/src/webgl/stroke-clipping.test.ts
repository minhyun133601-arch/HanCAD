import { describe, expect, it } from 'vitest';
import type { DisplayEntity } from '../display/types';
import { buildMesh, expandStrokeView } from './mesh';

const line: DisplayEntity = {
  id: 'long-wide',
  geometry: { type: 'line', start: { x: -1e8, y: 101 }, end: { x: 1e8, y: 101 } },
  layer: '0',
  color: { kind: 'aci', index: 7 },
  linetype: 'CONTINUOUS',
  linetypeScale: 1,
  lineweight: 211,
  transparency: 0,
  plinegen: false,
};
describe('resolved wide-stroke clipping', () => {
  it('keeps a centerline just outside the view when its resolved stroke crosses the edge', () => {
    const view = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    const plain = buildMesh([{ entity: line, slot: 0 }], { tolerance: 0.25, view });
    expect(plain.lines).toHaveLength(0);
    const padded = buildMesh([{ entity: line, slot: 0 }], {
      tolerance: 0.25,
      view,
      strokePadding: 5,
    });
    expect(padded.lines).toHaveLength(10);
    expect(padded.lines[1]! + padded.origin.y).toBe(101);
    expect(padded.lines[0]! + padded.origin.x).toBeCloseTo(-105, 5);
    expect(padded.lines[5]! + padded.origin.x).toBeCloseTo(105, 5);
    expect(padded.viewDependent).toBe(true);
  });
  it('clips infinite construction lines against the padded stroke view as well', () => {
    const mesh = buildMesh(
      [
        {
          entity: {
            ...line,
            geometry: {
              type: 'xline',
              basePoint: { x: 0, y: 101 },
              direction: { x: 1, y: 0 },
            },
          },
          slot: 0,
        },
      ],
      { tolerance: 0.25, strokePadding: 5, view: { minX: -100, minY: -100, maxX: 100, maxY: 100 } },
    );
    expect(mesh.lines).toHaveLength(10);
    expect(mesh.lines[1]! + mesh.origin.y).toBe(101);
    expect(mesh.viewDependent).toBe(true);
  });
  it('expands model bounds symmetrically by the supplied resolved screen extent', () => {
    expect(expandStrokeView({ minX: 0, minY: 1, maxX: 2, maxY: 3 }, 0.5)).toEqual({
      minX: -0.5,
      minY: 0.5,
      maxX: 2.5,
      maxY: 3.5,
    });
  });
});
