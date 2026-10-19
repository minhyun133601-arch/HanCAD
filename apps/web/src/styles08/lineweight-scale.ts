const key = 'hancad.lineweight-display-scale';
export function readLineweightDisplayScale(): number {
  try {
    const value = Number(localStorage.getItem(key));
    return value >= 0.1 && value <= 10 ? value : 1;
  } catch {
    return 1;
  }
}
export function writeLineweightDisplayScale(value: number): void {
  if (!Number.isFinite(value) || value < 0.1 || value > 10)
    throw new RangeError('Invalid display scale.');
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* Session still receives the display update. */
  }
  window.dispatchEvent(new CustomEvent('hancad-lineweight-scale-change', { detail: value }));
}
