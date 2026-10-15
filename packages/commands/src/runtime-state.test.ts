import { describe, expect, it } from 'vitest';
import { InputCancelled } from '@hancad/editor';
import { CommandRegistry, HeadlessCommandRunner } from './index';
import type { CommandContext } from './types';

function register(
  registry: CommandRegistry,
  name: string,
  execute: (context: CommandContext) => void | Promise<void>,
  transparent = false,
): void {
  registry.register({
    name,
    displayName: { 'ko-KR': name, 'en-US': name },
    description: { 'ko-KR': '명령 상태 검증', 'en-US': 'Command runtime state fixture' },
    flags: { transparent },
    execute,
  });
}

describe('headless active command state', () => {
  it('reports canonical ordinary command names throughout asynchronous execution and restores idle state', async () => {
    const registry = new CommandRegistry(),
      runner = new HeadlessCommandRunner({ registry });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const before = runner.database.serialize();
    register(registry, 'INSPECTSTATE', async (context) => {
      expect(context.sysvars.get('CMDACTIVE')).toBe(1);
      expect(context.sysvars.get('CMDNAMES')).toBe('INSPECTSTATE');
      await gate;
      expect(context.sysvars.get('CMDACTIVE')).toBe(1);
      expect(context.sysvars.get('CMDNAMES')).toBe('INSPECTSTATE');
    });
    registry.importPgp('CHECKSTATE, *INSPECTSTATE');
    const pending = runner.run('CHECKSTATE');
    expect(runner.sysvars.get('CMDACTIVE')).toBe(1);
    expect(runner.sysvars.get('CMDNAMES')).toBe('INSPECTSTATE');
    release?.();
    expect((await pending).status).toBe('ok');
    expect(runner.sysvars.get('CMDACTIVE')).toBe(0);
    expect(runner.sysvars.get('CMDNAMES')).toBe('');
    expect(runner.database.serialize()).toBe(before);
    expect(runner.database.undoCount).toBe(0);
  });

  it('uses transparent bit 2 and the documented LINE apostrophe ZOOM name while preserving host bits', async () => {
    const registry = new CommandRegistry(),
      runner = new HeadlessCommandRunner({ registry });
    runner.sysvars.setRuntimeSessionValue('CMDACTIVE', 5);
    runner.sysvars.setRuntimeSessionValue('CMDNAMES', 'LINE');
    register(
      registry,
      'ZOOM',
      (context) => {
        expect(context.sysvars.get('CMDACTIVE')).toBe(7);
        expect(context.sysvars.get('CMDNAMES')).toBe("LINE'ZOOM");
      },
      true,
    );
    expect((await runner.run("'Z")).status).toBe('ok');
    expect(runner.sysvars.get('CMDACTIVE')).toBe(5);
    expect(runner.sysvars.get('CMDNAMES')).toBe('LINE');
    expect(runner.database.undoCount).toBe(0);
  });

  it('restores prior runtime states after a rejected promise or input cancellation', async () => {
    for (const cancelled of [false, true]) {
      const registry = new CommandRegistry(),
        runner = new HeadlessCommandRunner({ registry });
      runner.sysvars.setRuntimeSessionValue('CMDACTIVE', 8);
      runner.sysvars.setRuntimeSessionValue('CMDNAMES', 'HOST');
      register(registry, 'FAILSTATE', async (context) => {
        expect(context.sysvars.get('CMDACTIVE')).toBe(9);
        expect(context.sysvars.get('CMDNAMES')).toBe('FAILSTATE');
        await Promise.resolve();
        throw cancelled ? new InputCancelled() : new Error('Fixture failure');
      });
      expect((await runner.run('FAILSTATE')).status).toBe(cancelled ? 'cancelled' : 'error');
      expect(runner.sysvars.get('CMDACTIVE')).toBe(8);
      expect(runner.sysvars.get('CMDNAMES')).toBe('HOST');
      expect(runner.database.undoCount).toBe(0);
    }
  });

  it('leaves runtime state untouched for unknown, pending, rejected transparent and empty commands', async () => {
    const registry = new CommandRegistry(),
      runner = new HeadlessCommandRunner({ registry });
    const events: string[] = [];
    runner.sysvars.events.subscribe((event) => {
      if (['CMDACTIVE', 'CMDNAMES'].includes(event.name)) events.push(event.name);
    });
    register(registry, 'NORMALSTATE', () => undefined);
    for (const token of ['UNKNOWNSTATE', 'LINE', "'NORMALSTATE", '', '\u001b'])
      await runner.run(token);
    expect(events).toHaveLength(0);
    expect(runner.sysvars.get('CMDACTIVE')).toBe(0);
    expect(runner.sysvars.get('CMDNAMES')).toBe('');
  });
});
