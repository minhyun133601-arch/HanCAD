const initial = [
  'r',
  'R',
  's',
  'e',
  'E',
  'f',
  'a',
  'q',
  'Q',
  't',
  'T',
  'd',
  'w',
  'W',
  'c',
  'z',
  'x',
  'v',
  'g',
] as const;
const vowel = [
  'k',
  'o',
  'i',
  'O',
  'j',
  'p',
  'u',
  'P',
  'h',
  'hk',
  'ho',
  'hl',
  'y',
  'n',
  'nj',
  'np',
  'nl',
  'b',
  'm',
  'ml',
  'l',
] as const;
const final = [
  '',
  'r',
  'R',
  'rt',
  's',
  'sw',
  'sg',
  'e',
  'f',
  'fr',
  'fa',
  'fq',
  'ft',
  'fx',
  'fv',
  'fg',
  'a',
  'q',
  'qt',
  't',
  'T',
  'd',
  'w',
  'c',
  'z',
  'x',
  'v',
  'g',
] as const;
const consonants = [
  'ㄱ',
  'ㄲ',
  'ㄳ',
  'ㄴ',
  'ㄵ',
  'ㄶ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㄺ',
  'ㄻ',
  'ㄼ',
  'ㄽ',
  'ㄾ',
  'ㄿ',
  'ㅀ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅄ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
];
const consonantKeys = [
  'r',
  'R',
  'rt',
  's',
  'sw',
  'sg',
  'e',
  'E',
  'f',
  'fr',
  'fa',
  'fq',
  'ft',
  'fx',
  'fv',
  'fg',
  'a',
  'q',
  'Q',
  'qt',
  't',
  'T',
  'd',
  'w',
  'W',
  'c',
  'z',
  'x',
  'v',
  'g',
];
const vowels = [
  'ㅏ',
  'ㅐ',
  'ㅑ',
  'ㅒ',
  'ㅓ',
  'ㅔ',
  'ㅕ',
  'ㅖ',
  'ㅗ',
  'ㅘ',
  'ㅙ',
  'ㅚ',
  'ㅛ',
  'ㅜ',
  'ㅝ',
  'ㅞ',
  'ㅟ',
  'ㅠ',
  'ㅡ',
  'ㅢ',
  'ㅣ',
];
const reverseJamo = new Map<string, string>();
consonants.forEach((character, index) => {
  const key = consonantKeys[index];
  if (key !== undefined) reverseJamo.set(character, key);
});
vowels.forEach((character, index) => {
  const key = vowel[index];
  if (key !== undefined) reverseJamo.set(character, key);
});
initial.forEach((key, index) => reverseJamo.set(String.fromCodePoint(0x1100 + index), key));
vowel.forEach((key, index) => reverseJamo.set(String.fromCodePoint(0x1161 + index), key));
final.forEach((key, index) => {
  if (index > 0) reverseJamo.set(String.fromCodePoint(0x11a7 + index), key);
});

/** Case-preserving Dubeolsik key sequence; shifted jamo retain uppercase keys. */
export function reverseDubeolsik(value: string): string {
  let result = '';
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && code >= 0xac00 && code <= 0xd7a3) {
      const syllable = code - 0xac00;
      result +=
        (initial[Math.floor(syllable / 588)] ?? '') +
        (vowel[Math.floor(syllable / 28) % 21] ?? '') +
        (final[syllable % 28] ?? '');
    } else result += reverseJamo.get(character) ?? character;
  }
  return result;
}

/** Commands are case-insensitive; text prompts must never call this converter. */
export function reverseHangulInput(value: string): string {
  return reverseDubeolsik(value).toUpperCase();
}
