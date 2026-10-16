import { getSystemVariableDefinition } from '@hancad/sysvars';
import type { CommandDefinition } from './types';

export const osnapModes = [
  ['END', 'ENDPOINT', 1, '끝점', 'Endpoint'],
  ['MID', 'MIDPOINT', 2, '중간점', 'Midpoint'],
  ['CEN', 'CENTER', 4, '중심', 'Center'],
  ['GCE', 'GEOMETRICCENTER', 1024, '기하학적 중심', 'Geometric Center'],
  ['NOD', 'NODE', 8, '노드', 'Node'],
  ['QUA', 'QUADRANT', 16, '사분점', 'Quadrant'],
  ['INT', 'INTERSECTION', 32, '교차점', 'Intersection'],
  ['EXT', 'EXTENSION', 4096, '연장선', 'Extension'],
  ['INS', 'INSERTION', 64, '삽입점', 'Insertion'],
  ['PER', 'PERPENDICULAR', 128, '수직', 'Perpendicular'],
  ['TAN', 'TANGENT', 256, '접점', 'Tangent'],
  ['NEA', 'NEAREST', 512, '근처점', 'Nearest'],
  ['APP', 'APPARENT', 2048, '가상 교차점', 'Apparent Intersection'],
  ['PAR', 'PARALLEL', 8192, '평행', 'Parallel'],
] as const;

/** Comma-separated running modes, distinct from a one-pick point-prompt override. */
export function parseOsnapModes(input: string, current: number): number | undefined {
  const value = input.trim().replace(/^_/, '').toUpperCase();
  if (!value) return current;
  if (value === 'OFF') return current | 16384;
  if (value === 'NON' || value === 'NONE') return 0;
  let bits = 0;
  for (const part of value.split(',')) {
    const token = part.trim().replace(/^_/, '');
    const entry = osnapModes.find(
      ([short, full]) => token.length >= 3 && (short === token || full.startsWith(token)),
    );
    if (!entry) return;
    bits |= entry[2];
  }
  return bits;
}

export function osnapCommand(openDialog?: () => void): CommandDefinition {
  const neutral = { 'ko-KR': '', 'en-US': '' };
  return {
    name: 'OSNAP',
    displayName: neutral,
    description: neutral,
    nextPrompt: (values, state) => {
      if (!state.prefixes.commandLine) return;
      const valid = values.some(
        (value) => parseOsnapModes(value, state.sysvars.getNumber('OSMODE')) !== undefined,
      );
      if (valid) return;
      const ko = state.locale === 'ko-KR';
      return {
        prompt: ko ? '객체 스냅 모드의 리스트 입력:' : 'Enter list of object snap modes:',
        ...(values.length
          ? { notice: ko ? '유효하지 않은 객체 스냅 모드입니다.' : 'Invalid object snap mode.' }
          : {}),
      };
    },
    execute: (context) => {
      if (!context.prefixes?.commandLine) {
        if (openDialog) openDialog();
        else
          context.print(
            context.locale === 'ko-KR'
              ? '대화상자를 사용할 수 없습니다. -OSNAP 명령을 사용하십시오.'
              : 'The dialog is unavailable. Use -OSNAP.',
          );
        return;
      }
      const current = context.sysvars.getNumber('OSMODE');
      let result: number | undefined;
      while (context.input.remaining) {
        const input = context.input.requireString();
        result = parseOsnapModes(input, current);
        if (result !== undefined) break;
      }
      if (result === undefined) return;
      const mask = getSystemVariableDefinition('OSMODE')?.bitmask ?? 32767;
      context.sysvars.set('OSMODE', result & mask);
    },
  };
}
