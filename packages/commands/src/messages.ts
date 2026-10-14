import type { CommandLocale } from './types';

export const commandMessages = {
  unknown: (name: string, locale: CommandLocale): string =>
    locale === 'ko-KR'
      ? `알 수 없는 명령 "${name}". 도움말을 보려면 F1을 누르십시오.`
      : `Unknown command "${name}". Press F1 for help.`,
  pending: (name: string, locale: CommandLocale): string =>
    locale === 'ko-KR'
      ? `명령 "${name}"은(는) 아직 구현되지 않았습니다.`
      : `Command "${name}" is not implemented yet.`,
  cancelled: (locale: CommandLocale): string => (locale === 'ko-KR' ? '*취소*' : '*Cancel*'),
  variablePrompt: (name: string, value: string, locale: CommandLocale): string =>
    locale === 'ko-KR'
      ? `${name}에 대한 새 값 입력 <${value}>:`
      : `Enter new value for ${name} <${value}>:`,
  transparent: (name: string, locale: CommandLocale): string =>
    locale === 'ko-KR'
      ? `${name} 명령은 투명하게 실행할 수 없습니다.`
      : `${name} cannot run transparently.`,
  nothingToUndo: (locale: CommandLocale): string =>
    locale === 'ko-KR' ? '실행 취소할 항목이 없습니다.' : 'There is nothing to undo.',
  nothingToRedo: (locale: CommandLocale): string =>
    locale === 'ko-KR' ? '다시 실행할 항목이 없습니다.' : 'There is nothing to redo.',
  undefinePrompt: (locale: CommandLocale): string =>
    locale === 'ko-KR' ? '명령 이름 입력:' : 'Enter command name:',
};
