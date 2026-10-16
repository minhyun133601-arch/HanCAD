import { describe, expect, it } from 'vitest';
import { CommandRegistry, HeadlessCommandRunner, interpretCommandInput } from './index';

const idle = { commandActive: false, transparentActive: false };
const inside = { commandActive: true, transparentActive: false };

describe('command line interpretation', () => {
  const registry = new CommandRegistry();
  it('repeats on empty input only at the command prompt', () => {
    expect(interpretCommandInput(registry, '', idle)).toEqual({ kind: 'repeat' });
    expect(interpretCommandInput(registry, '  ', inside)).toEqual({ kind: 'prompt', text: '  ' });
  });
  it('resolves commands, aliases, prefixes and Korean-mode input', () => {
    const line = interpretCommandInput(registry, 'ㅣ', idle);
    expect(line.kind === 'command' && line.resolution.canonicalName).toBe('LINE');
    const layer = interpretCommandInput(registry, '_.-LA', idle);
    expect(layer.kind === 'command' && layer.resolution.prefixes).toMatchObject({
      global: true,
      builtin: true,
      commandLine: true,
    });
    const zoom = interpretCommandInput(registry, "'Z E", idle);
    expect(zoom).toMatchObject({ kind: 'command', transparent: false, arguments: ['E'] });
  });
  it('treats non-apostrophe input inside a command as a prompt response', () => {
    expect(interpretCommandInput(registry, 'Z', inside)).toEqual({ kind: 'prompt', text: 'Z' });
    expect(interpretCommandInput(registry, '100,50', inside).kind).toBe('prompt');
  });
  it('accepts transparent commands and system variables inside prompts with an apostrophe', () => {
    expect(interpretCommandInput(registry, "'Z", inside)).toMatchObject({
      kind: 'command',
      transparent: true,
    });
    expect(interpretCommandInput(registry, "'ㅋ", inside)).toMatchObject({ transparent: true });
    expect(interpretCommandInput(registry, "'CAL", inside).kind).toBe('command');
    expect(interpretCommandInput(registry, "'OSMODE", inside)).toMatchObject({
      kind: 'sysvar',
      name: 'OSMODE',
    });
  });
  it('rejects non-transparent and nested transparent commands', () => {
    expect(interpretCommandInput(registry, "'LINE", inside)).toEqual({
      kind: 'not-transparent',
      name: 'LINE',
    });
    expect(
      interpretCommandInput(registry, "'Z", { commandActive: true, transparentActive: true }),
    ).toEqual({ kind: 'not-transparent', name: 'ZOOM' });
    expect(interpretCommandInput(registry, "'NOTACMD", inside)).toEqual({
      kind: 'unknown',
      name: 'NOTACMD',
    });
  });
  it('falls back from commands to external PGP commands, then system variables', () => {
    const own = new CommandRegistry();
    own.importPgp('NOTEPAD, START NOTEPAD, 1,*File to edit: ,');
    expect(interpretCommandInput(own, 'notepad x.txt', idle)).toMatchObject({
      kind: 'external',
      arguments: ['x.txt'],
    });
    expect(interpretCommandInput(own, 'osmode 33', idle)).toMatchObject({
      kind: 'sysvar',
      name: 'OSMODE',
      arguments: ['33'],
    });
    own.undefine('DIMSTYLE');
    expect(interpretCommandInput(own, 'DIMSTYLE', idle).kind).toBe('unknown');
  });
});

describe('headless runner shares the interpretation', () => {
  it('uses the AutoCAD transparent error and reports external commands explicitly', async () => {
    const runner = new HeadlessCommandRunner();
    expect((await runner.run("'LINE")).messages).toEqual([
      '** 해당 명령은 투명하게 호출할 수 없습니다 **',
    ]);
    runner.registry.importPgp('NOTEPAD, START NOTEPAD, 1,*File to edit: ,');
    expect(await runner.run('NOTEPAD')).toMatchObject({ status: 'not-implemented' });
    expect((await runner.run("'ZOOM", [], { commandActive: true })).status).toBe('not-implemented');
  });
  it('does not make a transparent command the repeat target', async () => {
    const runner = new HeadlessCommandRunner();
    await runner.run('GETVAR OSMODE');
    await runner.run("'GETVAR LUPREC", [], { commandActive: true });
    expect(runner.previousCommand).toBe('GETVAR');
    expect((await runner.run('', ['OSMODE'])).messages).toEqual(['OSMODE = 4133']);
  });
});
