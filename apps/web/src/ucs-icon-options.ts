import { reverseHangulInput } from '@hancad/input';

export function ucsIconOption(input: string, current: number): number | undefined {
  const value = reverseHangulInput(input.trim()).replace(/^_/, '').toUpperCase();
  if (value === 'ON') return current | 1;
  if (value === 'OFF') return current & ~1;
  if (/^(OR|ORIGIN)$/.test(value)) return current | 2;
  if (/^(N|NOORIGIN)$/.test(value)) return current & ~2;
  return undefined;
}
export function ucsIconPrompt(korean: boolean): string {
  return korean
    ? '옵션 입력 [켜기(ON)/끄기(OFF)/원점 없음(N)/원점(OR)]:'
    : 'Enter an option [ON/OFF/Noorigin/ORigin]:';
}
