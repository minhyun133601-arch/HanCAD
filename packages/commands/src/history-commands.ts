import type { UndoStateError } from '@hancad/db';
import type { CommandContext } from './types';
import type { CommandInput } from '@hancad/editor';
import { CommandInputError } from './input-errors';
import { commandMessages } from './messages';

const catalogs = {
  'ko-KR': {
    prompt: '취소할 작업의 수 입력 또는 [자동(A)/조정(C)/시작(BE)/끝(E)/표식(M)/뒤(B)] <1>:',
    control:
      '실행 취소 조정 옵션 입력 [전체(All)/없음(None)/하나(One)/결합(Combine)/도면층(Layer)] <전체>:',
    onOff: '켜기 또는 끄기 입력 [켜기(ON)/끄기(OFF)] <켜기>:',
    allConfirm: '모든 것을 취소합니다. 확인? [예(Y)/아니오(N)] <예>:',
    reachedMark: '실행 취소 표식에 도달했습니다.',
    disabled: '실행 취소가 꺼져 있습니다. UNDO 조정 옵션으로 켜십시오.',
    limited: '이 옵션은 전체 실행 취소를 사용할 때만 가능합니다.',
    noGroup: '활성 실행 취소 그룹이 없습니다.',
    noErasure: '복원할 지워진 객체가 없습니다.',
    invalid: '올바르지 않은 실행 취소 옵션입니다.',
    redoPrompt: '다시 실행할 작업의 수 입력 또는 [전체(A)/마지막(L)] <1>:',
  },
  'en-US': {
    prompt: 'Enter the number of operations to undo or [Auto/Control/Begin/End/Mark/Back] <1>:',
    control: 'Enter an UNDO control option [All/None/One/Combine/Layer] <All>:',
    onOff: 'Enter [ON/OFF] <ON>:',
    allConfirm: 'This will undo everything. OK? [Yes/No] <Yes>:',
    reachedMark: 'An undo mark has been reached.',
    disabled: 'Undo is disabled. Enable it with UNDO Control.',
    limited: 'This option requires full undo.',
    noGroup: 'No undo group is active.',
    noErasure: 'There are no erased objects to restore.',
    invalid: 'Invalid undo option.',
    redoPrompt: 'Enter the number of actions to redo or [All/Last] <1>:',
  },
} as const;

export function historyErrorMessage(
  error: UndoStateError,
  locale: CommandContext['locale'],
): string {
  return catalogs[locale][error.code === 'no-group' ? 'noGroup' : error.code];
}
export function undoPrompt(locale: CommandContext['locale']): string {
  return catalogs[locale].prompt;
}
export function historyInputPrompt(
  command: 'UNDO' | 'MREDO',
  values: readonly string[],
  locale: CommandContext['locale'],
  hasMark: boolean,
): string | undefined {
  const text = catalogs[locale],
    option = keyword(values[0]);
  if (!values.length) return command === 'UNDO' ? text.prompt : text.redoPrompt;
  if (command === 'MREDO') return undefined;
  if (['A', 'AUTO'].includes(option) && values.length === 1) return text.onOff;
  if (['C', 'CONTROL'].includes(option)) {
    if (values.length === 1) return text.control;
    if (['C', 'COMBINE', 'L', 'LAYER'].includes(keyword(values[1])) && values.length === 2)
      return text.onOff;
  }
  if (['B', 'BACK'].includes(option) && !hasMark && values.length === 1) return text.allConfirm;
  return undefined;
}

function keyword(input: CommandInput | undefined): string {
  return typeof input === 'string' ? input.replace(/^_/, '').toUpperCase() : '';
}
function count(input: CommandInput): number {
  const result =
    typeof input === 'number' ? input : typeof input === 'string' ? Number(input) : NaN;
  if (!Number.isSafeInteger(result) || result < 1)
    throw new CommandInputError('invalid-history-count');
  return result;
}

export function runUndo(context: CommandContext): void {
  const input = context.input.take(),
    option = keyword(input),
    database = context.database;
  const text = catalogs[context.locale];
  if (input === undefined || input === '' || typeof input === 'number' || /^\d+$/.test(option)) {
    if (!database.undoControl) {
      context.print(text.control);
      return;
    }
    if (!database.undo(input === undefined || input === '' ? 1 : count(input)))
      context.print(commandMessages.nothingToUndo(context.locale));
    if (database.undoReachedMark) context.print(text.reachedMark);
    return;
  }
  if (['A', 'AUTO'].includes(option)) {
    const value = context.input.take();
    if (value === undefined) {
      context.print(text.onOff);
      return;
    }
    database.setUndoOption('auto', onOff(value));
  } else if (['C', 'CONTROL'].includes(option)) {
    const selected = context.input.take();
    if (selected === undefined) {
      context.print(text.control);
      return;
    }
    const control = selected === '' ? 'ALL' : keyword(selected);
    if (['A', 'ALL', 'N', 'NONE', 'O', 'ONE'].includes(control))
      database.configureUndo(
        control.startsWith('A') ? 'all' : control.startsWith('N') ? 'none' : 'one',
      );
    else if (['C', 'COMBINE', 'L', 'LAYER'].includes(control)) {
      const value = context.input.take();
      if (value === undefined) {
        context.print(text.onOff);
        return;
      }
      database.setUndoOption(control.startsWith('C') ? 'combine' : 'layer', onOff(value));
    } else throw new Error(text.invalid);
  } else if (['BE', 'BEG', 'BEGIN'].includes(option)) database.beginUndoGroup();
  else if (['E', 'END'].includes(option)) database.endUndoGroup();
  else if (['M', 'MARK'].includes(option)) database.markUndo();
  else if (['B', 'BACK'].includes(option)) {
    const result = database.backUndo();
    if (result !== undefined) return;
    const answer = context.input.take();
    if (answer === undefined) {
      context.print(text.allConfirm);
      return;
    }
    if (['Y', 'YES', ''].includes(keyword(answer))) database.backUndo(true);
    else if (!['N', 'NO'].includes(keyword(answer))) throw new Error(text.invalid);
  } else throw new Error(text.invalid);
}
function onOff(input: CommandInput): boolean {
  const option = keyword(input);
  if (option === 'ON' || input === '' || input === true) return true;
  if (option === 'OFF' || input === false) return false;
  throw new CommandInputError('invalid-history-option');
}

export function runMultipleRedo(context: CommandContext): void {
  const input = context.input.take(),
    option = keyword(input);
  const value = ['A', 'ALL'].includes(option)
    ? context.database.redoCount
    : input === undefined || input === '' || ['L', 'LAST'].includes(option)
      ? 1
      : count(input);
  if (!context.database.redo(value)) context.print(commandMessages.nothingToRedo(context.locale));
}
export function runOops(context: CommandContext): void {
  if (!context.database.oops()) context.print(catalogs[context.locale].noErasure);
}
