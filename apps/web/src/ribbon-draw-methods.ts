import type { IconName } from './Icon';

export interface DrawRibbonMethod {
  id: string;
  ko: string;
  en: string;
  macro: string;
  icon: IconName;
}
const method = (
  id: string,
  ko: string,
  en: string,
  macro: string,
  icon: IconName,
): DrawRibbonMethod => ({ id, ko, en, macro, icon });
const command = (name: string, ko: string, en: string, icon: IconName): DrawRibbonMethod =>
  method(name, ko, en, `^C^C_${name};`, icon);

/** These are original CUI-style macros; a backslash pauses for one user input. */
export const drawRibbonMethods: Readonly<Record<string, readonly DrawRibbonMethod[]>> = {
  LINE: [
    command('LINE', '선', 'Line', 'line'),
    command('XLINE', '구성선', 'Construction Line', 'line'),
    command('RAY', '광선', 'Ray', 'line'),
  ],
  PLINE: [
    command('PLINE', '폴리선', 'Polyline', 'polyline'),
    command('3DPOLY', '3D 폴리선', '3D Polyline', 'polyline'),
    command('MLINE', '여러 줄', 'Multiline', 'polyline'),
  ],
  CIRCLE: [
    command('CIRCLE', '중심, 반지름', 'Center, Radius', 'circle'),
    method('circle-diameter', '중심, 지름', 'Center, Diameter', '^C^C_CIRCLE;\\_D;', 'circle'),
    method('circle-2p', '2점', '2-Point', '^C^C_CIRCLE;_2P;', 'circle'),
    method('circle-3p', '3점', '3-Point', '^C^C_CIRCLE;_3P;', 'circle'),
    method('circle-ttr', '접선, 접선, 반지름', 'Tan, Tan, Radius', '^C^C_CIRCLE;_TTR;', 'circle'),
    method('circle-ttt', '접선, 접선, 접선', 'Tan, Tan, Tan', '^C^C_CIRCLE;_TTT;', 'circle'),
  ],
  ARC: [
    command('ARC', '3점', '3-Point', 'arc'),
    method('arc-sce', '시작점, 중심, 끝점', 'Start, Center, End', '^C^C_ARC;\\_C;', 'arc'),
    method('arc-sca', '시작점, 중심, 각도', 'Start, Center, Angle', '^C^C_ARC;\\_C;\\_A;', 'arc'),
    method('arc-scl', '시작점, 중심, 길이', 'Start, Center, Length', '^C^C_ARC;\\_C;\\_L;', 'arc'),
    method('arc-sea', '시작점, 끝점, 각도', 'Start, End, Angle', '^C^C_ARC;\\_E;\\_A;', 'arc'),
    method('arc-sed', '시작점, 끝점, 방향', 'Start, End, Direction', '^C^C_ARC;\\_E;\\_D;', 'arc'),
    method('arc-ser', '시작점, 끝점, 반지름', 'Start, End, Radius', '^C^C_ARC;\\_E;\\_R;', 'arc'),
    method('arc-cse', '중심, 시작점, 끝점', 'Center, Start, End', '^C^C_ARC;_C;', 'arc'),
    method('arc-csa', '중심, 시작점, 각도', 'Center, Start, Angle', '^C^C_ARC;_C;\\\\_A;', 'arc'),
    method('arc-csl', '중심, 시작점, 길이', 'Center, Start, Length', '^C^C_ARC;_C;\\\\_L;', 'arc'),
    method('arc-continue', '계속', 'Continue', '^C^C_ARC;;', 'arc'),
  ],
  RECTANG: [
    command('RECTANG', '직사각형', 'Rectangle', 'rectangle'),
    command('POLYGON', '폴리곤', 'Polygon', 'polyline'),
  ],
};

export const moreDrawMethods: readonly DrawRibbonMethod[] = [
  command('ELLIPSE', '타원', 'Ellipse', 'circle'),
  method('ellipse-center', '타원: 중심', 'Ellipse: Center', '^C^C_ELLIPSE;_C;', 'circle'),
  method('ellipse-arc', '타원형 호', 'Elliptical Arc', '^C^C_ELLIPSE;_A;', 'arc'),
  command('SPLINE', '스플라인', 'Spline', 'polyline'),
  method('spline-fit', '스플라인: 맞춤', 'Spline: Fit', '^C^C_SPLINE;_M;_F;', 'polyline'),
  method('spline-cv', '스플라인: 조정 정점', 'Spline: CV', '^C^C_SPLINE;_M;_CV;', 'polyline'),
  command('DONUT', '도넛', 'Donut', 'circle'),
  command('POINT', '단일 점', 'Single Point', 'point'),
  method('point-multiple', '다중 점', 'Multiple Points', '^C^C_MULTIPLE;_POINT;', 'point'),
  command('PTYPE', '점 스타일', 'Point Style', 'point'),
  command('DIVIDE', '등분할', 'Divide', 'point'),
  command('MEASURE', '길이분할', 'Measure', 'point'),
  command('REVCLOUD', '구름형 리비전', 'Revision Cloud', 'cloud'),
  command('WIPEOUT', '객체 가리기', 'Wipeout', 'rectangle'),
  command('REGION', '영역', 'Region', 'region'),
  command('SKETCH', '스케치', 'Sketch', 'polyline'),
  command('HELIX', '나선', 'Helix', 'arc'),
  command('SOLID', '2D 솔리드', '2D Solid', 'region'),
  command('TRACE', '두께선', 'Trace', 'line'),
  command('MLSTYLE', '여러 줄 스타일', 'Multiline Style', 'polyline'),
];
