import { formatSystemVariableError, SystemVariableError } from '@hancad/sysvars';
import type { SystemVariableErrorMessages } from '@hancad/sysvars';
import type { CommandLocale } from './types';

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
  return error instanceof SystemVariableError
    ? formatSystemVariableError(error, systemVariableMessages[locale])
    : error instanceof Error
      ? error.message
      : String(error);
}
