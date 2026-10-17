export interface CoordinateSettings {
  lunits: number;
  luprec: number;
  aunits: number;
  auprec: number;
  /** Angles in the database are radians; POLARANG is separately stored in degrees. */
  angbase: number;
  angdir: number;
  elevation: number;
  osnapcoord: number;
}
export const defaultCoordinateSettings: Readonly<CoordinateSettings> = {
  lunits: 2,
  luprec: 4,
  aunits: 0,
  auprec: 0,
  angbase: 0,
  angdir: 0,
  elevation: 0,
  osnapcoord: 2,
};
export function coordinateSettings(get: (name: string) => unknown): CoordinateSettings {
  const result = { ...defaultCoordinateSettings };
  for (const key of Object.keys(result) as (keyof CoordinateSettings)[]) {
    const value = get(key.toUpperCase());
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
  }
  return result;
}
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const finite = (value: number): number | undefined =>
  Number.isFinite(value) && Math.abs(value) <= 1e12 ? value : undefined;

function unsignedLength(value: string): number | undefined {
  if (numeric.test(value)) return finite(Number(value));
  const mixed = /^(?:(\d+)[ -]+)?(\d+)\s*\/\s*(\d+)$/.exec(value);
  if (mixed) {
    const denominator = Number(mixed[3]);
    return denominator > 0
      ? finite(Number(mixed[1] ?? 0) + Number(mixed[2]) / denominator)
      : undefined;
  }
  return undefined;
}

/** Input notation is independent of the display precision and never rounds geometry. */
export function parseDraftNumber(
  input: string,
  _settings: Partial<CoordinateSettings> = {},
): number | undefined {
  let value = input.trim();
  if (numeric.test(value)) return finite(Number(value));
  const sign = value.startsWith('-') ? -1 : 1;
  value = value.replace(/^[+-]/, '').trim();
  const feet = /^(\d+(?:\.\d*)?)'\s*-?\s*(.*?)"?$/.exec(value);
  if (feet) {
    const inchText = (feet[2] ?? '').replace(/"$/, '').trim();
    const inches = inchText ? unsignedLength(inchText) : 0;
    return inches === undefined ? undefined : finite(sign * (Number(feet[1]) * 12 + inches));
  }
  const result = unsignedLength(value.replace(/"$/, '').trim());
  return result === undefined ? undefined : finite(sign * result);
}

function plainAngle(input: string, mode: number): number | undefined {
  const value = input.trim();
  const dms =
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))[d°](?:(\d+(?:\.\d*)?)')?(?:(\d+(?:\.\d*)?)")?$/i.exec(value);
  if (dms) {
    const minutes = Number(dms[2] ?? 0),
      seconds = Number(dms[3] ?? 0);
    if (minutes >= 60 || seconds >= 60) return undefined;
    return (
      ((Math.sign(Number(dms[1])) || (dms[1]?.startsWith('-') ? -1 : 1)) *
        (Math.abs(Number(dms[1])) + minutes / 60 + seconds / 3600) *
        Math.PI) /
      180
    );
  }
  const suffix = /^(.+?)([dgr])$/i.exec(value);
  const number = suffix ? Number(suffix[1]) : Number(value);
  if (!numeric.test(suffix?.[1] ?? value) || !Number.isFinite(number)) return undefined;
  const unit = suffix?.[2]?.toLowerCase();
  return (
    number *
    (unit === 'r' || (!unit && mode === 3)
      ? 1
      : unit === 'g' || (!unit && mode === 2)
        ? Math.PI / 200
        : Math.PI / 180)
  );
}

/** Parses a heading in WCS radians. Explicit surveyor bearings use compass axes. */
export function parseDraftAngle(
  input: string,
  settings: Partial<CoordinateSettings> = {},
): number | undefined {
  const value = input.trim().toUpperCase();
  const cardinal = { E: 0, N: Math.PI / 2, W: Math.PI, S: Math.PI * 1.5 };
  if (value in cardinal) return cardinal[value as keyof typeof cardinal];
  const bearing = /^([NS])\s*(.+?)\s*([EW])$/.exec(value);
  if (bearing) {
    const angle = plainAngle(bearing[2] ?? '', 0);
    if (angle === undefined || angle < 0 || angle > Math.PI / 2 + 1e-12) return undefined;
    return bearing[1] === 'N'
      ? Math.PI / 2 + (bearing[3] === 'W' ? angle : -angle)
      : Math.PI * 1.5 + (bearing[3] === 'E' ? angle : -angle);
  }
  const angle = plainAngle(value, settings.aunits ?? 0);
  return angle === undefined
    ? undefined
    : (settings.angbase ?? 0) + (settings.angdir === 1 ? -angle : angle);
}
