import { expect, it } from 'vitest';
import { HeadlessCommandRunner } from './runner';
import { formatSysvarInput } from './sysvar-format';

it('stores ANGBASE/SNAPANG in radians while accepting user angle units and preserving numeric API values', async () => {
  const runner = new HeadlessCommandRunner();
  await runner.run('SETVAR', ['SNAPANG', '90']);
  expect(runner.sysvars.getNumber('SNAPANG')).toBeCloseTo(Math.PI / 2);
  await runner.run('SETVAR', ['ANGBASE', '30d']);
  expect(runner.sysvars.getNumber('ANGBASE')).toBeCloseTo(Math.PI / 6);
  await runner.run('SETVAR', ['AUNITS', 2]);
  await runner.run('SETVAR', ['SNAPANG', '100']);
  expect(runner.sysvars.getNumber('SNAPANG')).toBeCloseTo(Math.PI / 2);
  expect(formatSysvarInput('SNAPANG', Math.PI / 2, runner.sysvars)).toBe('100g');
  await runner.run('SETVAR', ['ANGBASE', 1.25]);
  expect(runner.sysvars.getNumber('ANGBASE')).toBe(1.25);
  expect((await runner.run('SETVAR', ['SNAPANG', 'nonsense'])).status).toBe('error');
});
