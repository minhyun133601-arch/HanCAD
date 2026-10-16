import { expect, it } from 'vitest';
import { SystemVariables } from '@hancad/sysvars';
import { recordStatusPoint, statusPointStore } from './status-point-store';

it('isolates accepted points per document and publishes copied points only when changed', () => {
  const first = new SystemVariables();
  const second = new SystemVariables();
  const point = { x: 10, y: -20 };
  let notices = 0;
  statusPointStore(first).listeners.add(() => notices++);
  recordStatusPoint(first, point);
  point.x = 90;
  expect(statusPointStore(first).last).toEqual({ x: 10, y: -20, z: 0 });
  expect(first.get('LASTPOINT')).toEqual([10, 20, 0]);
  expect(statusPointStore(second).last).toEqual({ x: 0, y: 0, z: 0 });
  recordStatusPoint(first, { x: 10, y: -20 });
  expect(notices).toBe(1);
  first.set('LASTPOINT', [30, 40, 50]);
  expect(statusPointStore(first).last).toEqual({ x: 30, y: -40, z: 50 });
});
