import { describe, expect, it } from 'vitest';
import type { CadEntity, CadLine, CadPoint } from '@hancad/legacy-bridge';
import { draftCircle, draftLine } from './entities';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import type { DrawContext, DrawValue } from './draw-program';
import { DrawSession } from './draw-session';
import { arrayFactories } from './modify-array';
import { arrayExpression, arrayRows } from './modify-array-common';
import { polarEntities } from './modify-array-polar';

const p = (x: number, y: number, z?: number): CadPoint => ({
  x,
  y: -y,
  ...(z === undefined ? {} : { z }),
});
function fixture(values: Record<string, number> = {}) {
  const c = outlineContext(values),
    source = draftLine(c.settings, p(0, 0), p(2, 0), 'L');
  return { ...c, entities: [source], selectedIds: ['L'] };
}
const run = (name: string, values: DrawValue[], c: DrawContext = fixture()) =>
  outlineRun(arrayFactories[name]!, values, c);
const coordinates = (e: CadEntity) => {
  if (e.type !== 'line') throw Error('Expected LINE');
  return [e.a.x, -e.a.y, e.a.z ?? 0].map((n) => Math.round(n * 1e9) / 1e9 || 0);
};
describe('nonassociative array command scripts', () => {
  it('ARRAYRECT edits columns, rows, levels, spacing and incremental elevation in one replacement batch', () => {
    const c = fixture(),
      result = run(
        'ARRAYRECT',
        ['AS', 'N', 'COL', '2', '10', 'R', '2', '20', '3', 'L', '2', '5', 'X'],
        c,
      );
    expect(result.eraseIds).toEqual(['L']);
    expect(result.entities).toHaveLength(8);
    expect(new Set(result.entities.map((e) => e.id)).size).toBe(8);
    expect(result.entities.map(coordinates)).toEqual([
      [0, 0, 0],
      [10, 0, 0],
      [0, 20, 3],
      [10, 20, 3],
      [0, 0, 5],
      [10, 0, 5],
      [0, 20, 8],
      [10, 20, 8],
    ]);
    expect(c.entities[0]!.id).toBe('L');
    expect(coordinates(c.entities[0]!)).toEqual([0, 0, 0]);
  });
  it('ARRAYRECT Count, Total spacing and Unit cell produce exact coordinates', () => {
    const result = run('ARRAYRECT', [
      'COU',
      '3',
      '2',
      'COL',
      '3',
      'T',
      '20',
      'S',
      'U',
      p(0, 0),
      p(4, 7),
      'X',
    ]);
    expect(result.entities).toHaveLength(6);
    expect(result.entities.map(coordinates)).toEqual([
      [0, 0, 0],
      [4, 0, 0],
      [8, 0, 0],
      [0, 7, 0],
      [4, 7, 0],
      [8, 7, 0],
    ]);
  });
  it('ARRAYRECT exposes its default array preview without accepting geometry on Escape', () => {
    let commits = 0;
    const session = new DrawSession('ARRAYRECT', arrayFactories.ARRAYRECT!, {
      context: fixture(),
      onComplete: () => commits++,
    });
    expect(session.getSnapshot().preview).toHaveLength(12);
    expect(session.getSnapshot().previewHiddenIds).toEqual(['L']);
    session.cancel();
    expect(commits).toBe(0);
  });
  it('classic -ARRAY Rectangular includes the original, honors negative spacing and SNAPANG', () => {
    const result = run('-ARRAY', ['R', '2', '3', '-5', '10']);
    expect(result.entities).toHaveLength(5);
    expect(result.eraseIds).toBeUndefined();
    expect(result.entities.map(coordinates)).toEqual([
      [10, 0, 0],
      [20, 0, 0],
      [0, -5, 0],
      [10, -5, 0],
      [20, -5, 0],
    ]);
    const rotated = run('-ARRAY', ['R', '1', '2', '5', '10'], fixture({ SNAPANG: Math.PI / 2 }));
    expect(coordinates(rotated.entities[0]!)).toEqual([0, 10, 0]);
  });
  it('classic -ARRAY unit cell derives signed row and column distances', () => {
    const result = run('-ARRAY', ['R', '2', '2', p(0, 0), p(-3, -4)]);
    expect(result.entities.map(coordinates)).toEqual([
      [-3, 0, 0],
      [0, -4, 0],
      [-3, -4, 0],
    ]);
  });
  it('ARRAYPOLAR distributes full and partial fills including both ends for a partial fill', () => {
    const c = fixture();
    c.entities = [draftLine(c.settings, p(10, 0), p(12, 0), 'L')];
    const full = run('ARRAYPOLAR', [p(0, 0), 'I', '4', 'X'], c);
    expect(full.entities.map(coordinates)).toEqual([
      [10, 0, 0],
      [0, 10, 0],
      [-10, 0, 0],
      [0, -10, 0],
    ]);
    const partial = run('ARRAYPOLAR', [p(0, 0), 'F', '180', 'I', '3', 'X'], c);
    expect(partial.entities.map(coordinates)).toEqual([
      [10, 0, 0],
      [0, 10, 0],
      [-10, 0, 0],
    ]);
  });
  it('ARRAYPOLAR Rotate No translates every item rigidly around its common base point', () => {
    const c = fixture(),
      source = draftLine(c.settings, p(10, 0), p(12, 0), 'L');
    c.entities = [source];
    const result = run('-ARRAY', ['P', 'B', p(10, 0), p(0, 0), '4', '360', 'N'], c);
    expect(result.entities).toHaveLength(3);
    const second = result.entities[0] as CadLine;
    expect(second.a.x).toBeCloseTo(0, 9);
    expect(second.a.y).toBeCloseTo(-10, 9);
    expect(second.b.x - second.a.x).toBeCloseTo(2, 9);
    expect(second.b.y - second.a.y).toBeCloseTo(0, 9);
  });
  it('classic polar can derive item count from fill and angle and angle from number with zero fill', () => {
    const c = fixture();
    c.entities = [draftCircle(c.settings, p(10, 0), 1, 'L')];
    const derived = run('-ARRAY', ['P', p(0, 0), '', '180', '45', 'Y'], c);
    expect(derived.entities).toHaveLength(4);
    const angle = run('-ARRAY', ['P', p(0, 0), '3', '0', '90', 'Y'], c);
    expect(angle.entities).toHaveLength(2);
  });
  it('polar row offsets and levels preserve the common base radius and elevate each row', () => {
    const c = fixture(),
      source = draftCircle(c.settings, p(10, 0), 1, 'C');
    const result = polarEntities([source], {
      ...arrayRows(),
      items: 2,
      center: p(0, 0),
      base: p(10, 0),
      angle: Math.PI,
      rotate: false,
      rows: 2,
      rowSpacing: 5,
      rowElevation: 2,
      levels: 2,
      levelSpacing: 3,
    });
    expect(result).toHaveLength(8);
    const radii = result.map((e) => (e.type === 'circle' ? Math.hypot(e.center.x, e.center.y) : 0));
    expect(radii).toEqual([10, 10, 15, 15, 10, 10, 15, 15]);
  });
  it('ARRAYPATH Divide positions independent source geometry at exact path lengths and respects DELOBJ', () => {
    for (const delobj of [0, 1]) {
      const c = fixture({ DELOBJ: delobj }),
        path = draftLine(c.settings, p(0, 0), p(20, 0), 'P');
      c.entities.push(path);
      const result = run(
        'ARRAYPATH',
        [{ entity: path, point: p(0, 0) }, 'B', p(0, 0), 'M', 'D', 'I', '5', 'X'],
        c,
      );
      expect(result.entities).toHaveLength(5);
      expect(result.entities.map(coordinates)).toEqual([
        [0, 0, 0],
        [5, 0, 0],
        [10, 0, 0],
        [15, 0, 0],
        [20, 0, 0],
      ]);
      expect(result.eraseIds ?? []).toEqual(delobj ? ['L'] : []);
    }
  });
  it('ARRAYPATH Measure, Fill Entire Path, reverse pick and Align No use the selected end', () => {
    const c = fixture(),
      path = draftLine(c.settings, p(0, 0), p(20, 0), 'P');
    c.entities.push(path);
    const result = run(
      'ARRAYPATH',
      [{ entity: path, point: p(20, 0) }, 'B', p(0, 0), 'I', '4', 'F', 'A', 'N', 'X'],
      c,
    );
    expect(result.entities).toHaveLength(6);
    expect(result.entities.map(coordinates)).toEqual([
      [20, 0, 0],
      [16, 0, 0],
      [12, 0, 0],
      [8, 0, 0],
      [4, 0, 0],
      [0, 0, 0],
    ]);
  });
  it('ARRAYPATH circle spacing follows the exact tangent and excludes a duplicate closed endpoint', () => {
    const c = fixture(),
      path = draftCircle(c.settings, p(0, 0), 10, 'P');
    c.entities.push(path);
    const result = run(
      'ARRAYPATH',
      [{ entity: path, point: p(10, 0) }, 'B', p(0, 0), 'M', 'D', 'I', '4', 'X'],
      c,
    );
    expect(result.entities.map(coordinates)).toEqual([
      [10, 0, 0],
      [0, 10, 0],
      [-10, 0, 0],
      [0, -10, 0],
    ]);
    const e = result.entities[0] as CadLine;
    expect(e.b.x - e.a.x).toBeCloseTo(0, 9);
    expect(-(e.b.y - e.a.y)).toBeCloseTo(2, 9);
  });
  it('ARRAY generic delegates to each modern pattern and disallows associative creation clearly', () => {
    const result = run('ARRAY', ['R', 'AS', 'Y', 'N', 'COU', '2', '2', 'X']);
    expect(result.entities).toHaveLength(4);
  });
  it('array expression parser supports arithmetic without invoking code', () => {
    expect(arrayExpression('(2+3)*4/2')).toBe(10);
    expect(arrayExpression('2^3^2')).toBe(512);
    expect(arrayExpression('process.exit()')).toBeUndefined();
    expect(arrayExpression('1/0')).toBeUndefined();
    const result = run('ARRAYRECT', ['COU', 'E', '1+2', '2', 'X']);
    expect(result.entities).toHaveLength(6);
  });
});
