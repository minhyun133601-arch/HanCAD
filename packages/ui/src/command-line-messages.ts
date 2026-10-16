import type { Locale } from './messages';

/** Command window chrome, menus and dialogs (Phase 03). */
export interface CommandLineMessages {
  customize: string;
  close: string;
  moveHandle: string;
  recentCommands: string;
  noRecentCommands: string;
  recentInput: string;
  inputSettings: string;
  autoComplete: string;
  autoCorrect: string;
  searchSystemVariables: string;
  searchContent: string;
  midStringSearch: string;
  delayTime: string;
  inputSearchOptions: string;
  promptHistoryLines: string;
  transparency: string;
  options: string;
  copy: string;
  copyHistory: string;
  paste: string;
  pasteToCommandLine: string;
  textWindowTitle: (drawing: string) => string;
  closeTitle: string;
  closeQuestion: string;
  yes: string;
  no: string;
  ok: string;
  cancel: string;
  transparencyTitle: string;
  transparencyLabel: string;
  transparencyNote: string;
  commandLineHidden: string;
  textWindowCopied: string;
  clipboardUnavailable: string;
}

const ko: CommandLineMessages = {
  customize: '사용자화',
  close: '닫기',
  moveHandle: '명령행 이동 및 고정',
  recentCommands: '최근 명령',
  noRecentCommands: '(최근 명령 없음)',
  recentInput: '최근 입력',
  inputSettings: '입력 설정',
  autoComplete: '자동 완성',
  autoCorrect: '자동 수정',
  searchSystemVariables: '시스템 변수 검색',
  searchContent: '컨텐츠 검색',
  midStringSearch: '중간 문자열 검색',
  delayTime: '지연 시간',
  inputSearchOptions: '검색 입력 옵션...',
  promptHistoryLines: '프롬프트 기록 줄...',
  transparency: '투명도...',
  options: '옵션...',
  copy: '복사',
  copyHistory: '기록 복사',
  paste: '붙여넣기',
  pasteToCommandLine: '명령행에 붙여넣기',
  textWindowTitle: (drawing) => `HanCAD 문자 윈도우 - ${drawing}`,
  closeTitle: '명령행 - 윈도우 닫기',
  closeQuestion: '명령행 윈도우를 닫으시겠습니까? Ctrl+9를 누르면 다시 표시됩니다.',
  yes: '예',
  no: '아니오',
  ok: '확인',
  cancel: '취소',
  transparencyTitle: '투명도',
  transparencyLabel: '명령행 윈도우 투명도',
  transparencyNote: '부동 명령행 윈도우와 임시 프롬프트에 적용됩니다.',
  commandLineHidden: '명령행 윈도우가 숨겨졌습니다. Ctrl+9 또는 COMMANDLINE으로 다시 표시하십시오.',
  textWindowCopied: '명령 기록을 클립보드에 복사했습니다.',
  clipboardUnavailable: '클립보드를 사용할 수 없습니다.',
};

const en: CommandLineMessages = {
  customize: 'Customize',
  close: 'Close',
  moveHandle: 'Move or dock the command line',
  recentCommands: 'Recent Commands',
  noRecentCommands: '(No recent commands)',
  recentInput: 'Recent Input',
  inputSettings: 'Input Settings',
  autoComplete: 'AutoComplete',
  autoCorrect: 'AutoCorrect',
  searchSystemVariables: 'Search System Variables',
  searchContent: 'Search Content',
  midStringSearch: 'Mid-string Search',
  delayTime: 'Delay Time',
  inputSearchOptions: 'Input Search Options...',
  promptHistoryLines: 'Lines of Prompt History...',
  transparency: 'Transparency...',
  options: 'Options...',
  copy: 'Copy',
  copyHistory: 'Copy History',
  paste: 'Paste',
  pasteToCommandLine: 'Paste To CmdLine',
  textWindowTitle: (drawing) => `HanCAD Text Window - ${drawing}`,
  closeTitle: 'Command Line - Close Window',
  closeQuestion: 'Do you want to close the command line window? Press Ctrl+9 to show it again.',
  yes: 'Yes',
  no: 'No',
  ok: 'OK',
  cancel: 'Cancel',
  transparencyTitle: 'Transparency',
  transparencyLabel: 'Command line window transparency',
  transparencyNote: 'Applies to the floating command line window and temporary prompts.',
  commandLineHidden: 'The command line window is hidden. Press Ctrl+9 or enter COMMANDLINE.',
  textWindowCopied: 'The command history was copied to the clipboard.',
  clipboardUnavailable: 'The clipboard is unavailable.',
};

export function getCommandLineMessages(locale: Locale): CommandLineMessages {
  return locale === 'ko-KR' ? ko : en;
}
