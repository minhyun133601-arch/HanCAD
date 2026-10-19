import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadPoint, CadLine } from '@hancad/legacy-bridge';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { draftLine } from './entities';
import { transformFactories } from './modify-transform';
import { arrayFactories } from './modify-array';
import { DrawSession } from './draw-session';
import type { DrawContext, DrawResult } from './draw-program';
import { transformCadSelection } from './selection';
import { updatedGripBlocks } from './grip-blocks';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

const p = (x: number, y: number, z = 0): CadPoint => ({ x, y: -y, z });
function fixture(): DrawContext {
  const c = outlineContext({ COPYMODE: 0 }),
    a = draftLine(c.settings, p(0, 0), p(10, 0), 'A'),
    b = draftLine(c.settings, p(0, 0), p(0, 10), 'B');
  return {
    ...c,
    entities: [a, b],
    selectedIds: ['A', 'B'],
    blocks: [{ name: 'Fixture', basePoint: p(2, 3), entityIds: ['A', 'B'] }],
    groups: [
      { name: 'SourceGroup', description: 'A selected group', selectable: true, ids: ['A', 'B'] },
    ],
  };
}
describe('transform instance and group metadata', () => {
  it('existing drag move and Ctrl-copy preserve persisted block rotation', () => {
    const c = fixture(),
      state = {
        ...createEmptyCadState(),
        entities: [...c.entities],
        clipboardBlocks: [{ ...c.blocks![0]!, rotation: Math.PI / 4 }],
      };
    for (const copy of [false, true]) {
      const next = transformCadSelection(state, ['A', 'B'], p(5, 7), copy).state;
      const block = copy ? next.clipboardBlocks!.at(-1)! : next.clipboardBlocks![0]!;
      expect(block.rotation).toBe(Math.PI / 4);
      expect(block.basePoint).toEqual(p(7, 10));
    }
  });
  it('existing grip transforms preserve and rotate complete block metadata', () => {
    const c = fixture(),
      state = {
        ...createEmptyCadState(),
        entities: [...c.entities],
        clipboardBlocks: [{ ...c.blocks![0]!, rotation: Math.PI / 4 }],
      },
      ids = new Map([
        ['A', 'A'],
        ['B', 'B'],
      ]);
    const rotated = updatedGripBlocks(state, ids, [], {
      mode: 'ROTATE',
      base: p(0, 0),
      value: -Math.PI / 2,
    })[0]!;
    expect(rotated.rotation).toBeCloseTo((3 * Math.PI) / 4, 9);
    const mirrored = updatedGripBlocks(
      state,
      ids,
      [],
      { mode: 'MIRROR', base: p(0, 0), value: 0 },
      true,
    )[0]!;
    expect(mirrored.rotation).toBeCloseTo(-Math.PI / 4, 9);
    expect(mirrored.name).not.toBe('Fixture');
    expect(mirrored.entityIds).toEqual(['A', 'B']);
  });
  it('MOVE updates original block base and retains group membership and handles', () => {
    const c = fixture(),
      r = outlineRun(transformFactories.MOVE!, [p(0, 0), p(5, 7)], c);
    expect(r.updatedClipboardBlocks).toEqual([
      { name: 'Fixture', basePoint: p(7, 10), entityIds: ['A', 'B'] },
    ]);
    expect(r.clipboardBlocks).toBeUndefined();
    expect(r.groups).toBeUndefined();
    expect(c.blocks![0]!.basePoint).toEqual(p(2, 3));
  });
  it('ROTATE maps a block insertion point with the same rotation as its members', () => {
    const r = outlineRun(transformFactories.ROTATE!, [p(0, 0), '90'], fixture());
    expect(r.updatedClipboardBlocks![0]!.basePoint.x).toBeCloseTo(-3, 9);
    expect(r.updatedClipboardBlocks![0]!.basePoint.y).toBeCloseTo(-2, 9);
  });
  it('COPY repeated and Array Fit create distinct complete block/group memberships', () => {
    const r = outlineRun(
      transformFactories.COPY!,
      [p(0, 0), 'A', '3', 'F', p(20, 0), ''],
      fixture(),
    );
    expect(r.clipboardBlocks).toHaveLength(2);
    expect(r.clipboardBlocks!.map((b) => b.basePoint.x)).toEqual([12, 22]);
    expect(r.groups).toHaveLength(3);
    for (const b of r.clipboardBlocks!) expect(b.entityIds).toHaveLength(2);
    expect(new Set(r.clipboardBlocks!.flatMap((b) => b.entityIds)).size).toBe(4);
    expect(r.groups![0]!.ids).toEqual(['A', 'B']);
  });
  it('COPY Escape includes complete metadata for accepted placements only', () => {
    const results: DrawResult[] = [],
      session = new DrawSession('COPY', transformFactories.COPY!, {
        context: fixture(),
        onComplete: (r) => results.push(r),
      });
    session.acceptPoint(p(0, 0));
    session.acceptPoint(p(10, 0));
    session.moveCursor(p(20, 0));
    session.cancel();
    expect(results).toHaveLength(1);
    expect(results[0]!.entities).toHaveLength(2);
    expect(results[0]!.clipboardBlocks).toHaveLength(1);
    expect(results[0]!.groups).toHaveLength(2);
  });
  it('ARRAYRECT keeps the source block instance and adds complete independent instances', () => {
    const r = outlineRun(arrayFactories.ARRAYRECT!, ['COU', '2', '2', 'X'], fixture());
    expect(r.updatedClipboardBlocks).toHaveLength(1);
    expect(r.clipboardBlocks).toHaveLength(3);
    expect(r.groups).toHaveLength(4);
  });
  it('ARRAYPOLAR custom 3D axis uses exact affine rotation for members and block bases', () => {
    const c = fixture(),
      r = outlineRun(arrayFactories.ARRAYPOLAR!, ['A', p(0, 0), p(1, 0), 'I', '4', 'X'], c);
    expect(r.entities).toHaveLength(8);
    const secondB = r.entities[3] as CadLine;
    expect(secondB.b.x).toBeCloseTo(0, 9);
    expect(secondB.b.y).toBeCloseTo(0, 9);
    expect(secondB.b.z).toBeCloseTo(10, 9);
    expect(r.clipboardBlocks![0]!.basePoint.x).toBeCloseTo(2, 9);
    expect(r.clipboardBlocks![0]!.basePoint.y).toBeCloseTo(0, 9);
    expect(r.clipboardBlocks![0]!.basePoint.z).toBeCloseTo(3, 9);
  });
});
