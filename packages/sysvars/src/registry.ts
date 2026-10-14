export type SysvarValue = number | string | boolean | [number, number] | [number, number, number];
export type SysvarScope = 'drawing' | 'profile' | 'session';
export interface SystemVariableDefinition {
  name: string;
  type: 'integer' | 'real' | 'string' | 'boolean' | 'point2' | 'point3';
  default: SysvarValue;
  scope: SysvarScope;
  description: string;
  min?: number;
  max?: number;
  enum?: readonly SysvarValue[];
  bits?: Readonly<Record<number, string>>;
  readonly?: boolean;
  toggleBit?: number;
}

const integer = (
  name: string,
  value: number,
  min: number,
  max: number,
  description: string,
  scope: SysvarScope = 'drawing',
): SystemVariableDefinition => ({
  name,
  type: 'integer',
  default: value,
  min,
  max,
  scope,
  description,
});
const real = (
  name: string,
  value: number,
  min: number,
  description: string,
  scope: SysvarScope = 'drawing',
): SystemVariableDefinition => ({ name, type: 'real', default: value, min, scope, description });
const text = (
  name: string,
  value: string,
  description: string,
  scope: SysvarScope = 'drawing',
): SystemVariableDefinition => ({ name, type: 'string', default: value, scope, description });
const point = (
  name: string,
  value: [number, number],
  description: string,
): SystemVariableDefinition => ({
  name,
  type: 'point2',
  default: value,
  scope: 'drawing',
  description,
});

/** Only implemented variables are registered; unverified/future variables must not silently accept values. */
export const systemVariableDefinitions: readonly SystemVariableDefinition[] = Object.freeze([
  {
    ...integer('OSMODE', 4133, 0, 32767, '실행 중인 객체 스냅 설정', 'profile'),
    toggleBit: 16384,
    bits: {
      1: 'Endpoint',
      2: 'Midpoint',
      4: 'Center',
      8: 'Node',
      16: 'Quadrant',
      32: 'Intersection',
      64: 'Insertion',
      128: 'Perpendicular',
      256: 'Tangent',
      512: 'Nearest',
      1024: 'Geometric center',
      2048: 'Apparent intersection',
      4096: 'Extension',
      8192: 'Parallel',
      16384: 'Suppress running object snaps',
    },
  },
  integer('LUNITS', 2, 1, 5, '선형 단위 형식'),
  integer('LUPREC', 4, 0, 8, '선형 단위 표시 정밀도'),
  integer('AUNITS', 0, 0, 4, '각도 단위 형식'),
  integer('AUPREC', 0, 0, 8, '각도 단위 표시 정밀도'),
  real('ANGBASE', 0, -Number.MAX_VALUE, '기준 각도'),
  integer('ANGDIR', 0, 0, 1, '각도 측정 방향'),
  integer('MEASUREMENT', 1, 0, 1, '영국식 또는 미터법 리소스'),
  integer('INSUNITS', 4, 0, 24, '삽입 단위'),
  point('LIMMIN', [0, 0], '도면 한계의 왼쪽 아래 점'),
  point('LIMMAX', [420, 297], '도면 한계의 오른쪽 위 점'),
  point('GRIDUNIT', [10, 10], '그리드 간격'),
  point('SNAPUNIT', [10, 10], '스냅 간격'),
  integer('GRIDMODE', 1, 0, 1, '그리드 표시'),
  integer('SNAPMODE', 0, 0, 1, '스냅 모드'),
  integer('SNAPTYPE', 0, 0, 1, '그리드 또는 극좌표 스냅'),
  integer('SNAPSTYL', 0, 0, 1, '표준 또는 등각 스냅'),
  integer('SNAPISOPAIR', 0, 0, 2, '현재 등각 평면'),
  integer('ORTHOMODE', 0, 0, 1, '직교 모드'),
  {
    ...integer('AUTOSNAP', 63, 0, 127, '객체 스냅 표시 및 추적', 'profile'),
    bits: {
      1: 'Marker',
      2: 'Tooltip',
      4: 'Magnet',
      8: 'Polar tracking',
      16: 'Object snap tracking',
      32: 'Tooltips',
      64: 'Polar additional angles',
    },
  },
  integer('POLARMODE', 0, 0, 15, '극좌표 추적 모드', 'profile'),
  real('POLARANG', 90, 0, '극좌표 추적 각도', 'profile'),
  integer('DYNMODE', 3, -3, 3, '동적 입력 모드', 'profile'),
  integer('DYNPICOORDS', 0, 0, 1, '동적 포인터 상대 또는 절대 좌표', 'profile'),
  integer('DYNINFOTIPS', 1, 0, 1, '동적 입력 툴팁', 'profile'),
  integer('UCSDETECT', 1, 0, 1, '동적 UCS', 'profile'),
  integer('3DOSMODE', 0, 0, 2047, '3D 객체 스냅 모드', 'profile'),
  integer('LWDISPLAY', 0, 0, 1, '선가중치 표시'),
  integer('COORDS', 1, 0, 2, '좌표 표시 방식', 'profile'),
  integer('SELECTIONCYCLING', 2, -2, 2, '선택 순환', 'profile'),
  integer('PICKSTYLE', 1, 0, 3, '그룹 및 연관 해치 선택', 'profile'),
  integer('PICKFIRST', 1, 0, 1, '명령 전 객체 선택', 'profile'),
  integer('PICKAUTO', 5, 0, 7, '자동 윈도우 및 올가미 선택', 'profile'),
  integer('PICKADD', 2, 0, 2, '선택 세트 추가 방식', 'profile'),
  integer('PICKBOX', 3, 0, 50, '선택 상자 크기', 'profile'),
  integer('APERTURE', 10, 1, 50, '객체 스냅 조준 상자 크기', 'profile'),
  integer('GRIPS', 1, 0, 2, '그립 표시', 'profile'),
  integer('GRIPSIZE', 5, 1, 255, '그립 크기', 'profile'),
  integer('GRIPCOLOR', 150, 1, 255, '일반 그립 색상', 'profile'),
  integer('GRIPHOT', 12, 1, 255, '활성 그립 색상', 'profile'),
  integer('GRIPHOVER', 1, 1, 255, '호버 그립 색상', 'profile'),
  integer('SELECTIONPREVIEW', 3, 0, 3, '선택 미리보기', 'profile'),
  integer('COMMANDPREVIEW', 1, 0, 1, '명령 미리보기', 'profile'),
  integer('TEMPOVERRIDES', 1, 0, 1, '임시 재지정 키', 'profile'),
  integer('SHORTCUTMENU', 11, 0, 31, '바로 가기 메뉴 모드', 'profile'),
  integer('SHORTCUTMENUDURATION', 250, 100, 10000, '시간 구분 오른쪽 클릭 지연', 'profile'),
  integer('MBUTTONPAN', 1, 0, 1, '중간 버튼 초점이동', 'profile'),
  integer('ZOOMFACTOR', 60, 3, 100, '휠 줌 증가량', 'profile'),
  integer('ZOOMWHEEL', 0, 0, 1, '휠 줌 방향', 'profile'),
  integer('DBLCLKEDIT', 1, 0, 1, '두 번 클릭 편집', 'profile'),
  integer('INPUTSEARCHOPTIONS', 15, 0, 63, '명령 자동 완성 검색 옵션', 'profile'),
  integer('INPUTSEARCHDELAY', 300, 0, 10000, '명령 검색 지연', 'profile'),
  integer('FILEDIA', 1, 0, 1, '파일 대화상자', 'profile'),
  integer('CMDDIA', 1, 0, 1, '명령 대화상자', 'profile'),
  integer('EXPERT', 0, 0, 5, '명령 메시지 생략 수준', 'profile'),
  integer('SAVETIME', 10, 0, 600, '자동 저장 간격(분)', 'profile'),
  integer('ISAVEPERCENT', 50, 0, 100, '증분 저장 비율', 'profile'),
  integer('ISAVEBACK', 1, 0, 1, '저장 백업 파일', 'profile'),
  text('SAVEFILEPATH', '', '자동 저장 경로', 'profile'),
  text('FONTALT', 'sans-serif', '대체 글꼴', 'profile'),
  text('FONTMAP', '', '글꼴 매핑 파일', 'profile'),
  text('MODEMACRO', '', '상태 표시줄 DIESEL 문자열', 'session'),
  text('CLAYER', '0', '현재 도면층'),
  text('CELTYPE', 'BYLAYER', '현재 선종류'),
  text('CECOLOR', 'BYLAYER', '현재 객체 색상'),
  real('CELTSCALE', 1, 0, '현재 객체 선종류 축척'),
  real('LTSCALE', 1, 0, '전역 선종류 축척'),
  integer('PSLTSCALE', 1, 0, 1, '배치 뷰포트 선종류 축척'),
  integer('MSLTSCALE', 1, 0, 1, '모형 공간 선종류 축척'),
  integer('CELWEIGHT', -1, -3, 211, '현재 선가중치'),
  real('THICKNESS', 0, -Number.MAX_VALUE, '현재 객체 두께'),
  real('ELEVATION', 0, -Number.MAX_VALUE, '현재 고도'),
  real('FILLETRAD', 0, 0, '모깎기 반지름'),
  real('CHAMFERA', 0, 0, '첫 번째 모따기 거리'),
  real('CHAMFERB', 0, 0, '두 번째 모따기 거리'),
  real('CHAMFERC', 0, 0, '모따기 길이'),
  real('CHAMFERD', 0, 0, '모따기 각도'),
  real('OFFSETDIST', -1, -1, '간격띄우기 거리'),
  integer('OFFSETGAPTYPE', 0, 0, 2, '간격띄우기 모서리 처리', 'profile'),
  real('CIRCLERAD', 0, 0, '마지막 원 반지름'),
  real('PLINEWID', 0, 0, '새 폴리선 폭'),
  integer('PLINETYPE', 2, 0, 2, '폴리선 형식', 'profile'),
  real('TEXTSIZE', 2.5, 0, '기본 문자 높이'),
  text('TEXTSTYLE', 'Standard', '현재 문자 스타일'),
  text('DIMSTYLE', 'ISO-25', '현재 치수 스타일'),
  real('DIMSCALE', 1, 0, '전체 치수 축척'),
  real('DIMTXT', 2.5, 0, '치수 문자 높이'),
  real('DIMASZ', 2.5, 0, '치수 화살표 크기'),
  real('DIMDLI', 3.75, 0, '기준선 치수 간격'),
  integer('DIMDEC', 2, 0, 8, '치수 소수 자릿수'),
  integer('DIMASSOC', 2, 0, 2, '치수 연관성'),
  real('DIMLFAC', 1, -Number.MAX_VALUE, '선형 치수 측정 배율'),
  real('DIMGAP', 0.625, -Number.MAX_VALUE, '치수 문자 주변 간격'),
  real('DIMEXO', 0.625, 0, '치수보조선 원점 간격'),
  real('DIMEXE', 1.25, 0, '치수보조선 연장'),
  integer('TILEMODE', 1, 0, 1, '모형 공간 활성'),
  text('CTAB', 'Model', '현재 배치'),
  integer('OSNAPCOORD', 2, 0, 2, '좌표 입력과 객체 스냅 우선순위', 'profile'),
  integer('INSUNITSDEFSOURCE', 4, 0, 24, '단위 없는 원본 삽입 단위', 'profile'),
  integer('INSUNITSDEFTARGET', 4, 0, 24, '단위 없는 대상 삽입 단위', 'profile'),
  { ...integer('UNDOCTL', 53, 0, 63, '실행 취소 제어', 'session'), readonly: true },
  { ...integer('CMDACTIVE', 0, 0, 127, '활성 명령 상태', 'session'), readonly: true },
  { ...text('CMDNAMES', '', '활성 명령 이름', 'session'), readonly: true },
]);

const definitions = new Map(
  systemVariableDefinitions.map((definition) => [definition.name, definition]),
);

export function getSystemVariableDefinition(name: string): SystemVariableDefinition | undefined {
  return definitions.get(name.toUpperCase());
}

export function generateSystemVariableMarkdown(): string {
  const rows = systemVariableDefinitions.map(
    (variable) =>
      `| ${variable.name} | ${variable.type} | ${JSON.stringify(variable.default)} | ${variable.scope} | ${variable.readonly ? 'Yes' : 'No'} | ${variable.description} |`,
  );
  return (
    '# System variables\n\nGenerated from `packages/sysvars/src/registry.ts`. Only implemented definitions are listed; full header/500+ parity is pending.\n\n| Name | Type | Default | Scope | Read-only | Korean description |\n| --- | --- | --- | --- | --- | --- |\n' +
    rows.join('\n') +
    '\n'
  );
}
