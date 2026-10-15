import type { CadImportMessages } from './import-diagnostics';

export const importKo: CadImportMessages = {
  plain: {
    'runtime-unavailable': '로컬 CAD 실행 모듈을 불러오지 못했습니다. 앱을 다시 열어 주세요.',
    'stored-invalid': '저장된 도면 데이터가 올바르지 않습니다.',
    'stored-entities-invalid': '저장된 도면 객체 검증에 실패했습니다.',
    'file-size': '64 MB 이하의 DWG / DXF 파일을 선택해 주세요.',
    'file-extension': 'DWG 또는 DXF 파일만 가져올 수 있습니다.',
    cancelled: '가져오기를 취소했습니다.',
    'binary-dxf': '바이너리 DXF는 지원하지 않습니다. CAD에서 ASCII DXF로 저장해 주세요.',
    'dxf-size': 'DXF 데이터가 너무 큽니다.',
    'dxf-pairs': 'DXF 그룹 코드와 값의 쌍이 손상되었습니다.',
    'no-editable-entities': '편집 가능한 2D 객체가 없습니다. 원래 도면은 그대로 유지됩니다.',
    'imported-invalid': '가져온 도면 검증에 실패했습니다.',
    'dwg-browser-unavailable': 'DWG 읽기를 지원하는 Chrome 또는 Edge에서 실행해 주세요.',
    'dwg-engine-unavailable':
      'DWG 엔진을 불러오지 못했습니다. HanCAD 앱을 다시 실행하거나 최신 버전으로 빌드해 주세요.',
    'dwg-timeout':
      'DWG 읽기 제한 시간을 초과했습니다. 필요한 영역만 분리한 파일로 다시 시도해 주세요.',
    'dwg-signature': 'DWG 파일 서명이 올바르지 않습니다.',
    'dxf-engine-unavailable': 'DXF 해석 엔진을 찾을 수 없습니다.',
    'curve-approximated':
      '곡선 폴리선 / 타원 / 비균일 축척의 원은 편집 가능한 폴리선으로 근사합니다.',
    'spline-approximated': '스플라인은 편집 가능한 폴리선으로 근사합니다.',
    'hidden-skipped':
      '배치 공간 또는 숨김 객체는 가져오지 않습니다. 레이어 숨김 / 잠금은 유지합니다.',
    'tilted-skipped': '기울어진 3D 객체는 가져오지 않습니다.',
    'blocks-exploded': '블록은 개별 편집 객체로 분해합니다.',
    'dimensions-exploded':
      '기존 CAD 치수는 표시 형상을 개별 객체로 가져옵니다. 새 치수는 치수 도구로 작성합니다.',
    'dimension-skipped': '표시 블록이 없는 비정렬 치수는 생략합니다.',
    'polyline-projected': '3D 폴리선은 XY 평면으로 투영합니다.',
    'text-approximated': '문자 서식 / 글꼴 / 정렬은 기본 문자로 근사합니다.',
    'fill-outlined': '솔리드 / 해치 채움은 윤곽선으로 가져옵니다.',
    'hatch-spline-skipped': '스플라인 해치 경계는 생략합니다.',
    'unsupported-skipped': '지원하지 않는 객체는 보고서에 표시하고 생략합니다.',
    'unit-unspecified': '도면 단위가 mm / cm / m로 지정되지 않아 단위 없는 좌표로 가져옵니다.',
    'dwg-lossy':
      'DWG는 LibreDWG로 읽습니다. 프록시 / 전문 3D 객체 일부는 변환 엔진에서 누락될 수 있습니다.',
  },
  geometry: {
    point: '올바르지 않은 좌표',
    'coordinate-range': '좌표 범위 초과',
    entity: '유효하지 않은 객체 데이터',
    'polyline-vertices': '폴리선 정점 수가 올바르지 않습니다.',
    'polyline-point': '폴리선 좌표가 올바르지 않습니다.',
    'polyline-curve-vertices': '폴리선 곡선 정점 수가 너무 많습니다.',
    ellipse: '타원 데이터가 올바르지 않습니다.',
    'empty-ellipse': '빈 타원',
    spline: '스플라인의 차수 / 매듭 / 제어점이 올바르지 않습니다.',
    'spline-interval': '스플라인 구간이 없습니다.',
    'spline-weights': '스플라인 가중치가 올바르지 않습니다.',
    'block-transform': '블록 변환 데이터가 올바르지 않습니다.',
    'circle-radius': '원 반지름이 올바르지 않습니다.',
    'arc-angle': '원호 각도가 올바르지 않습니다.',
    'text-content-size': '문자 내용 / 크기가 올바르지 않습니다.',
    'text-rotation': '문자 회전이 올바르지 않습니다.',
    'hatch-boundary': '해치 경계가 없습니다.',
    'hatch-visible-boundary': '표시 가능한 해치 경계가 없습니다.',
  },
  progress: {
    'file-reading': '파일 읽는 중',
    'dwg-converting': 'DWG 해석 중 (오프라인)',
    'entities-importing': '2D 객체 가져오는 중',
  },
  preparing: (entities, layers, blocks) =>
    `원본 객체 ${entities.toLocaleString('ko-KR')}개 · 도면층 ${layers.toLocaleString('ko-KR')}개 · 블록 ${blocks.toLocaleString('ko-KR')}개: 표시할 객체 준비 중`,
  groupCode: (line) => `DXF ${line}행의 그룹 코드가 올바르지 않습니다.`,
  invalidNumber: (line) => `DXF ${line}행에 유효하지 않은 숫자가 있습니다.`,
  structure: {
    SECTION: 'DXF SECTION 구조가 손상되었습니다.',
    ENDSEC: 'DXF ENDSEC 구조가 손상되었습니다.',
    'EOF-after': 'DXF EOF 뒤에 데이터가 있습니다.',
    complete: '완전한 DXF ENTITIES / ENDSEC / EOF 구조를 찾을 수 없습니다.',
  },
  entityLimit: (limit) =>
    `도면 객체가 지원 한도 ${limit.toLocaleString('ko-KR')}개를 초과합니다. CAD에서 필요한 영역만 분리해 주세요.`,
  layerLimit: (limit) => `레이어가 ${limit}개를 초과합니다. 필요한 레이어만 분리해 주세요.`,
  dwgDecodeFailed: (detail) =>
    `DWG 해석에 실패했습니다. 파일 버전 / 손상 여부를 확인해 주세요.${detail ? ` ${detail}` : ''}`,
  dwgEngineFailed: (detail) => `DWG 엔진 오류: ${detail || '작업 중단'}`,
  dwgVersion: (_version) =>
    'R13 ~ R2018 형식의 DWG를 지원합니다. CAD에서 해당 형식으로 다시 저장해 주세요.',
  blockReference: (name) => `블록 누락 또는 순환 참조: ${name}`,
  entitySkipped: (type, reason) => `${type}: ${reason}`,
};
