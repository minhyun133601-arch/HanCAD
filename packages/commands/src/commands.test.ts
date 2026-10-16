import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry, HeadlessCommandRunner } from './index';
import { CommandInputError } from './index';
import { setVariableFromInput } from './core';
import { InputQueue } from '@hancad/editor';
import { SystemVariables } from '@hancad/sysvars';

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
    ).toEqual({ imported: 3, invalidLines: [4], externals: 0 });
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
    expect((await runner.run('')).messages).toContain('문자 입력이 필요합니다.');
  });

  it('explicitly reports unknown, pending, cancelled and unsupported transparent commands', async () => {
    const runner = new HeadlessCommandRunner();
    expect(await runner.run('asdf')).toMatchObject({ status: 'unknown', command: 'ASDF' });
    expect(await runner.run('D')).toMatchObject({ status: 'not-implemented', command: 'DIMSTYLE' });
    expect(await runner.run('DIMSTYLE')).toMatchObject({
      status: 'not-implemented',
      command: 'DIMSTYLE',
    });
    const readonlyStyle = await runner.run('SETVAR DIMSTYLE "Standard"');
    expect(readonlyStyle.status).toBe('error');
    expect(readonlyStyle.messages.join(' ')).toContain('읽기 전용');
    expect(runner.sysvars.get('DIMSTYLE')).toBe('ISO-25');
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

  it('localizes typed sysvar failures without changing values or creating undo entries', async () => {
    for (const locale of ['ko-KR', 'en-US'] as const) {
      const runner = new HeadlessCommandRunner({ locale });
      const before = runner.database.serialize();
      const cases = [
        {
          line: 'SETVAR OSMODE 99999',
          korean: 'OSMODE의 값이 유효하지 않습니다 (0~32767).',
          english: 'Invalid value for OSMODE (0–32767).',
        },
        {
          line: 'SETVAR CMDACTIVE 1',
          korean: 'CMDACTIVE은(는) 읽기 전용 시스템 변수입니다.',
          english: 'CMDACTIVE is a read-only system variable.',
        },
        {
          line: 'GETVAR nonexistent',
          korean: '알 수 없는 시스템 변수 "NONEXISTENT".',
          english: 'Unknown system variable "NONEXISTENT".',
        },
        {
          line: 'SETVAR CLAYER "없는 도면층"',
          korean: 'CLAYER의 값이 유효하지 않습니다. 이름 "없는 도면층"이(가) 도면에 없습니다.',
          english: 'Invalid value for CLAYER. Name "없는 도면층" does not exist in the drawing.',
        },
      ];
      for (const failure of cases) {
        const result = await runner.run(failure.line);
        expect(result.status).toBe('error');
        expect(result.messages.at(-1)).toBe(locale === 'ko-KR' ? failure.korean : failure.english);
      }
      expect(runner.sysvars.get('OSMODE')).toBe(4133);
      expect(runner.database.serialize()).toBe(before);
      expect(runner.database.undoCount).toBe(0);
    }
  });

  it('provides typed variable input failures before a drawing transaction starts', () => {
    const sysvars = new SystemVariables();
    for (const [name, value, code, message] of [
      ['LIMMIN', 12, 'invalid-point', 'Invalid point value for LIMMIN'],
      ['CLAYER', 12, 'string-required', 'A string value is required for CLAYER'],
    ] as const) {
      try {
        setVariableFromInput(name, {
          sysvars,
          database: sysvars.database,
          input: new InputQueue([value]),
          locale: 'ko-KR',
          print: () => {},
        });
        expect.fail('Malformed variable inputs must be rejected.');
      } catch (error) {
        expect(error).toBeInstanceOf(CommandInputError);
        expect(error).toMatchObject({ code, variable: name, message });
      }
    }
    expect(sysvars.database.undoCount).toBe(0);
  });

  it('localizes malformed core inputs while retaining values and undo/redo history', async () => {
    for (const locale of ['ko-KR', 'en-US'] as const) {
      const runner = new HeadlessCommandRunner({ locale });
      await runner.run('SETVAR', ['LUPREC', 2]);
      await runner.run('U');
      const before = runner.database.serialize();
      const history = [runner.database.undoCount, runner.database.redoCount];
      const failures = [
        {
          command: 'SETVAR',
          inputs: ['LIMMIN', 42],
          korean: 'LIMMIN의 점 값이 올바르지 않습니다.',
          english: 'Invalid point value for LIMMIN.',
        },
        {
          command: 'SETVAR',
          inputs: ['CLAYER', 42],
          korean: 'CLAYER에는 문자 값이 필요합니다.',
          english: 'A string value is required for CLAYER.',
        },
        {
          command: 'UNDO',
          inputs: [0],
          korean: '실행 취소/다시 실행 횟수는 양의 정수여야 합니다.',
          english: 'Undo/redo count must be a positive integer.',
        },
        {
          command: 'MREDO',
          inputs: [Number.POSITIVE_INFINITY],
          korean: '실행 취소/다시 실행 횟수는 양의 정수여야 합니다.',
          english: 'Undo/redo count must be a positive integer.',
        },
        {
          command: 'GETVAR',
          inputs: [],
          korean: '문자 입력이 필요합니다.',
          english: 'A string input is required.',
        },
      ];
      for (const failure of failures) {
        const result = await runner.run(failure.command, failure.inputs);
        expect(result.status).toBe('error');
        expect(result.messages.at(-1)).toBe(locale === 'ko-KR' ? failure.korean : failure.english);
      }
      expect(runner.database.serialize()).toBe(before);
      expect([runner.database.undoCount, runner.database.redoCount]).toEqual(history);
      await runner.run('MREDO');
      expect(runner.sysvars.get('LUPREC')).toBe(2);
    }
  });

  it('lets the application format registered-command failures without changing drawing/history', async () => {
    const failure = new Error('External domain diagnostic');
    const format = vi.fn((error: unknown) =>
      error === failure ? 'Localized domain failure.' : 'Unexpected error.',
    );
    const runner = new HeadlessCommandRunner({ locale: 'en-US', errorFormatter: format });
    runner.registry.register({
      name: 'EXPORTTEST',
      displayName: { 'ko-KR': 'EXPORTTEST', 'en-US': 'EXPORTTEST' },
      description: { 'ko-KR': 'EXPORTTEST', 'en-US': 'EXPORTTEST' },
      execute: async () => {
        throw failure;
      },
    });
    await runner.run('SETVAR', ['LUPREC', 2]);
    await runner.run('U');
    const drawing = runner.database.serialize();
    const history = [runner.database.undoCount, runner.database.redoCount];
    expect(await runner.run('EXPORTTEST')).toEqual({
      status: 'error',
      command: 'EXPORTTEST',
      messages: ['Localized domain failure.'],
    });
    expect(format).toHaveBeenCalledExactlyOnceWith(failure);
    expect(runner.database.serialize()).toBe(drawing);
    expect([runner.database.undoCount, runner.database.redoCount]).toEqual(history);
    await runner.run('MREDO');
    expect(runner.sysvars.get('LUPREC')).toBe(2);
    expect(await new HeadlessCommandRunner().run('GETVAR')).toMatchObject({
      status: 'error',
      messages: ['문자 입력이 필요합니다.'],
    });
  });
});
