import type { Locale } from './messages';

/** Suggestion list and INPUTSEARCHOPTIONS dialog (Phase 03). */
export interface InputSearchMessages {
  suggestions: string;
  systemVariables: string;
  tabHint: string;
  command: string;
  variable: string;
  title: string;
  autoComplete: string;
  enableAutoComplete: string;
  midString: string;
  sortOrder: string;
  byUsage: string;
  alphabetical: string;
  autoCorrect: string;
  enableAutoCorrect: string;
  rememberBefore: string;
  rememberAfter: string;
  systemVariableSearch: string;
  searchSystemVariables: string;
  separate: string;
  delay: string;
  milliseconds: string;
  content: string;
  searchContent: string;
  contentTypes: string;
  contentNames: Readonly<
    Record<'block' | 'layer' | 'hatch' | 'visualStyle' | 'textStyle' | 'dimStyle', string>
  >;
  moveUp: string;
  moveDown: string;
  contentPending: string;
  ok: string;
  cancel: string;
}

const ko: InputSearchMessages = {
  suggestions: '제안 사항 리스트',
  systemVariables: '시스템 변수',
  tabHint: 'Tab 키를 눌러 표시',
  command: '명령',
  variable: '시스템 변수',
  title: '검색 입력 옵션',
  autoComplete: '자동 완성',
  enableAutoComplete: '자동 완성 사용',
  midString: '중간 문자열 검색 사용',
  sortOrder: '제안 사항 정렬',
  byUsage: '사용 빈도에 따름',
  alphabetical: '알파벳순',
  autoCorrect: '자동 수정',
  enableAutoCorrect: '자동 수정 사용',
  rememberBefore: '',
  rememberAfter: '번 잘못 입력한 후에 수정 사항 저장',
  systemVariableSearch: '시스템 변수 검색',
  searchSystemVariables: '시스템 변수 검색',
  separate: '명령 및 시스템 변수 분리',
  delay: '제안 사항 리스트 지연 시간',
  milliseconds: '밀리초',
  content: '명령행에서 컨텐츠 검색',
  searchContent: '명령행에서 컨텐츠 검색',
  contentTypes: '컨텐츠 유형',
  contentNames: {
    block: '블록',
    layer: '도면층',
    hatch: '해치',
    visualStyle: '비주얼 스타일',
    textStyle: '문자 스타일',
    dimStyle: '치수 스타일',
  },
  moveUp: '위로 이동',
  moveDown: '아래로 이동',
  contentPending:
    '명명된 객체의 검색 결과는 도면층·스타일·해치·블록 기능이 구현되는 단계에서 제공됩니다. 설정은 저장됩니다.',
  ok: '확인',
  cancel: '취소',
};

const en: InputSearchMessages = {
  suggestions: 'Suggestion list',
  systemVariables: 'System Variables',
  tabHint: 'Press Tab to show',
  command: 'Command',
  variable: 'System variable',
  title: 'Input Search Options',
  autoComplete: 'AutoComplete',
  enableAutoComplete: 'Enable AutoComplete',
  midString: 'Enable Mid-string Search',
  sortOrder: 'Sort suggestions',
  byUsage: 'According to frequency of usage',
  alphabetical: 'Alphabetically',
  autoCorrect: 'AutoCorrect',
  enableAutoCorrect: 'Enable AutoCorrect',
  rememberBefore: 'Remember Corrections After',
  rememberAfter: 'Mistypes',
  systemVariableSearch: 'Search System Variables',
  searchSystemVariables: 'Search System Variables',
  separate: 'Separate Commands and System Variables',
  delay: 'Suggestion List Delay Time',
  milliseconds: 'milliseconds',
  content: 'Search Content at Command Line',
  searchContent: 'Search Content at Command Line',
  contentTypes: 'Content Type',
  contentNames: {
    block: 'Block',
    layer: 'Layer',
    hatch: 'Hatch',
    visualStyle: 'Visual Style',
    textStyle: 'Text Style',
    dimStyle: 'Dim Style',
  },
  moveUp: 'Move up',
  moveDown: 'Move down',
  contentPending:
    'Named-object results arrive with the layer, style, hatch and block phases. The settings are saved.',
  ok: 'OK',
  cancel: 'Cancel',
};

export function getInputSearchMessages(locale: Locale): InputSearchMessages {
  return locale === 'ko-KR' ? ko : en;
}
