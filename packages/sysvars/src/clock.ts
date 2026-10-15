/** Day number of 1970-01-01 in AutoCAD's Julian form (day boundaries at midnight). */
export const unixEpochJulianDay = 2440588;
const millisecondsPerDay = 86_400_000;

function wholeSeconds(date: Date): number {
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new RangeError('Invalid clock time.');
  return Math.floor(time / 1000) * 1000;
}

/**
 * Local calendar date as AutoCAD's Julian real (DATE/TDCREATE/TDUPDATE): the day
 * number plus the fraction of the local day. 1998-01-01 12:00 local is 2450815.5.
 * Subsecond time is discarded.
 */
export function localJulianDate(date: Date): number {
  const local = new Date(wholeSeconds(date));
  const midnightUtc = Date.UTC(local.getFullYear(), local.getMonth(), local.getDate());
  const seconds = local.getHours() * 3600 + local.getMinutes() * 60 + local.getSeconds();
  return unixEpochJulianDay + midnightUtc / millisecondsPerDay + seconds / 86_400;
}

/** Universal-time Julian real (TDUCREATE/TDUUPDATE). */
export function universalJulianDate(date: Date): number {
  return unixEpochJulianDay + wholeSeconds(date) / millisecondsPerDay;
}

/** CDATE: local time encoded as YYYYMMDD.HHMMSS, subsecond time discarded. */
export function calendarDate(date: Date): number {
  const local = new Date(wholeSeconds(date));
  const day = local.getFullYear() * 10_000 + (local.getMonth() + 1) * 100 + local.getDate();
  const time = local.getHours() * 10_000 + local.getMinutes() * 100 + local.getSeconds();
  return Number(`${day}.${String(time).padStart(6, '0')}`);
}

/** TDINDWG/TDUSRTIMER durations are stored as fractional days. */
export function elapsedDays(fromMilliseconds: number, toMilliseconds: number): number {
  return Math.max(0, Math.floor((toMilliseconds - fromMilliseconds) / 1000)) / 86_400;
}
