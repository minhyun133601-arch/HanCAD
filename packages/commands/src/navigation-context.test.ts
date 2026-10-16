import { describe, expect, it } from 'vitest';
import { HeadlessCommandRunner } from './runner';

describe('navigation command invocation context', () => {
  it('keeps command-line and transparent prefixes available to the command implementation', async () => {
    const runner = new HeadlessCommandRunner();
    const prefixes: unknown[] = [];
    runner.registry.register({
      name: 'PAN',
      displayName: { 'ko-KR': '초점이동', 'en-US': 'Pan' },
      description: { 'ko-KR': '', 'en-US': '' },
      flags: { transparent: true },
      execute: (context) => {
        prefixes.push(context.prefixes);
      },
    });
    expect((await runner.run('_-PAN', ['0,0', '20,10'])).status).toBe('ok');
    expect((await runner.run("'_PAN", [], { commandActive: true })).status).toBe('ok');
    // At the command prompt an apostrophe entry runs as an ordinary command.
    expect((await runner.run("'_PAN")).status).toBe('ok');
    expect(prefixes).toEqual([
      { global: true, builtin: false, commandLine: true, transparent: false },
      { global: true, builtin: false, commandLine: false, transparent: true },
      { global: true, builtin: false, commandLine: false, transparent: false },
    ]);
  });
});
