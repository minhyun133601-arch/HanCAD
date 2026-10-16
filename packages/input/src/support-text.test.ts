import { describe, expect, it } from 'vitest';
import { decodeSupportText } from './support-text';

describe('support file text decoding', () => {
  it('reads UTF-8 with and without a BOM', () => {
    const utf8 = new TextEncoder().encode('C, *CIRCLE ; 원\r\n');
    expect(decodeSupportText(utf8)).toEqual({ text: 'C, *CIRCLE ; 원\r\n', encoding: 'utf-8' });
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(decodeSupportText(bom).text).toBe('C, *CIRCLE ; 원\r\n');
  });

  it('falls back to CP949 for Korean ANSI files', () => {
    // "; 원 선" in CP949: 원 = BF F8, 선 = BC B1.
    const cp949 = new Uint8Array([0x3b, 0x20, 0xbf, 0xf8, 0x20, 0xbc, 0xb1]);
    expect(decodeSupportText(cp949)).toEqual({ text: '; 원 선', encoding: 'cp949' });
  });
});
