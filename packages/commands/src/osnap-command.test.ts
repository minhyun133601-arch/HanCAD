import { expect, it } from 'vitest';
import { HeadlessCommandRunner } from './runner';

it('sets every running snap through the headless -OSNAP command and preserves saved modes on Off', async () => {
  const runner = new HeadlessCommandRunner();
  expect(
    (await runner.run('-OSNAP END,MID,CEN,GCE,NOD,QUA,INT,EXT,INS,PER,TAN,NEA,APP,PAR')).status,
  ).toBe('ok');
  expect(runner.sysvars.getNumber('OSMODE')).toBe(16383);
  await runner.run('-OSNAP OFF');
  expect(runner.sysvars.getNumber('OSMODE')).toBe(32767);
  await runner.run('-OSNAP ENDPOINT,_MIDPOINT');
  expect(runner.sysvars.getNumber('OSMODE')).toBe(3);
  await runner.run('-OSNAP NONE');
  expect(runner.sysvars.getNumber('OSMODE')).toBe(0);
});

it('repeats the mode-list prompt after invalid input without changing the saved modes', async () => {
  const runner = new HeadlessCommandRunner();
  const command = runner.registry.get('OSNAP');
  const state = {
    database: runner.database,
    sysvars: runner.sysvars,
    locale: 'ko-KR' as const,
    prefixes: { global: false, builtin: false, commandLine: true, transparent: false },
  };
  expect(command?.nextPrompt?.(['END,INVALID'], state)?.notice).toBe(
    '유효하지 않은 객체 스냅 모드입니다.',
  );
  const original = runner.sysvars.getNumber('OSMODE');
  await runner.run('-OSNAP END,INVALID');
  expect(runner.sysvars.getNumber('OSMODE')).toBe(original);
  expect(command?.nextPrompt?.([''], state)).toBeUndefined();
});
