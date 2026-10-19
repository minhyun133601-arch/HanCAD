import { describe, expect, it } from 'vitest';
import type { CadLine, CadPoint } from '@hancad/legacy-bridge';
import { draftLine } from './entities';
import { outlineContext, outlineRun } from './draw-outline-fixtures';
import { changeBlocksProgram } from './modify-change-blocks';
import type { DrawContext } from './draw-program';
import { transformFactories } from './modify-transform';

const p = (x: number, y: number): CadPoint => ({ x, y: -y });
function fixture(): DrawContext {
  const c = outlineContext(),
    line = draftLine(c.settings, p(0, 0), p(0, 10), 'L');
  return {
    ...c,
    entities: [line],
    selectedIds: ['L'],
    blocks: [{ name: 'BLOCK', basePoint: p(0, 0), rotation: Math.PI / 2, entityIds: ['L'] }],
  };
}
describe('CHANGE flattened block insertion and rotation', () => {
  it('sets insertion and absolute rotation together in one immutable batch', () => {
    const c = fixture(),
      result = outlineRun(changeBlocksProgram, [p(20, 30), '0'], c),
      line = result.entities[0] as CadLine;
    expect(line.id).toBe('L');
    expect(line.a.x).toBeCloseTo(20, 9);
    expect(line.a.y).toBeCloseTo(-30, 9);
    expect(line.b.x).toBeCloseTo(30, 9);
    expect(line.b.y).toBeCloseTo(-30, 9);
    expect(result.eraseIds).toEqual(['L']);
    expect(result.updatedClipboardBlocks).toEqual([
      { name: 'BLOCK', basePoint: p(20, 30), rotation: 0, entityIds: ['L'] },
    ]);
    expect(c.blocks![0]!.rotation).toBe(Math.PI / 2);
  });
  it('Enter preserves current insertion and rotation without creating a false edit', () => {
    const result = outlineRun(changeBlocksProgram, ['', ''], fixture());
    expect(result.entities).toEqual([]);
    expect(result.eraseIds).toEqual([]);
  });
  it('accepts the already acquired CHANGE point and then asks only for rotation', () => {
    const c = fixture(),
      result = outlineRun((ctx) => changeBlocksProgram(ctx, p(40, 50)), ['180'], c),
      line = result.entities[0] as CadLine;
    expect(line.a.x).toBeCloseTo(40, 9);
    expect(line.a.y).toBeCloseTo(-50, 9);
    expect(line.b.x).toBeCloseTo(30, 9);
    expect(line.b.y).toBeCloseTo(-50, 9);
    expect(result.updatedClipboardBlocks![0]!.rotation).toBeCloseTo(Math.PI, 9);
  });
  it('block rotation metadata follows transformed local basis through ROTATE and MIRROR', () => {
    const c = fixture(),
      rotated = outlineRun(transformFactories.ROTATE!, [p(0, 0), '90'], c);
    expect(Math.abs(rotated.updatedClipboardBlocks![0]!.rotation!)).toBeCloseTo(Math.PI, 9);
    const mirrored = outlineRun(transformFactories.MIRROR!, [p(0, 0), p(1, 0), 'Y'], c);
    expect(mirrored.updatedClipboardBlocks![0]!.rotation).toBeCloseTo(-Math.PI / 2, 9);
  });
});
