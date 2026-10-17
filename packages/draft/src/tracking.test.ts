import { describe, expect, it } from 'vitest';
import { gridPoint, snapGridPoint } from '@hancad/geom';
import { constrainDraftingPoint, type DraftingConstraintSettings } from './drafting-constraints';
import { ObjectTracking } from './tracking';

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
describe('drafting constraints and acquired tracking paths', () => {
  it('finds the exact intersection of two acquired endpoint alignment paths', () => {
    const tracking = new ObjectTracking();
    tracking.acquire({ x: 40, y: 0 }, 'end-a');
    tracking.acquire({ x: 0, y: -60 }, 'end-b');
    const result = tracking.resolve({ x: 40.3, y: -60.4 }, 1, settings);
    expect(result?.point).toEqual({ x: 40, y: -60 });
    expect(result?.intersection).toBe(true);
    expect(result?.paths).toHaveLength(2);
  });
  it('acquires after dwell, removes after re-hover and retains at most seven points', () => {
    const tracking = new ObjectTracking(400),
      snap = { id: 'a', point: { x: 4, y: 8 } };
    expect(tracking.move(snap, 100, true, false, false)).toBe(400);
    expect(tracking.move(snap, 499, true, false, false)).toBe(1);
    tracking.move(snap, 500, true, false, false);
    tracking.move(snap, 1000, true, false, false);
    expect(tracking.acquired).toHaveLength(1);
    tracking.move(undefined, 1001, true, false, false);
    tracking.move(snap, 1002, true, false, false);
    tracking.move(snap, 1402, true, false, false);
    expect(tracking.acquired).toHaveLength(0);
    for (let i = 0; i < 9; i++) tracking.acquire({ x: i, y: 0 });
    expect(tracking.acquired.map((item) => item.point.x)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
  it('respects Shift-only acquisition and explicit temporary tracking points', () => {
    const tracking = new ObjectTracking(10),
      snap = { id: 'b', point: { x: 5, y: 5 } };
    tracking.move(snap, 0, true, true, false);
    tracking.move(snap, 20, true, true, false);
    expect(tracking.acquired).toHaveLength(0);
    tracking.move(snap, 30, true, true, true);
    tracking.move(snap, 40, true, true, true);
    tracking.acquire({ x: 10, y: 20 });
    expect(tracking.acquired).toHaveLength(2);
    tracking.clear();
    expect(tracking.acquired).toHaveLength(0);
  });
  it('uses additional absolute angles and last-segment-relative increments', () => {
    const additional = constrainDraftingPoint(
      { x: 10, y: -Math.tan(Math.PI / 6) * 10 },
      { x: 0, y: 0 },
      undefined,
      0.1,
      { ...settings, polarAdditional: [30], polarMode: 4 },
    );
    expect(additional.angle).toBeCloseTo(Math.PI / 6, 12);
    const relative = constrainDraftingPoint(
      { x: 20, y: -20.1 },
      { x: 10, y: -10 },
      { x: 0, y: 0 },
      0.2,
      { ...settings, polarMode: 1 },
    );
    expect(relative.point.x).toBeCloseTo(20.05, 12);
    expect(relative.point.y).toBeCloseTo(-20.05, 12);
  });
  it('polar snap uses POLARDIST or SNAPUNIT.x and requires a tracked direction', () => {
    const active = { ...settings, snap: true, polarSnap: true, polarDistance: 5 };
    expect(
      constrainDraftingPoint({ x: 12, y: -0.2 }, { x: 0, y: 0 }, undefined, 1, active).point,
    ).toEqual({ x: 10, y: 0 });
    expect(
      constrainDraftingPoint({ x: 13, y: 0 }, { x: 0, y: 0 }, undefined, 1, {
        ...active,
        polarDistance: 0,
      }).point.x,
    ).toBe(10);
    expect(
      constrainDraftingPoint({ x: 13, y: -7 }, { x: 0, y: 0 }, undefined, 1, active).kind,
    ).toBeUndefined();
  });
  it('rotates a rectangular snap lattice around SNAPBASE', () => {
    const grid = { ...settings.grid, base: { x: 100, y: 200 }, angle: Math.PI / 2 };
    const point = snapGridPoint({ x: 109.1, y: 178.2 }, grid);
    expect(point.x).toBeCloseTo(110, 12);
    expect(point.y).toBeCloseTo(180, 12);
  });
  it('shares exact isometric lattice points and plane-aligned Ortho directions', () => {
    for (const isoplane of [0, 1, 2]) {
      const grid = { ...settings.grid, isometric: true, isoplane };
      const expected = gridPoint(3, 2, grid);
      const actual = snapGridPoint({ x: expected.x + 0.2, y: expected.y - 0.1 }, grid);
      expect(actual.x).toBeCloseTo(expected.x, 12);
      expect(actual.y).toBeCloseTo(expected.y, 12);
      const constrained = constrainDraftingPoint(expected, { x: 0, y: 0 }, undefined, 1, {
        ...settings,
        ortho: true,
        grid,
      });
      expect(constrained.kind).toBe('ortho');
      expect(constrained.angle).toBeDefined();
    }
  });
});
