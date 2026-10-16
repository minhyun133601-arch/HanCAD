import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { CommandInput } from '@hancad/editor';
import { commandErrorMessage } from './diagnostics';
import type { InputSearchOptions } from './input-search';
import type { CommandDefinition, CommandLocale, PromptState, PromptStep } from './types';

/** Profile store for INPUTSEARCHOPTIONS; the delay itself is INPUTSEARCHDELAY. */
export interface InputSearchStore {
  get(): InputSearchOptions;
  set(options: InputSearchOptions): void;
}

type Toggle = 'autoComplete' | 'autoCorrect' | 'systemVariables' | 'content' | 'midString';
type Field = Toggle | 'delay';

const catalogs = {
  'ko-KR': {
    option:
      '옵션 입력 [자동 완성(A)/자동 수정(C)/시스템 변수(S)/컨텐츠(N)/중간 문자열(M)/지연(D)/종료(X)] <종료>:',
    autoComplete: '사용자가 입력하는 명령을 자동으로 완성하시겠습니까?',
    autoCorrect: '입력할 때 실수가 발생하면 자동으로 수정하시겠습니까?',
    systemVariables: '사용자가 입력하는 시스템 변수를 검색하시겠습니까?',
    content: '사용자가 입력하는 컨텐츠를 도면에서 검색하시겠습니까?',
    midString: '중간 문자열 검색을 사용하시겠습니까?',
    yesNo: (value: boolean) => `[예(Y)/아니오(N)] <${value ? '예' : '아니오'}>:`,
    // The Korean reference says seconds although the value is in milliseconds.
    delay: (value: number) => `지연 시간(초) 지정 <${value}>:`,
    invalid: '유효한 옵션 키워드를 지정해야 합니다.',
  },
  'en-US': {
    option:
      'Enter an option [Autocomplete/autoCorrect/Sysvars/coNtent/Midstring/Delay/eXit] <eXit>:',
    autoComplete: 'Automatically complete a command as you type?',
    autoCorrect: 'Automatically correct a mistake as you type?',
    systemVariables: 'Search system variables as you type?',
    content: 'Search content in the drawing as you type?',
    midString: 'Enable mid-string search?',
    yesNo: (value: boolean) => `[Yes/No] <${value ? 'Yes' : 'No'}>:`,
    delay: (value: number) => `Specify the delay time in seconds <${value}>:`,
    invalid: 'Requires a valid option keyword.',
  },
} as const;

const fields = new Map<string, Field>([
  ['A', 'autoComplete'],
  ['AUTOCOMPLETE', 'autoComplete'],
  ['C', 'autoCorrect'],
  ['AUTOCORRECT', 'autoCorrect'],
  ['S', 'systemVariables'],
  ['SYSVARS', 'systemVariables'],
  ['N', 'content'],
  ['CONTENT', 'content'],
  ['M', 'midString'],
  ['MIDSTRING', 'midString'],
  ['D', 'delay'],
  ['DELAY', 'delay'],
]);

interface Walk {
  options: InputSearchOptions;
  delay: number;
  /** The next prompt, or undefined once the user exits. */
  step?: PromptStep;
}

function keyword(value: string): string {
  return value.trim().replace(/^_/, '').toUpperCase();
}

/** Replays the collected answers; invalid entries leave a notice and repeat their prompt. */
function walk(
  values: readonly string[],
  options: InputSearchOptions,
  delay: number,
  locale: CommandLocale,
): Walk {
  const text = catalogs[locale];
  let pending: Field | undefined;
  let notice: string | undefined;
  for (const value of values) {
    notice = undefined;
    if (!pending) {
      const option = keyword(value);
      if (option === '' || option === 'X' || option === 'EXIT') return { options, delay };
      pending = fields.get(option);
      if (!pending) notice = text.invalid;
      continue;
    }
    if (value.trim() === '') {
      pending = undefined;
      continue;
    }
    if (pending === 'delay') {
      const next = Number(value);
      try {
        validateSystemVariable(getSystemVariableDefinition('INPUTSEARCHDELAY')!, next);
        delay = next;
        pending = undefined;
      } catch (error) {
        notice = commandErrorMessage(error, locale);
      }
      continue;
    }
    const answer = keyword(value);
    if (['Y', 'YES', '예'].includes(answer)) options = { ...options, [pending]: true };
    else if (['N', 'NO', '아니오'].includes(answer)) options = { ...options, [pending]: false };
    else {
      notice = text.invalid;
      continue;
    }
    pending = undefined;
  }
  const prompt = !pending
    ? text.option
    : pending === 'delay'
      ? text.delay(delay)
      : `${text[pending]} ${text.yesNo(options[pending])}`;
  return { options, delay, step: notice ? { prompt, notice } : { prompt } };
}

function currentDelay(state: Pick<PromptState, 'sysvars'>): number {
  return state.sysvars.getNumber('INPUTSEARCHDELAY');
}

/**
 * INPUTSEARCHOPTIONS opens the dialog; -INPUTSEARCHOPTIONS asks for each option at
 * the command line and applies all answers when the user exits.
 */
export function inputSearchOptionsCommand(
  store: InputSearchStore,
  openDialog: () => void,
): CommandDefinition {
  const neutral = { 'ko-KR': '', 'en-US': '' } as const;
  return {
    name: 'INPUTSEARCHOPTIONS',
    displayName: neutral,
    description: neutral,
    nextPrompt: (values, state) =>
      state.prefixes.commandLine
        ? walk(values, store.get(), currentDelay(state), state.locale).step
        : undefined,
    execute: (context) => {
      if (!context.prefixes?.commandLine) {
        openDialog();
        return;
      }
      const values: string[] = [];
      while (context.input.remaining) values.push(text(context.input.take()));
      const result = walk(values, store.get(), currentDelay(context), context.locale);
      store.set(result.options);
      if (result.delay !== currentDelay(context))
        context.sysvars.set('INPUTSEARCHDELAY', result.delay);
    },
  };
}

function text(input: CommandInput | undefined): string {
  return input === undefined ? '' : typeof input === 'string' ? input : String(input);
}
