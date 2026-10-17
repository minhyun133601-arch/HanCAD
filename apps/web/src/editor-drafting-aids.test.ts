import { describe, expect, it } from 'vitest';
import { SnapIndex } from '@hancad/draft';
import type { SnapSource, DraftingConstraintSettings } from '@hancad/draft';
import { EditorDraftingAids, type AidQuery } from './editor-drafting-aids';

const settings: DraftingConstraintSettings = {
  ortho: false,
  snap: false,
  grid: {
    spacing: { x: 10, y: 10 },
    base: { x: 0, y: 0 },
    angle: 0,
    isometric: false,
    isoplane: 0,
  },
  polar: true,
  polarIncrement: 90,
  polarAdditional: [],
  polarMode: 0,
  angleBase: 0,
  clockwise: false,
  polarSnap: false,
  polarDistance: 0,
};
const line = (id: string, x: number, y: number, endX: number, endY: number): SnapSource => ({
  id,
  geometry: { type: 'LINE', start: { x, y, z: 0 }, end: { x: endX, y: endY, z: 0 } },
});
const query = (index: SnapIndex, overrides: Partial<AidQuery> = {}): AidQuery => ({
  index,
  point: { x: 0, y: 0 },
  tolerance: 1,
  osmode: 1,
  osoptions: 7,
  autosnap: 63,
  settings,
  temporary: [],
  shift: false,
  time: 0,
  explicitIntersection: false,
  ...overrides,
});

describe('shared editor aid point pipeline', () => {
  it('acquires two stationary endpoints and returns their exact alignment intersection', () => {
    const aids = new EditorDraftingAids(),
      index = new SnapIndex([line('a', 40, 0, 60, 0), line('b', 0, 60, 0, 80)]);
    const a = query(index, { point: { x: 40.2, y: 0.1 } });
    expect(aids.resolve(a).wait).toBe(400);
    aids.resolve({ ...a, time: 401 });
    aids.resolve(query(index, { point: { x: 0, y: -60 }, time: 500 }));
    aids.resolve(query(index, { point: { x: 0, y: -60 }, time: 901 }));
    const target = aids.resolve(query(index, { point: { x: 40.3, y: -60.4 }, time: 1000 }));
    expect(target.point).toEqual({ x: 40, y: -60 });
    expect(target.paths).toHaveLength(2);
    expect(target.trackingKind).toBe('object');
    expect(target.trackingBase).toBeDefined();
    aids.clear();
    expect(
      aids.resolve(query(index, { point: { x: 40.3, y: -60.4 } })).trackingKind,
    ).toBeUndefined();
  });
  it('cycles snap candidates without changing the cursor, and exact snaps beat grid/Ortho', () => {
    const aids = new EditorDraftingAids(),
      index = new SnapIndex([line('a', 3, 4, 3.5, 4.5)]);
    const input = query(index, {
      point: { x: 3.2, y: -4.2 },
      settings: { ...settings, snap: true, ortho: true },
      base: { x: 0, y: 0 },
    });
    expect(aids.resolve(input).point).toEqual({ x: 3, y: -4 });
    expect(aids.cycle()).toBe(true);
    expect(aids.resolve(input).point).toEqual({ x: 3.5, y: -4.5 });
    expect(aids.resolve({ ...input, point: { x: 3, y: -4 } }).point).toEqual({ x: 3, y: -4 });
  });
  it('uses TT points even with running OTRACK off and respects Shift-only hover acquisition', () => {
    const aids = new EditorDraftingAids(),
      index = new SnapIndex([line('a', 10, 10, 20, 10)]);
    aids.resolve(
      query(index, { point: { x: 10, y: -10 }, settings: { ...settings, polarMode: 8 } }),
    );
    aids.resolve(
      query(index, {
        point: { x: 10, y: -10 },
        time: 1000,
        settings: { ...settings, polarMode: 8 },
      }),
    );
    expect(aids.tracking.acquired).toHaveLength(0);
    const result = aids.resolve(
      query(index, {
        point: { x: 40.2, y: -60.1 },
        autosnap: 0,
        temporary: [
          { x: 40, y: 0 },
          { x: 0, y: -60 },
        ],
      }),
    );
    expect(result.point).toEqual({ x: 40, y: -60 });
  });
  it('acquires extension/parallel geometry, retains it after leaving the aperture and clears per pick', () => {
    const aids = new EditorDraftingAids(),
      index = new SnapIndex([line('a', 0, 0, 20, 0)]);
    const input = query(index, { point: { x: 20, y: 0 }, osmode: 4096 | 8192 });
    aids.resolve(input);
    aids.resolve({ ...input, time: 401 });
    expect(aids.resolve({ ...input, point: { x: 40, y: 0.2 }, time: 500 }).snap?.kind).toBe(
      'extension',
    );
    const parallel = aids.resolve({
      ...input,
      point: { x: 50, y: -10.2 },
      base: { x: 0, y: -10 },
      time: 501,
    });
    expect(parallel.snap?.kind).toBe('parallel');
    expect(parallel.point.y).toBe(-10);
    aids.clear();
    expect(aids.resolve({ ...input, point: { x: 40, y: 0.2 } }).snap).toBeUndefined();
  });
  it('computes the far intersection after two finite-object acquisitions', () => {
    const aids = new EditorDraftingAids();
    aids.acquireIntersection(line('a', 0, 0, 10, 0));
    const target = aids.completeIntersection(line('b', 20, 10, 20, 20), { x: 20, y: -12 }, 32, 7);
    expect(target?.point.x).toBe(20);
    expect(target?.point.y).toBeCloseTo(0, 12);
  });
});
