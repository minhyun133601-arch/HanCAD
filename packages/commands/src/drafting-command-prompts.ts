import { coordinateSettings, formatDraftNumber } from '@hancad/draft';
import type { SysvarValue } from '@hancad/sysvars';
import type { CommandLocale } from './types';

export type DraftingCommandName = 'GRID' | 'SNAP' | 'ORTHO' | 'ISOPLANE' | 'ISODRAFT';
export type DraftingStage =
  | 'main'
  | 'aspect-x'
  | 'aspect-y'
  | 'style'
  | 'style-spacing'
  | 'iso-spacing'
  | 'type'
  | 'legacy'
  | 'major'
  | 'adaptive'
  | 'subdivide'
  | 'limits'
  | 'follow';

export function draftingCommandPrompt(
  name: DraftingCommandName,
  stage: DraftingStage,
  get: (name: string) => SysvarValue,
  locale: CommandLocale,
): string {
  const ko = locale === 'ko-KR';
  const number = (key: string) => Number(get(key));
  const pair = (key: string): readonly number[] => {
    const value = get(key);
    return Array.isArray(value) ? value.map(Number) : [0, 0];
  };
  const unit = name === 'GRID' ? 'GRIDUNIT' : 'SNAPUNIT';
  const length = (n: number) => formatDraftNumber(n, coordinateSettings(get));
  const onOff = (n: number) => (ko ? (n ? '켜기' : '끄기') : n ? 'ON' : 'OFF');
  const plane = ['Left', 'Top', 'Right'][number('SNAPISOPAIR')] ?? 'Left';
  const planeKo = ['좌측면도', '평면도', '우측면도'][number('SNAPISOPAIR')] ?? '좌측면도';
  if (stage === 'main') {
    if (name === 'ORTHO')
      return ko
        ? `직교 모드 입력 [켜기(ON)/끄기(OFF)] <${onOff(number('ORTHOMODE'))}>:`
        : `Enter mode [ON/OFF] <${onOff(number('ORTHOMODE'))}>:`;
    if (name === 'ISOPLANE')
      return ko
        ? `등각투영 평면 설정 입력 [좌측면도(L)/평면도(T)/우측면도(R)] <${planeKo}>:`
        : `Enter isometric plane setting [Left/Top/Right] <${plane}>:`;
    if (name === 'ISODRAFT')
      return ko
        ? `옵션 입력 [직교(O)/등각평면 왼쪽(L)/등각평면 맨 위(T)/등각평면 오른쪽(R)] <${number('SNAPSTYL') ? planeKo : '직교'}>:`
        : `Enter an option [Orthographic/isoplane Left/isoplane Top/isoplane Right] <${number('SNAPSTYL') ? plane : 'Orthographic'}>:`;
    const current = length(pair(unit)[0] ?? 0);
    return name === 'GRID'
      ? ko
        ? `그리드 간격두기(X) 지정 또는 [켜기(ON)/끄기(OFF)/스냅(S)/주(M)/적응성(D)/한계(L)/따름(F)/종횡비(A)] <${current}>:`
        : `Specify grid spacing(X) or [ON/OFF/Snap/Major/aDaptive/Limits/Follow/Aspect] <${current}>:`
      : ko
        ? `스냅 간격두기 지정 또는 [켜기(ON)/끄기(OFF)/종횡비(A)/기존(L)/스타일(S)/유형(T)] <${current}>:`
        : `Specify snap spacing or [ON/OFF/Aspect/Legacy/Style/Type] <${current}>:`;
  }
  if (stage === 'aspect-x' || stage === 'aspect-y' || stage === 'iso-spacing') {
    const vertical = stage !== 'aspect-x';
    const current = length(pair(unit)[vertical ? 1 : 0] ?? 0);
    return ko
      ? `${vertical ? '수직' : '수평'} 간격두기 지정 <${current}>:`
      : `Specify ${vertical ? 'vertical' : 'horizontal'} spacing <${current}>:`;
  }
  if (stage === 'style')
    return ko
      ? `스냅 그리드 스타일 입력 [표준(S)/등각투영(I)] <${number('SNAPSTYL') ? '등각투영' : '표준'}>:`
      : `Enter snap grid style [Standard/Isometric] <${number('SNAPSTYL') ? 'Isometric' : 'Standard'}>:`;
  if (stage === 'style-spacing')
    return ko
      ? `스냅 간격두기 지정 또는 [종횡비(A)] <${length(pair(unit)[0] ?? 0)}>:`
      : `Specify snap spacing or [Aspect] <${length(pair(unit)[0] ?? 0)}>`;
  if (stage === 'type')
    return ko
      ? `스냅 유형 입력 [극좌표(P)/그리드(G)] <${number('SNAPTYPE') ? '극좌표' : '그리드'}>:`
      : `Enter snap type [Polar/Grid] <${number('SNAPTYPE') ? 'Polar' : 'Grid'}>:`;
  if (stage === 'major')
    return ko
      ? `주 그리드선 빈도 지정 <${number('GRIDMAJOR')}>:`
      : `Specify major grid line frequency <${number('GRIDMAJOR')}>:`;
  const bit = stage === 'adaptive' ? 2 : stage === 'subdivide' ? 4 : stage === 'limits' ? 1 : 8;
  const enabled =
    stage === 'legacy' ? number('SNAPGRIDLEGACY') !== 0 : Boolean(number('GRIDDISPLAY') & bit);
  const question = {
    legacy: [
      '항상 그리드에 스냅하는 기존 동작을 유지하시겠습니까?',
      'Maintain legacy behavior of always snapping to the grid?',
    ],
    adaptive: ['적응성 동작을 켜시겠습니까?', 'Turn on adaptive behavior?'],
    subdivide: [
      '그리드 간격 아래에 재분할을 허용하시겠습니까?',
      'Allow subdivision below grid spacing?',
    ],
    limits: ['한계를 초과하여 그리드를 표시하시겠습니까?', 'Display grid beyond Limits?'],
    follow: ['동적 UCS를 따르시겠습니까?', 'Follow dynamic UCS?'],
  } as const;
  const key = stage as keyof typeof question;
  return ko
    ? `${question[key][0]} [예(Y)/아니오(N)] <${enabled ? '예' : '아니오'}>:`
    : `${question[key][1]} [Yes/No] <${enabled ? 'Yes' : 'No'}>:`;
}
