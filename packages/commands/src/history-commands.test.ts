import { describe, expect, it } from 'vitest';
import { CommandRegistry, HeadlessCommandRunner } from './index';

async function run(runner: HeadlessCommandRunner, command: string): Promise<void> {
  const result = await runner.run(command);
  expect(result.status, `${command}: ${result.messages.join(' ')}`).toBe('ok');
}

describe('headless advanced history command paths', () => {
  it('undoes a whole menu macro with one U only while UNDO Auto is on', async () => {
    const runner = new HeadlessCommandRunner();
    const macro = [{ command: 'SETVAR LUPREC 2' }, { command: 'SETVAR AUPREC 3' }];
    await runner.runMacro(macro);
    expect(runner.database.undoCount).toBe(1);
    expect(runner.database.undoGroupActive).toBe(false);
    await run(runner, 'U');
    expect(runner.sysvars.get('LUPREC')).toBe(4);
    expect(runner.sysvars.get('AUPREC')).toBe(0);
    await run(runner, 'UNDO A OFF');
    expect(runner.sysvars.getNumber('UNDOCTL') & 4).toBe(0);
    await runner.runMacro(macro);
    expect(runner.database.undoCount).toBe(2);
    await run(runner, 'U');
    expect(runner.sysvars.get('LUPREC')).toBe(2);
    expect(runner.sysvars.get('AUPREC')).toBe(0);
  });
  it('requires REDO immediately after U/UNDO while MREDO can still restore later', async () => {
    const runner = new HeadlessCommandRunner();
    await run(runner, 'SETVAR LUPREC 2');
    await run(runner, 'U');
    await run(runner, 'GETVAR LUPREC');
    const result = await runner.run('REDO');
    expect(result.messages).toContain('다시 실행할 항목이 없습니다.');
    expect(runner.sysvars.get('LUPREC')).toBe(4);
    expect(runner.database.redoCount).toBe(1);
    await run(runner, 'MREDO LAST');
    expect(runner.sysvars.get('LUPREC')).toBe(2);
    expect((await runner.run('U MARK')).status).toBe('error');
    expect(runner.database.undoMarkCount).toBe(0);
  });
  it('groups drawing-scope variables with Begin/End and round-trips the exact database', async () => {
    const runner = new HeadlessCommandRunner(),
      initial = runner.database.serialize();
    await run(runner, 'UNDO BE');
    expect(runner.sysvars.get('UNDOCTL')).toBe(61);
    await run(runner, 'SETVAR LUPREC 2');
    await run(runner, 'SETVAR AUPREC 3');
    await run(runner, 'UNDO E');
    const final = runner.database.serialize();
    expect(runner.database.undoCount).toBe(1);
    expect(runner.sysvars.get('UNDOCTL')).toBe(53);
    await run(runner, 'U');
    expect(runner.database.serialize()).toBe(initial);
    await run(runner, 'REDO');
    expect(runner.database.serialize()).toBe(final);
  });

  it('backs to a mark and requires confirmation before undoing all remaining actions', async () => {
    const runner = new HeadlessCommandRunner();
    await run(runner, 'SETVAR LUPREC 1');
    await run(runner, 'UNDO M');
    await run(runner, 'SETVAR LUPREC 2');
    await run(runner, 'SETVAR LUPREC 3');
    await run(runner, 'UNDO B');
    expect(runner.sysvars.get('LUPREC')).toBe(1);
    await run(runner, 'UNDO BACK N');
    expect(runner.sysvars.get('LUPREC')).toBe(1);
    await run(runner, 'UNDO BACK Y');
    expect(runner.sysvars.get('LUPREC')).toBe(4);
    expect(runner.database.undoCount).toBe(0);
  });

  it('updates Auto/Combine/Layer and Control None/One/All without adding history entries', async () => {
    const runner = new HeadlessCommandRunner({ locale: 'en-US' });
    await run(runner, 'UNDO AUTO OFF');
    expect(runner.sysvars.getNumber('UNDOCTL') & 4).toBe(0);
    await run(runner, 'UNDO AUTO ON');
    await run(runner, 'UNDO CONTROL COMBINE OFF');
    expect(runner.sysvars.getNumber('UNDOCTL') & 16).toBe(0);
    await run(runner, 'UNDO CONTROL LAYER OFF');
    expect(runner.sysvars.getNumber('UNDOCTL') & 32).toBe(0);
    expect(runner.database.undoCount).toBe(0);
    await run(runner, 'SETVAR LUPREC 1');
    await run(runner, 'UNDO CONTROL NONE');
    expect(runner.sysvars.get('UNDOCTL')).toBe(0);
    expect(runner.database.undoCount).toBe(0);
    await run(runner, 'SETVAR LUPREC 2');
    expect(runner.database.undoCount).toBe(0);
    expect((await runner.run('UNDO BEGIN')).status).toBe('error');
    await run(runner, 'UNDO CONTROL ONE');
    await run(runner, 'SETVAR LUPREC 3');
    await run(runner, 'SETVAR LUPREC 4');
    expect(runner.database.undoCount).toBe(1);
    await run(runner, 'U');
    expect(runner.sysvars.get('LUPREC')).toBe(3);
    await run(runner, 'UNDO CONTROL ALL');
    expect(runner.sysvars.getNumber('UNDOCTL') & 3).toBe(1);
  });

  it('redoes numeric/all actions and restores only the most recent erasure with OOPS', async () => {
    const registry = new CommandRegistry(),
      runner = new HeadlessCommandRunner({ registry });
    registry.register({
      name: 'ERASEFIXTURE',
      displayName: { 'ko-KR': 'ERASEFIXTURE', 'en-US': 'ERASEFIXTURE' },
      description: { 'ko-KR': '지우기 검증', 'en-US': 'Erasure fixture' },
      execute: (context) => {
        const handle = context.input.requireString();
        context.database.transaction('ERASE', (transaction) => transaction.erase(handle));
      },
    });
    const first = runner.database.transaction(
      'POINT',
      (transaction) => transaction.add({ type: 'POINT', fields: { position: [0, 0, 0] } }).handle,
    );
    const second = runner.database.transaction(
      'POINT',
      (transaction) => transaction.add({ type: 'POINT', fields: { position: [1, 1, 0] } }).handle,
    );
    await run(runner, `ERASEFIXTURE ${first}`);
    await run(runner, `ERASEFIXTURE ${second}`);
    await run(runner, 'SETVAR LUPREC 2');
    await run(runner, 'OOPS');
    expect(runner.database.get(first)).toBeUndefined();
    expect(runner.database.get(second)).toBeDefined();
    expect(runner.sysvars.get('LUPREC')).toBe(2);
    await run(runner, 'U');
    expect(runner.database.get(second)).toBeUndefined();
    await run(runner, 'MREDO LAST');
    expect(runner.database.get(second)).toBeDefined();
    await run(runner, 'UNDO 2');
    expect(runner.sysvars.get('LUPREC')).toBe(4);
    await run(runner, 'MREDO 1');
    expect(runner.sysvars.get('LUPREC')).toBe(2);
    await run(runner, 'MREDO ALL');
    expect(runner.database.get(second)).toBeDefined();
  });

  it('REDO restores every action reversed by the immediately preceding numeric UNDO command', async () => {
    const runner = new HeadlessCommandRunner();
    await run(runner, 'SETVAR LUPREC 1');
    await run(runner, 'SETVAR LUPREC 2');
    await run(runner, 'SETVAR LUPREC 3');
    const final = runner.database.serialize();
    await run(runner, 'UNDO 3');
    expect(runner.sysvars.get('LUPREC')).toBe(4);
    await run(runner, 'REDO');
    expect(runner.database.serialize()).toBe(final);
  });
});
