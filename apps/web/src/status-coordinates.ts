import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CadPoint } from '@hancad/legacy-bridge';
import type { SystemVariables } from '@hancad/sysvars';
import type { Locale } from '@hancad/ui';
import { evaluateDiesel } from '@hancad/commands';
import { dieselHost } from './useMacroRunner';
import { statusPointStore } from './status-point-store';

export interface StatusPoint {
  x: number;
  y: number;
  z?: number;
}
export interface StatusCoordinates {
  cursor: StatusPoint;
  last: StatusPoint;
  base?: StatusPoint;
}
const origin: StatusPoint = { x: 0, y: 0, z: 0 };
const wcs = (point: CadPoint & { z?: number }): StatusPoint => ({
  x: point.x,
  y: -point.y,
  z: point.z ?? 0,
});

/** Actual accepted tool points are authoritative, including typed and snapped points. */
export function useStatusCoordinates(options: {
  sysvars: SystemVariables;
  basePoint?: CadPoint;
  pointPrompt: boolean;
}) {
  const [cursor, setCursor] = useState<StatusPoint>(origin);
  const store = statusPointStore(options.sysvars);
  const last = useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        store.listeners.add(listener);
        return () => store.listeners.delete(listener);
      },
      [store],
    ),
    () => store.last,
  );
  const pending = useRef<CadPoint | null>(null);
  const frame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const move = useCallback((point: CadPoint): void => {
    pending.current = point;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) setCursor(wcs(pending.current));
    });
  }, []);
  const base = options.pointPrompt && options.basePoint ? wcs(options.basePoint) : undefined;
  return {
    display: { cursor, last: wcs(last), ...(base ? { base } : {}) } satisfies StatusCoordinates,
    cursor: move,
  };
}

/** Coordinate formatting reads the same UNITS variables as command output. */
export function coordinateText(
  sysvars: SystemVariables,
  points: StatusCoordinates,
  locale: Locale = 'ko-KR',
): string {
  const mode = sysvars.getNumber('COORDS');
  if (mode === 3)
    return locale === 'ko-KR' ? '지리적 위치 없음' : 'Geographic location unavailable';
  const point = mode === 0 ? points.last : points.cursor;
  const host = dieselHost(sysvars);
  const linear = (value: number): string =>
    evaluateDiesel(
      `$(rtos,${value},${sysvars.getNumber('LUNITS')},${sysvars.getNumber('LUPREC')})`,
      host,
    );
  if (mode === 2 && points.base) {
    const dx = point.x - points.base.x;
    const dy = point.y - points.base.y;
    const radians = Math.atan2(dy, dx) - sysvars.getNumber('ANGBASE');
    const direction = sysvars.getNumber('ANGDIR') === 0 ? radians : -radians;
    const angle = evaluateDiesel(
      `$(angtos,${((direction % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)},${sysvars.getNumber('AUNITS')},${sysvars.getNumber('AUPREC')})`,
      host,
    );
    return `${linear(Math.hypot(dx, dy))}<${angle}`;
  }
  return `${linear(point.x)}, ${linear(point.y)}, ${linear(point.z ?? 0)}`;
}
