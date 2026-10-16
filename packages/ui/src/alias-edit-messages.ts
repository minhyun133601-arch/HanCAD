import type { Locale } from './messages';

/** REINIT and ALIASEDIT dialogs and PGP reload messages (Phase 03). */
export interface AliasEditMessages {
  reinitTitle: string;
  ioPorts: string;
  devicesAndFiles: string;
  digitizer: string;
  pgpFile: string;
  title: string;
  aliasesTab: string;
  externalTab: string;
  correctionsTab: string;
  synonymsTab: string;
  alias: string;
  command: string;
  source: string;
  builtin: string;
  user: string;
  mistyped: string;
  synonym: string;
  externalLine: string;
  externalHint: string;
  executable: string;
  flags: string;
  prompt: string;
  add: string;
  change: string;
  remove: string;
  chooseFile: string;
  reloadFile: string;
  exportFile: string;
  clearFile: string;
  noFile: string;
  linked: (name: string) => string;
  copied: (name: string) => string;
  ok: string;
  cancel: string;
  apply: string;
  invalidAlias: string;
  unknownCommand: (name: string) => string;
  invalidExternal: string;
  reloadDenied: (name: string) => string;
  reloadFailed: (name: string) => string;
  invalidLines: (name: string, lines: string) => string;
  writeDenied: (name: string) => string;
}

const ko: AliasEditMessages = {
  reinitTitle: '재초기화',
  ioPorts: '입출력 포트 초기화',
  devicesAndFiles: '장치 및 파일 초기화',
  digitizer: '디지타이저',
  pgpFile: 'PGP 파일',
  title: '별칭 편집',
  aliasesTab: '명령 별칭',
  externalTab: '외부 명령',
  correctionsTab: '자동 수정 리스트',
  synonymsTab: '동의어 리스트',
  alias: '별칭',
  command: '명령',
  source: '출처',
  builtin: '기본',
  user: '사용자',
  mistyped: '잘못된 입력',
  synonym: '동의어',
  externalLine: 'PGP 줄',
  externalHint: '명령,실행 파일,플래그,[*]프롬프트,',
  executable: '실행 파일',
  flags: '플래그',
  prompt: '프롬프트',
  add: '추가',
  change: '변경',
  remove: '제거',
  chooseFile: '파일 선택...',
  reloadFile: '다시 로드',
  exportFile: '내보내기',
  clearFile: '연결 해제',
  noFile: '사용자 PGP 파일 없음 (기본 별칭 사용)',
  linked: (name) => `${name} (디스크 파일과 연결됨)`,
  copied: (name) => `${name} (저장된 복사본)`,
  ok: '확인',
  cancel: '취소',
  apply: '적용',
  invalidAlias: '별칭에는 영문자, 숫자, -, _, . 만 사용할 수 있습니다.',
  unknownCommand: (name) => `알 수 없는 명령 "${name}"입니다.`,
  invalidExternal: '외부 명령 줄 형식이 올바르지 않습니다.',
  reloadDenied: (name) => `${name}을(를) 읽을 권한이 없어 저장된 복사본을 계속 사용합니다.`,
  reloadFailed: (name) => `${name}을(를) 다시 읽을 수 없어 저장된 복사본을 계속 사용합니다.`,
  invalidLines: (name, lines) => `${name}: 다음 줄을 해석할 수 없습니다: ${lines}`,
  writeDenied: (name) => `${name}에 쓸 수 없어 변경 내용을 HanCAD 복사본에만 저장했습니다.`,
};

const en: AliasEditMessages = {
  reinitTitle: 'Re-initialization',
  ioPorts: 'I/O Port Initialization',
  devicesAndFiles: 'Device and File Initialization',
  digitizer: 'Digitizer',
  pgpFile: 'PGP File',
  title: 'Edit Aliases',
  aliasesTab: 'Command Aliases',
  externalTab: 'External Commands',
  correctionsTab: 'AutoCorrect List',
  synonymsTab: 'Synonym List',
  alias: 'Alias',
  command: 'Command',
  source: 'Source',
  builtin: 'Built-in',
  user: 'User',
  mistyped: 'Mistyped',
  synonym: 'Synonym',
  externalLine: 'PGP line',
  externalHint: 'command,executable,flags,[*]prompt,',
  executable: 'Executable',
  flags: 'Flags',
  prompt: 'Prompt',
  add: 'Add',
  change: 'Change',
  remove: 'Remove',
  chooseFile: 'Choose File...',
  reloadFile: 'Reload',
  exportFile: 'Export',
  clearFile: 'Unlink',
  noFile: 'No user PGP file (built-in aliases)',
  linked: (name) => `${name} (linked to the file on disk)`,
  copied: (name) => `${name} (stored copy)`,
  ok: 'OK',
  cancel: 'Cancel',
  apply: 'Apply',
  invalidAlias: 'Aliases may contain only letters, digits, -, _ and .',
  unknownCommand: (name) => `Unknown command "${name}".`,
  invalidExternal: 'The external command line is not valid.',
  reloadDenied: (name) => `No permission to read ${name}; the stored copy stays in use.`,
  reloadFailed: (name) => `${name} could not be read again; the stored copy stays in use.`,
  invalidLines: (name, lines) => `${name}: these lines could not be read: ${lines}`,
  writeDenied: (name) => `${name} could not be written; the changes are kept in HanCAD's copy.`,
};

export function getAliasEditMessages(locale: Locale): AliasEditMessages {
  return locale === 'ko-KR' ? ko : en;
}
