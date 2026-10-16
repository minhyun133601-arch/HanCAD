import { describe, expect, it } from 'vitest';
import { boundsIntersect } from '../display/bounds';
import type { DisplayEntity } from '../display/types';
import { DisplaySpatialIndex } from './display-index';
import { RTree } from './rtree';

describe('dynamic R-tree', () => {
  it('matches a brute-force oracle after packed loading, inserts, splits, removals and an empty rebuild', () => {
    const entries = Array.from({ length: 3000 }, (_, id) => ({
      id,
      minX: (id * 7919) % 1000,
      minY: (id * 3571) % 1000,
      maxX: ((id * 7919) % 1000) + 5,
      maxY: ((id * 3571) % 1000) + 10,
    }));
    const tree = new RTree<(typeof entries)[number]>(8);
    tree.bulkLoad(entries.slice(0, 2000));
    for (const entry of entries.slice(2000)) tree.insert(entry);
    const removed = new Set(entries.filter((_, index) => index % 3 === 0));
    for (const entry of removed) expect(tree.remove(entry)).toBe(true);
    expect(tree.remove(entries[0]!)).toBe(false);
    expect(tree.size).toBe(2000);
    for (let i = 0; i < 60; i++) {
      const query = {
        minX: (i * 61) % 1000,
        minY: (i * 37) % 1000,
        maxX: ((i * 61) % 1000) + 73,
        maxY: ((i * 37) % 1000) + 101,
      };
      const expected = entries
        .filter((entry) => !removed.has(entry) && boundsIntersect(entry, query))
        .map(({ id }) => id)
        .sort((a, b) => a - b);
      expect(
        tree
          .search(query)
          .map(({ id }) => id)
          .sort((a, b) => a - b),
      ).toEqual(expected);
    }
    tree.bulkLoad([]);
    expect(tree.size).toBe(0);
    expect(tree.all()).toEqual([]);
    tree.insert(entries[0]!);
    expect(tree.all()).toEqual([entries[0]]);
  });
  it('rejects invalid finite boxes rather than corrupting the search tree', () => {
    expect(() => new RTree().insert({ minX: Infinity, minY: 0, maxX: Infinity, maxY: 0 })).toThrow(
      'bounds',
    );
  });
});

function line(id: string, y: number): DisplayEntity {
  return {
    id,
    geometry: { type: 'line', start: { x: 0, y }, end: { x: 10, y } },
    layer: '0',
    color: { kind: 'bylayer' },
    linetype: 'BYLAYER',
    linetypeScale: 1,
    lineweight: -1,
    transparency: 'bylayer',
    plinegen: false,
  };
}
describe('display picking index', () => {
  it('orders exact distances first and later draw order on ties, updating and removing incrementally', () => {
    const index = new DisplaySpatialIndex();
    index.set([line('A', 0), line('B', 0), line('C', 1), { ...line('hidden', 0), visible: false }]);
    expect(index.pick({ x: 5, y: 0 }, 2).map(({ entity }) => entity.id)).toEqual(['B', 'A', 'C']);
    index.upsert(line('B', 100));
    expect(index.pick({ x: 5, y: 0 }, 2).map(({ entity }) => entity.id)).toEqual(['A', 'C']);
    index.remove('A');
    expect(index.size).toBe(2);
    expect(index.search({ minX: 4, minY: 0, maxX: 6, maxY: 2 }).map(({ id }) => id)).toEqual(['C']);
  });
  it('includes unbounded lines without placing infinite coordinates into packed bounds', () => {
    const index = new DisplaySpatialIndex();
    index.set([
      {
        ...line('X', 0),
        geometry: { type: 'xline', basePoint: { x: 0, y: 0 }, direction: { x: 1, y: 0 } },
      },
    ]);
    expect(index.pick({ x: 1e8, y: 1 }, 2)[0]?.entity.id).toBe('X');
    expect(index.search({ minX: 1e8, minY: -1, maxX: 1e8 + 1, maxY: 1 })).toHaveLength(1);
    expect(index.search({ minX: 1e8, minY: 2, maxX: 1e8 + 1, maxY: 3 })).toHaveLength(0);
  });
});
