import { describe, expect, it } from 'vitest';
import { AutoCorrectMemory } from './autocorrect';
import { defaultInputSearchOptions } from './input-search';
import type { InputSearchOptions } from './input-search';
import { inputSearchOptionsCommand } from './input-search-command';
import { CommandRegistry } from './registry';
import { HeadlessCommandRunner } from './runner';
import type { PromptState } from './types';

function setup() {
  let stored: InputSearchOptions = { ...defaultInputSearchOptions };
  let dialogs = 0;
  const registry = new CommandRegistry();
  const definition = inputSearchOptionsCommand(
    { get: () => stored, set: (next) => (stored = next) },
    () => dialogs++,
  );
  registry.register(definition);
  const runner = new HeadlessCommandRunner({ registry });
  const state = (commandLine: boolean): PromptState => ({
    database: runner.database,
    sysvars: runner.sysvars,
    locale: 'ko-KR',
    prefixes: { global: false, builtin: false, commandLine, transparent: false },
  });
  return { runner, definition, state, stored: () => stored, dialogs: () => dialogs };
}

describe('-INPUTSEARCHOPTIONS', () => {
  it('opens the dialog without the hyphen and prompts with it', async () => {
    const { runner, definition, state, dialogs } = setup();
    expect(definition.nextPrompt?.([], state(false))).toBeUndefined();
    await runner.run('INPUTSEARCHOPTIONS');
    expect(dialogs()).toBe(1);
    expect(definition.nextPrompt?.([], state(true))?.prompt).toBe(
      '옵션 입력 [자동 완성(A)/자동 수정(C)/시스템 변수(S)/컨텐츠(N)/중간 문자열(M)/지연(D)/종료(X)] <종료>:',
    );
  });

  it('asks yes/no with the current value as default and returns to the option prompt', () => {
    const { definition, state } = setup();
    const next = (values: string[]) => definition.nextPrompt?.(values, state(true));
    expect(next(['A'])?.prompt).toBe(
      '사용자가 입력하는 명령을 자동으로 완성하시겠습니까? [예(Y)/아니오(N)] <예>:',
    );
    expect(next(['A', 'N'])?.prompt).toMatch(/^옵션 입력/);
    expect(next(['A', 'N', 'A'])?.prompt).toMatch(/<아니오>:$/);
    expect(next(['D'])?.prompt).toBe('지연 시간(초) 지정 <300>:');
    expect(next(['A', 'N', 'X'])).toBeUndefined();
    expect(next(['A', 'N', ''])).toBeUndefined();
  });

  it('reports invalid keywords and out-of-range delays, then repeats the prompt', () => {
    const { definition, state } = setup();
    const next = (values: string[]) => definition.nextPrompt?.(values, state(true));
    expect(next(['Q'])).toEqual({
      prompt: expect.stringMatching(/^옵션 입력/),
      notice: '유효한 옵션 키워드를 지정해야 합니다.',
    });
    expect(next(['M', 'MAYBE'])?.notice).toBe('유효한 옵션 키워드를 지정해야 합니다.');
    expect(next(['M', 'MAYBE'])?.prompt).toMatch(/^중간 문자열 검색을 사용하시겠습니까/);
    const delay = next(['D', '50']);
    expect(delay?.prompt).toBe('지연 시간(초) 지정 <300>:');
    expect(delay?.notice).toContain('100');
  });

  it('applies every answer and the delay when run from a script', async () => {
    const { runner, stored } = setup();
    const result = await runner.run('-INPUTSEARCHOPTIONS', ['A', 'N', 'S', 'N', 'D', '800', 'X']);
    expect(result.status).toBe('ok');
    expect(stored()).toMatchObject({ autoComplete: false, systemVariables: false });
    expect(runner.sysvars.getNumber('INPUTSEARCHDELAY')).toBe(800);
  });
});

describe('AutoCorrect memory', () => {
  it('remembers a correction after the configured number of mistypes', () => {
    const memory = new AutoCorrectMemory();
    expect(memory.record('lien', 'LINE', 3)).toBe(false);
    expect(memory.record('LIEN', 'LINE', 3)).toBe(false);
    expect(memory.correction('LIEN')).toBeUndefined();
    expect(memory.record('LIEN', 'LINE', 3)).toBe(true);
    expect(memory.correction('lien')).toBe('LINE');
    expect(memory.record('LIEN', 'LINE', 3)).toBe(false);
  });

  it('round-trips through JSON and AutoCorrectUserDB PGP text', () => {
    const memory = new AutoCorrectMemory();
    memory.record('CIRLCE', 'CIRCLE', 1);
    memory.record('OFSET', 'OFFSET', 2);
    const restored = new AutoCorrectMemory(JSON.parse(JSON.stringify(memory)));
    expect(restored.correction('CIRLCE')).toBe('CIRCLE');
    expect(restored.record('OFSET', 'OFFSET', 2)).toBe(true);
    expect(restored.toPgp()).toMatch(/CIRLCE, *\*CIRCLE/);
    const registry = new CommandRegistry();
    registry.loadCorrections(restored.toPgp());
    expect(registry.resolve('cirlce')?.canonicalName).toBe('CIRCLE');
  });

  it('ignores invalid names, identical names and malformed stored state', () => {
    const memory = new AutoCorrectMemory({ counts: { bad: 2, 'A>B': -1 }, pgp: 42 });
    expect(memory.record('LINE', 'LINE', 1)).toBe(false);
    expect(memory.record('10,10', 'LINE', 1)).toBe(false);
    expect(memory.entries).toEqual([]);
  });
});
