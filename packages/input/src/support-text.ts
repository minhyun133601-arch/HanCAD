export type SupportTextEncoding = 'utf-8' | 'cp949';

/**
 * Decodes a user support file (.pgp, .scr, .lsp, .lin, .pat, .dcl, .csv): UTF-8 with
 * or without a BOM, otherwise CP949 (Korean Windows ANSI), detected automatically.
 */
export function decodeSupportText(bytes: Uint8Array): {
  text: string;
  encoding: SupportTextEncoding;
} {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (bom) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    // WHATWG "euc-kr" is Microsoft's code page 949 (Unified Hangul Code).
    return { text: new TextDecoder('euc-kr').decode(bytes), encoding: 'cp949' };
  }
}
