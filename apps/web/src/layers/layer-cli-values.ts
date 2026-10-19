import type { CadLayer, LegacyCadState } from '@hancad/legacy-bridge';
import { changeLayerField, changeLayers } from './layer-model';
import { ACI_RGB, rgbToCss } from '@hancad/render';

export type Option =
  | 'list'
  | 'make'
  | 'set'
  | 'new'
  | 'rename'
  | 'on'
  | 'off'
  | 'color'
  | 'ltype'
  | 'lweight'
  | 'transparency'
  | 'material'
  | 'plot'
  | 'pstyle'
  | 'freeze'
  | 'thaw'
  | 'lock'
  | 'unlock'
  | 'state'
  | 'description'
  | 'reconcile'
  | 'xref';
export const options: Readonly<Record<string, Option>> = {
  '?': 'list',
  M: 'make',
  MAKE: 'make',
  S: 'set',
  SET: 'set',
  N: 'new',
  NEW: 'new',
  R: 'rename',
  RENAME: 'rename',
  ON: 'on',
  OFF: 'off',
  C: 'color',
  COLOR: 'color',
  L: 'ltype',
  LTYPE: 'ltype',
  LW: 'lweight',
  LWEIGHT: 'lweight',
  TR: 'transparency',
  TRANSPARENCY: 'transparency',
  MAT: 'material',
  MATERIAL: 'material',
  P: 'plot',
  PLOT: 'plot',
  PS: 'pstyle',
  PSTYLE: 'pstyle',
  F: 'freeze',
  FREEZE: 'freeze',
  T: 'thaw',
  THAW: 'thaw',
  LO: 'lock',
  LOCK: 'lock',
  U: 'unlock',
  UNLOCK: 'unlock',
  A: 'state',
  STATE: 'state',
  D: 'description',
  DESCRIPTION: 'description',
  E: 'reconcile',
  RECONCILE: 'reconcile',
  X: 'xref',
  XREF: 'xref',
};
const namedColors: Readonly<Record<string, number>> = {
  RED: 1,
  YELLOW: 2,
  GREEN: 3,
  CYAN: 4,
  BLUE: 5,
  MAGENTA: 6,
  WHITE: 7,
};
export const keyword = (value: string): string => value.trim().replace(/^_/, '').toUpperCase();
export function optionPrompt(ko: boolean): string {
  return ko
    ? '옵션 입력 [?/작성(M)/설정(S)/새로 만들기(N)/이름바꾸기(R)/켜기(ON)/끄기(OFF)/색상(C)/선종류(L)/선가중치(LW)/투명도(TR)/재료(MAT)/플롯(P)/플롯스타일(PS)/동결(F)/동결해제(T)/잠금(LO)/잠금해제(U)/상태(A)/설명(D)/조정(E)/외부참조(X)]:'
    : 'Enter an option [?/Make/Set/New/Rename/ON/OFF/Color/Ltype/LWeight/TRansparency/MATerial/Plot/PStyle/Freeze/Thaw/LOck/Unlock/stAte/Description/rEconcile/Xref]:';
}
export function colorPatch(value: string): Partial<CadLayer> {
  const normalized = keyword(value),
    number = Number(value);
  const rgb = value.split(',').map(Number);
  if (rgb.length === 3 && rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255))
    return {
      trueColor: (rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!,
      color: rgbToCss((rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!),
      visible: true,
    };
  const aci = namedColors[normalized] ?? Math.abs(number);
  if (!Number.isInteger(aci) || aci < 1 || aci > 255)
    throw new Error('색상은 1~255 또는 R,G,B여야 합니다. / Requires color 1–255 or R,G,B.');
  return { aci, color: rgbToCss(ACI_RGB[aci] ?? 0xffffff), visible: number < 0 ? false : true };
}
export function patch(
  state: LegacyCadState,
  option: Option,
  parameter: string,
  names: string,
): LegacyCadState {
  if (option === 'color')
    return changeLayers(state, names, (layer) => {
      const next = { ...layer, ...colorPatch(parameter) };
      if (!parameter.includes(',')) delete next.trueColor;
      return next;
    });
  if (option === 'transparency') {
    const value = Number(parameter);
    if (!Number.isFinite(value) || value < 0 || value > 90)
      throw new Error('투명도는 0~90이어야 합니다. / Transparency must be 0–90.');
    return changeLayers(state, names, (layer) => ({ ...layer, transparency: value }));
  }
  if (option === 'lweight') {
    const weights = [
      0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200,
      211,
    ];
    const n = Number(parameter) * 100;
    if (keyword(parameter) === 'DEFAULT' || keyword(parameter) === 'D')
      return changeLayers(state, names, (layer) => ({ ...layer, lineweight: -3 }));
    if (!Number.isFinite(n) || n < 0)
      throw new Error('유효한 선가중치가 필요합니다. / Invalid lineweight.');
    const value = weights.reduce((a, b) => (Math.abs(a - n) <= Math.abs(b - n) ? a : b));
    return changeLayers(state, names, (layer) => ({ ...layer, lineweight: value }));
  }
  if (option === 'plot') {
    const answer = keyword(parameter);
    if (!['P', 'PLOT', 'N', 'NO', 'NOPLOT', 'Y', 'YES'].includes(answer))
      throw new Error('플롯 또는 플롯 안 함을 입력하십시오. / Enter Plot or No plot.');
    return changeLayerField(state, names, 'plot', ['P', 'PLOT', 'Y', 'YES'].includes(answer));
  }
  const field =
    option === 'ltype'
      ? 'linetype'
      : option === 'material'
        ? 'material'
        : option === 'pstyle'
          ? 'plotStyle'
          : 'description';
  return changeLayers(state, names, (layer) => ({ ...layer, [field]: parameter }));
}
