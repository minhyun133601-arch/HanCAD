import { describe, expect, it } from 'vitest';
import { CommandRegistry, HeadlessCommandRunner } from './index';

describe('ZIP-first canonical commands and aliases', () => {
  it('resolves the full input prefix set and conflicting legacy aliases to the ZIP definitions', () => {
    const registry = new CommandRegistry();
    expect(registry.resolve('D')?.canonicalName).toBe('DIMSTYLE');
    expect(registry.resolve('DV')?.canonicalName).toBe('DVIEW');
    expect(registry.resolve('DRE')?.canonicalName).toBe('DIMREASSOCIATE');
    expect(registry.resolve('_.-LA')?.canonicalName).toBe('LAYER');
    expect(registry.resolve('_.-LA')?.prefixes).toEqual({
      global: true,
      builtin: true,
      commandLine: true,
      transparent: false,
    });
    expect(registry.resolve('-CH')?.canonicalName).toBe('CHANGE');
    expect(registry.resolve('채')?.canonicalName).toBe('COPY');
    expect(registry.resolve("'Z")?.prefixes.transparent).toBe(true);
    expect(registry.undefine('L')).toBe(true);
    expect(registry.resolve('LINE')).toBeUndefined();
    expect(registry.resolve('.L')?.canonicalName).toBe('LINE');
    expect(registry.redefine('LINE')).toBe(true);
    expect(registry.resolve('L')?.canonicalName).toBe('LINE');
  });

  it('imports user PGP aliases with user precedence and reports malformed lines', () => {
    const registry = new CommandRegistry();
    expect(
      registry.importPgp(
        '\uFEFF; Personal aliases\nD, *DIMALIGNED\nCO, *CIRCLE ; comment\nbad line\nZZ, *FUTURECOMMAND',
      ),
    ).toEqual({ imported: 3, invalidLines: [4] });
    expect(registry.resolve('D')?.canonicalName).toBe('DIMALIGNED');
    expect(registry.resolve('CO')?.canonicalName).toBe('CIRCLE');
    expect(registry.resolve('ZZ')?.canonicalName).toBe('FUTURECOMMAND');
  });

  it('runs identical headless sysvar input, rejects invalid values and undoes drawing scope changes', async () => {
    const runner = new HeadlessCommandRunner();
    expect((await runner.run('OSMODE')).messages).toEqual(['OSMODE에 대한 새 값 입력 <4133>:']);
    expect((await runner.run('OSMODE 99999')).status).toBe('error');
    expect(runner.sysvars.get('OSMODE')).toBe(4133);
    expect((await runner.run('SETVAR', ['LUPREC', 2])).status).toBe('ok');
    expect(runner.sysvars.get('LUPREC')).toBe(2);
    await runner.run('U');
    expect(runner.sysvars.get('LUPREC')).toBe(4);
    await runner.run('REDO');
    expect(runner.sysvars.get('LUPREC')).toBe(2);
    expect((await runner.run('GETVAR LUPREC')).messages).toEqual(['LUPREC = 2']);
    expect((await runner.run('')).messages).toContain('A string input is required.');
  });

  it('explicitly reports unknown, pending, cancelled and unsupported transparent commands', async () => {
    const runner = new HeadlessCommandRunner();
    expect(await runner.run('asdf')).toMatchObject({ status: 'unknown', command: 'ASDF' });
    expect(await runner.run('D')).toMatchObject({ status: 'not-implemented', command: 'DIMSTYLE' });
    expect(await runner.run('DIMSTYLE')).toMatchObject({
      status: 'not-implemented',
      command: 'DIMSTYLE',
    });
    expect((await runner.run('SETVAR DIMSTYLE "Standard"')).status).toBe('ok');
    expect(runner.sysvars.get('DIMSTYLE')).toBe('Standard');
    await runner.run('UNDEFINE DIMSTYLE');
    expect((await runner.run('DIMSTYLE')).status).toBe('unknown');
    expect((await runner.run('.DIMSTYLE')).status).toBe('not-implemented');
    expect(await runner.run('ㅋ')).toMatchObject({ status: 'not-implemented', command: 'ZOOM' });
    expect(await runner.run('\u001b')).toEqual({ status: 'cancelled', messages: ['*취소*'] });
    expect((await runner.run('SETVAR LUPREC', ['\u001b'])).status).toBe('cancelled');
    expect((await runner.run("'LINE")).status).toBe('error');
    expect((await runner.run("'GETVAR OSMODE")).messages).toEqual(['OSMODE = 4133']);
    const english = new HeadlessCommandRunner({ locale: 'en-US' });
    expect((await english.run('unknown')).messages[0]).toContain('Unknown command');
  });
});
