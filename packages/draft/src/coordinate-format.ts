import type { CoordinateSettings } from './coordinate-units';
import { defaultCoordinateSettings } from './coordinate-units';

const precision = (value: number): number => Math.max(0, Math.min(8, Math.trunc(value)));
const fixed = (value: number, digits: number): string => {
  const text = value.toFixed(precision(digits));
  return /^-0(?:\.0*)?$/.test(text) ? text.slice(1) : text;
};
function fraction(value: number, digits: number): string {
  let denominator = 2 ** precision(digits),
    numerator = Math.round(value * denominator);
  const whole = Math.floor(numerator / denominator);
  numerator %= denominator;
  if (!numerator) return String(whole);
  while (numerator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }
  return `${whole ? `${whole} ` : ''}${numerator}/${denominator}`;
}
export function formatDraftNumber(
  value: number,
  settings: Partial<CoordinateSettings> = {},
): string {
  const { lunits, luprec } = { ...defaultCoordinateSettings, ...settings };
  const sign = value < 0 ? '-' : '',
    absolute = Math.abs(value);
  if (lunits === 1) {
    const [mantissa, exponent] = absolute.toExponential(precision(luprec)).split('e');
    const power = Number(exponent);
    return `${sign}${mantissa}E${power < 0 ? '-' : '+'}${String(Math.abs(power)).padStart(2, '0')}`;
  }
  if (lunits === 5) return sign + fraction(absolute, luprec);
  if (lunits === 3 || lunits === 4) {
    const step = lunits === 4 ? 2 ** -precision(luprec) : 10 ** -precision(luprec);
    const total = Math.round(absolute / step) * step,
      feet = Math.floor(total / 12);
    const inches = total - feet * 12;
    return `${sign}${feet}'-${lunits === 4 ? fraction(inches, luprec) : fixed(inches, luprec)}"`;
  }
  return fixed(value, luprec);
}
function dms(degrees: number, digits: number): string {
  const decimals = Math.max(0, digits - 4);
  const step = digits <= 0 ? 3600 : digits <= 2 ? 60 : 10 ** -decimals;
  const total = Math.round((degrees * 3600) / step) * step;
  const whole = Math.floor(total / 3600),
    minutes = Math.floor(total / 60) % 60;
  if (digits <= 0) return `${whole}d`;
  if (digits <= 2) return `${whole}d${minutes}'`;
  return `${whole}d${minutes}'${fixed(total % 60, decimals)}"`;
}
export function formatDraftAngle(
  radians: number,
  settings: Partial<CoordinateSettings> = {},
): string {
  const { aunits, auprec, angbase, angdir } = { ...defaultCoordinateSettings, ...settings };
  const tau = Math.PI * 2;
  if (aunits === 4) {
    const degrees = ((((radians * 180) / Math.PI) % 360) + 360) % 360;
    if (Math.abs(degrees) < 1e-10) return 'E';
    if (Math.abs(degrees - 90) < 1e-10) return 'N';
    if (Math.abs(degrees - 180) < 1e-10) return 'W';
    if (Math.abs(degrees - 270) < 1e-10) return 'S';
    const north = degrees < 180,
      east = degrees < 90 || degrees > 270;
    return `${north ? 'N' : 'S'} ${dms(Math.abs((north ? 90 : 270) - degrees), auprec)} ${east ? 'E' : 'W'}`;
  }
  const angle = ((((radians - angbase) * (angdir ? -1 : 1)) % tau) + tau) % tau;
  if (aunits === 1) return dms((angle * 180) / Math.PI, auprec);
  if (aunits === 2) return `${fixed((angle * 200) / Math.PI, auprec)}g`;
  if (aunits === 3) return `${fixed(angle, auprec)}r`;
  return fixed((angle * 180) / Math.PI, auprec);
}
