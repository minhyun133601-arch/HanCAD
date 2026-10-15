import { formatSystemVariableError, SystemVariableError } from '@hancad/sysvars';
import type { SystemVariableErrorMessages } from '@hancad/sysvars';
import type { CommandLocale } from './types';
import { CommandInputError, formatCommandInputError } from './input-errors';
import type { CommandInputErrorMessages } from './input-errors';
import { formatInputValueError, InputValueError } from '@hancad/editor';
import type { InputValueErrorMessages } from '@hancad/editor';

const inputMessages: Record<CommandLocale, CommandInputErrorMessages & InputValueErrorMessages> = {
  'ko-KR': {
    commandInvalidPointValue: (name) => `${name}의 점 값이 올바르지 않습니다.`,
    commandStringValueRequired: (name) => `${name}에는 문자 값이 필요합니다.`,
    commandHistoryCountInvalid: '실행 취소/다시 실행 횟수는 양의 정수여야 합니다.',
    inputStringRequired: '문자 입력이 필요합니다.',
    inputFiniteNumberRequired: '유한한 숫자 입력이 필요합니다.',
  },
  'en-US': {
    commandInvalidPointValue: (name) => `Invalid point value for ${name}.`,
    commandStringValueRequired: (name) => `A string value is required for ${name}.`,
    commandHistoryCountInvalid: 'Undo/redo count must be a positive integer.',
    inputStringRequired: 'A string input is required.',
    inputFiniteNumberRequired: 'A finite number input is required.',
  },
};

const systemVariableMessages: Record<CommandLocale, SystemVariableErrorMessages> = {
  'ko-KR': {
    sysvarUnknown: (name) => `알 수 없는 시스템 변수 "${name}".`,
    sysvarReadonly: (name) => `${name}은(는) 읽기 전용 시스템 변수입니다.`,
    sysvarInvalid: (name, range) => `${name}의 값이 유효하지 않습니다${range}.`,
    sysvarNotNumber: (name) => `${name}은(는) 숫자 변수가 아닙니다.`,
    sysvarNotToggleable: (name) => `${name}은(는) 직접 전환할 수 없습니다.`,
    sysvarMissingSymbol: (name, reference) =>
      `${name}의 값이 유효하지 않습니다. 이름 "${reference}"이(가) 도면에 없습니다.`,
    sysvarRangeMinimum: (minimum) => ` (${minimum} 이상)`,
    sysvarRangeMaximum: (maximum) => ` (${maximum} 이하)`,
    sysvarRangeBetween: (minimum, maximum) => ` (${minimum}~${maximum})`,
  },
  'en-US': {
    sysvarUnknown: (name) => `Unknown system variable "${name}".`,
    sysvarReadonly: (name) => `${name} is a read-only system variable.`,
    sysvarInvalid: (name, range) => `Invalid value for ${name}${range}.`,
    sysvarNotNumber: (name) => `${name} is not a numeric variable.`,
    sysvarNotToggleable: (name) => `${name} cannot be toggled directly.`,
    sysvarMissingSymbol: (name, reference) =>
      `Invalid value for ${name}. Name "${reference}" does not exist in the drawing.`,
    sysvarRangeMinimum: (minimum) => ` (${minimum} or greater)`,
    sysvarRangeMaximum: (maximum) => ` (${maximum} or less)`,
    sysvarRangeBetween: (minimum, maximum) => ` (${minimum}–${maximum})`,
  },
};

export function commandErrorMessage(error: unknown, locale: CommandLocale): string {
  if (error instanceof CommandInputError)
    return formatCommandInputError(error, inputMessages[locale]);
  if (error instanceof InputValueError) return formatInputValueError(error, inputMessages[locale]);
  return error instanceof SystemVariableError
    ? formatSystemVariableError(error, systemVariableMessages[locale])
    : error instanceof Error
      ? error.message
      : String(error);
}
