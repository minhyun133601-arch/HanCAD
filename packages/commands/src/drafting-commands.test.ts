import { describe, expect, it } from 'vitest';
import { HeadlessCommandRunner } from './runner';
import type { PromptState } from './types';

function state(
  runner: HeadlessCommandRunner,
  locale: PromptState['locale'] = 'ko-KR',
): PromptState {
  return {
    database: runner.database,
    sysvars: runner.sysvars,
    locale,
    prefixes: { global: false, builtin: false, commandLine: false, transparent: false },
  };
}

describe('canonical drafting-aid commands', () => {
  it('sets grid spacing, snap multiples, independent axes and zero follow-snap spacing', async () => {
    const runner = new HeadlessCommandRunner();
    runner.sysvars.set('SNAPUNIT', [4, 6]);
    runner.sysvars.set('GRIDMODE', 0);
    expect((await runner.run('GRID 2x')).status).toBe('ok');
    expect(runner.sysvars.get('GRIDUNIT')).toEqual([8, 12]);
    expect(runner.sysvars.get('GRIDMODE')).toBe(1);
    await runner.run('GRID A 3x 5');
    expect(runner.sysvars.get('GRIDUNIT')).toEqual([12, 5]);
    await runner.run('GRID OFF');
    expect(runner.sysvars.get('GRIDMODE')).toBe(0);
    expect(runner.sysvars.get('GRIDUNIT')).toEqual([12, 5]);
    await runner.run('GRID S');
    expect(runner.sysvars.get('GRIDUNIT')).toEqual([0, 0]);
    expect(runner.sysvars.get('GRIDMODE')).toBe(1);
  });

  it('changes only the requested grid display flags and validates major-line frequency', async () => {
    const runner = new HeadlessCommandRunner();
    await runner.run('GRID D Y Y');
    expect(runner.sysvars.get('GRIDDISPLAY')).toBe(7);
    await runner.run('GRID L N');
    expect(runner.sysvars.get('GRIDDISPLAY')).toBe(6);
    await runner.run('GRID F Y');
    expect(runner.sysvars.get('GRIDDISPLAY')).toBe(14);
    await runner.run('GRID M 10');
    expect(runner.sysvars.get('GRIDMAJOR')).toBe(10);
    const definition = runner.registry.get('GRID')!;
    expect(definition.nextPrompt?.(['M', '0'], state(runner))).toMatchObject({
      notice: expect.any(String),
    });
    expect(runner.sysvars.get('GRIDMAJOR')).toBe(10);
    await runner.run('GRID M 0 12');
    expect(runner.sysvars.get('GRIDMAJOR')).toBe(12);
  });

  it('sets SNAP spacing, on/off, aspect, style, type and modern/legacy cursor behavior', async () => {
    const runner = new HeadlessCommandRunner();
    await runner.run('SN 2.5');
    expect(runner.sysvars.get('SNAPUNIT')).toEqual([2.5, 2.5]);
    expect(runner.sysvars.get('SNAPMODE')).toBe(1);
    await runner.run('SNAP A 4 6');
    expect(runner.sysvars.get('SNAPUNIT')).toEqual([4, 6]);
    await runner.run('SNAP OFF');
    expect(runner.sysvars.get('SNAPMODE')).toBe(0);
    await runner.run('SNAP ON');
    await runner.run('SNAP L Y');
    expect(runner.sysvars.get('SNAPGRIDLEGACY')).toBe(1);
    await runner.run('SNAP L N');
    expect(runner.sysvars.get('SNAPGRIDLEGACY')).toBe(0);
    await runner.run('SNAP S I 8');
    expect(runner.sysvars.get('SNAPSTYL')).toBe(1);
    expect(runner.sysvars.get('SNAPUNIT')).toEqual([8, 8]);
    expect(runner.registry.get('SNAP')?.nextPrompt?.(['A'], state(runner))?.notice).toContain(
      '등각투영',
    );
    await runner.run('SNAP S S A 5 7');
    expect(runner.sysvars.get('SNAPSTYL')).toBe(0);
    expect(runner.sysvars.get('SNAPUNIT')).toEqual([5, 7]);
    await runner.run('SNAP T P');
    expect(runner.sysvars.get('SNAPTYPE')).toBe(1);
    await runner.run('SNAP T G');
    expect(runner.sysvars.get('SNAPTYPE')).toBe(0);
  });

  it('replays prompt answers without mutation, retries invalid input and preserves unchanged defaults', async () => {
    const runner = new HeadlessCommandRunner();
    const definition = runner.registry.get('SNAP')!;
    expect(definition.nextPrompt?.([], state(runner))?.prompt).toContain('종횡비(A)');
    expect(definition.nextPrompt?.(['A', '4'], state(runner))?.prompt).toContain('수직');
    expect(runner.sysvars.get('SNAPUNIT')).toEqual([10, 10]);
    expect(definition.nextPrompt?.(['0'], state(runner))?.notice).toBeTruthy();
    expect(definition.nextPrompt?.(['A', '4', ''], state(runner))).toBeUndefined();
    await runner.run('SNAP', ['A', '4', '']);
    expect(runner.sysvars.get('SNAPUNIT')).toEqual([4, 10]);
    const original = runner.sysvars.get('SNAPUNIT');
    const invalid = await runner.run('SNAP -2');
    expect(invalid.messages.join(' ')).toContain('유효한');
    expect(runner.sysvars.get('SNAPUNIT')).toEqual(original);
    expect((await runner.run('SNAP', ['A', '7', '\u001b'])).status).toBe('cancelled');
    expect(runner.sysvars.get('SNAPUNIT')).toEqual(original);
  });

  it('uses current unit precision in prompts and groups one drafting command as one undo operation', async () => {
    const runner = new HeadlessCommandRunner();
    await runner.run('SNAP A 5 7');
    await runner.run('U');
    expect(runner.sysvars.get('SNAPUNIT')).toEqual([10, 10]);
    expect(runner.sysvars.get('SNAPMODE')).toBe(0);
    runner.sysvars.set('LUNITS', 3);
    runner.sysvars.set('LUPREC', 2);
    expect(runner.registry.get('SNAP')?.nextPrompt?.([], state(runner, 'en-US'))?.prompt).toContain(
      `0'-10.00"`,
    );
    await runner.run('SNAP', [`1'-2 1/2"`]);
    expect(runner.sysvars.get('SNAPUNIT')).toEqual([14.5, 14.5]);
  });

  it('supports transparent ORTHO/ISOPLANE and enables/disables ISODRAFT through canonical options', async () => {
    const runner = new HeadlessCommandRunner();
    await runner.run("'ORTHO ON", [], { commandActive: true });
    expect(runner.sysvars.get('ORTHOMODE')).toBe(1);
    expect(runner.sysvars.getNumber('AUTOSNAP') & 8).toBe(0);
    await runner.run("'ISOPLANE T", [], { commandActive: true });
    expect(runner.sysvars.get('SNAPISOPAIR')).toBe(1);
    expect(runner.sysvars.get('SNAPSTYL')).toBe(0);
    await runner.run('ISODRAFT R');
    expect(runner.sysvars.get('SNAPSTYL')).toBe(1);
    expect(runner.sysvars.get('SNAPTYPE')).toBe(0);
    expect(runner.sysvars.get('SNAPISOPAIR')).toBe(2);
    await runner.run('ISODRAFT O');
    expect(runner.sysvars.get('SNAPSTYL')).toBe(0);
    expect((await runner.run("'ISODRAFT L", [], { commandActive: true })).status).toBe('error');
    await runner.run('ORTHO OFF');
    expect(runner.sysvars.get('ORTHOMODE')).toBe(0);
  });
});
