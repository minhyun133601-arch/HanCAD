import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeadlessCommandRunner } from '@hancad/commands';
import { createTestRuntime } from '../../../../packages/legacy-bridge/src/test-runtime';
import { fixture } from './layer-test-fixture';
import { registerLayerCommands } from './register-layer-commands';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function scenario() {
  const f = fixture();
  registerLayerCommands({
    host: () => f.host,
    begin: (name) => f.controller.begin(name),
    setPanelTab: () => {},
    setWalk: () => {},
    setOpen: () => {},
    close: () => {},
    openImport: () => {},
    exportState: () => {},
  });
  const runner = new HeadlessCommandRunner({
    registry: f.host.registry,
    sysvars: f.host.sysvars,
    database: f.host.database,
  });
  return { ...f, runner };
}
describe('queued layer commands through HeadlessCommandRunner', () => {
  it('LAYISO/LAYUNISO use the same state machine and each journal exactly one command', async () => {
    const f = scenario(),
      before = f.state().layers;
    expect(await f.runner.run('LAYISO', ['line', ''])).toMatchObject({ status: 'ok' });
    expect(f.controller.snapshot).toBeNull();
    expect(f.host.database.undoCount).toBe(1);
    expect(f.state().layers.find((layer) => layer.name === '치수')?.locked).toBe(true);
    const isolated = f.state().layers;
    expect(await f.runner.run('LAYUNISO')).toMatchObject({ status: 'ok' });
    expect(f.host.database.undoCount).toBe(2);
    expect(f.state().layers.map((layer) => ({ ...layer, nativeHandle: undefined }))).toEqual(
      before.map((layer) => ({ ...layer, nativeHandle: undefined })),
    );
    f.host.database.undo();
    expect(f.state().layers).toEqual(isolated);
    f.host.database.undo();
    expect(f.state().layers).toEqual(before);
  });
  it('COPYTOLAYER consumes independent source/target IDs and exact WCS point tuples', async () => {
    const f = scenario(),
      before = f.state().entities;
    expect(
      await f.runner.run('COPYTOLAYER', ['line', '', 'circle', '', [5, 10, 2], [25, 40, 7]]),
    ).toMatchObject({ status: 'ok' });
    expect(f.host.database.undoCount).toBe(1);
    expect(f.state().entities).toHaveLength(3);
    expect(f.state().entities.at(-1)).toMatchObject({
      type: 'line',
      layer: '치수',
      a: { x: 20, y: -30, z: 5 },
      b: { x: 30, y: -30, z: 5 },
    });
    f.host.database.undo();
    expect(f.state().entities).toEqual(before);
    f.host.database.redo();
    expect(f.state().entities).toHaveLength(3);
  });
  it('SETBYLAYER applies ALL selection and shared answers in one Undo group', async () => {
    const f = scenario(),
      setup = f.state();
    setup.entities = setup.entities.map((entity) => ({
      ...entity,
      aci: 1,
      trueColor: 0x123456,
      linetype: 'HIDDEN',
      lineweight: 50,
      transparency: 35,
    }));
    f.host.commitState('SETUP', setup);
    f.host.database.clearHistory();
    const before = f.state().entities;
    expect(await f.runner.run('SETBYLAYER', ['ALL', '', true, false])).toMatchObject({
      status: 'ok',
    });
    expect(f.host.database.undoCount).toBe(1);
    for (const entity of f.state().entities) {
      expect(entity).toMatchObject({
        aci: 256,
        linetype: 'BYLAYER',
        lineweight: -1,
        transparency: 'bylayer',
      });
      expect(entity.trueColor).toBeUndefined();
    }
    f.host.database.undo();
    expect(f.state().entities).toEqual(before);
  });
  it('retains PICKFIRST source selection while consuming the queued destination and points', async () => {
    const f = scenario();
    f.select(['line']);
    expect(await f.runner.run('COPYTOLAYER', ['circle', '', [0, 0], [10, 20]])).toMatchObject({
      status: 'ok',
    });
    expect(f.state().entities.at(-1)).toMatchObject({
      type: 'line',
      layer: '치수',
      a: { x: 10, y: -20 },
      b: { x: 20, y: -20 },
    });
    expect(f.host.database.undoCount).toBe(1);
  });
  it('LAYCUR resolves queued IDs instead of leaving an inactive application controller', async () => {
    const f = scenario(),
      before = f.state().entities;
    expect(await f.runner.run('LAYCUR', ['ALL', ''])).toMatchObject({ status: 'ok' });
    expect(f.state().entities.every((entity) => entity.layer === '0')).toBe(true);
    expect(f.host.database.undoCount).toBe(1);
    expect(f.controller.snapshot).toBeNull();
    f.host.database.undo();
    expect(f.state().entities).toEqual(before);
  });
  it.each([
    ['LAYISO', ['line']],
    ['LAYISO', ['S', 'O']],
    ['COPYTOLAYER', ['line', '', 'circle', '', [0, 0]]],
    ['SETBYLAYER', ['ALL', '', 'Y']],
    ['LAYISO', ['line', '\u001b']],
  ] as const)(
    'cancels incomplete or escaped %s queues with zero drawing/profile mutations',
    async (command, inputs) => {
      const f = scenario(),
        before = f.host.database.serialize(),
        profile = JSON.stringify([...f.host.sysvars.profile.values]);
      expect(await f.runner.run(command, inputs)).toMatchObject({ status: 'cancelled' });
      expect(f.host.database.serialize()).toBe(before);
      expect(f.host.database.undoCount).toBe(0);
      expect(JSON.stringify([...f.host.sysvars.profile.values])).toBe(profile);
      expect(f.controller.snapshot).toBeNull();
    },
  );
  it('rejects an unknown selection ID and leftover inputs without publishing a partial change', async () => {
    const f = scenario(),
      before = f.host.database.serialize();
    expect(await f.runner.run('LAYCUR', ['missing', ''])).toMatchObject({ status: 'error' });
    expect(await f.runner.run('LAYCUR', ['ALL', '', 'extra'])).toMatchObject({ status: 'error' });
    expect(f.host.database.serialize()).toBe(before);
    expect(f.host.database.undoCount).toBe(0);
  });
  it('cancels an unfinished queued -LAYER sequence before publishing accepted intermediate settings', async () => {
    const f = scenario(),
      before = f.host.database.serialize();
    expect(await f.runner.run('-LAYER', ['M', 'UNFINISHED'])).toMatchObject({
      status: 'cancelled',
    });
    expect(f.host.database.serialize()).toBe(before);
    expect(f.host.database.undoCount).toBe(0);
  });
});
