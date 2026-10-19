import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandRegistry, HeadlessCommandRunner } from '@hancad/commands';
import { DrawingDatabase } from '@hancad/db';
import { SystemVariables } from '@hancad/sysvars';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { draftCircle, draftLine } from '@hancad/draft';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { defaultMatchSettings, matchPropertyLabels } from './properties-match';
import type { MatchProperty, MatchSettings } from './properties-match';
import { endPropertyIsolation, registerPropertyCommands } from './properties-commands';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const database = new DrawingDatabase(),
    sysvars = new SystemVariables({ database });
  const registry = new CommandRegistry(),
    runner = new HeadlessCommandRunner({ registry, database, sysvars });
  const initial = createEmptyCadState();
  initial.entities = [
    {
      ...draftLine(initial.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'source'),
      aci: 1,
      lineweight: 50,
    },
    {
      ...draftCircle(initial.settings, { x: 20, y: 0 }, 5, 'destination'),
      aci: 3,
      lineweight: 100,
    },
    {
      ...draftLine(initial.settings, { x: 0, y: 20 }, { x: 10, y: 20 }, 'other'),
      aci: 4,
      lineweight: 25,
    },
  ];
  const key = 'HANCAD_TEST_PROPERTY_STATE';
  const commit = vi.fn((label: string, state: LegacyCadState) =>
    database.transaction(label, (tx) => tx.setVariable(key, JSON.stringify(state))),
  );
  const state = () => JSON.parse(String(database.getVariable(key))) as LegacyCadState;
  commit('SETUP', initial);
  database.clearHistory();
  let settings: MatchSettings = defaultMatchSettings;
  const begin = vi.fn();
  const host = {
    getState: vi.fn(() => {
      throw new Error('Native-capable property state should be used.');
    }),
    getPropertyState: state,
    commitState: vi.fn(),
    commitPropertyState: commit,
    selectedIds: [] as string[],
    clearSelection: vi.fn(),
  };
  registerPropertyCommands(registry, {
    host: () => host,
    begin,
    endIsolation: () => endPropertyIsolation(host),
    getSettings: () => settings,
    setSettings: (next) => {
      settings = next;
    },
  });
  return { database, sysvars, runner, initial, state, host, begin, getSettings: () => settings };
}
describe('queued property command registration', () => {
  it('executes MATCHPROP destination IDs with the real runner and one exact U/REDO transaction', async () => {
    const { runner, database, initial, state, host, begin } = fixture();
    expect((await runner.run('_MATCHPROP', ['source', 'destination', 'other', ''])).status).toBe(
      'ok',
    );
    expect(database.undoCount).toBe(1);
    expect(state().entities[1]).toMatchObject({ aci: 1, lineweight: 50, radius: 5 });
    expect(state().entities[2]).toMatchObject({ aci: 1, lineweight: 50, a: { x: 0, y: 20 } });
    const matched = state();
    await runner.run('U');
    expect(state()).toEqual(initial);
    await runner.run('REDO');
    expect(state()).toEqual(matched);
    expect(host.commitState).not.toHaveBeenCalled();
    expect(begin).not.toHaveBeenCalled();
  });
  it('shares Settings dialog answers and retains earlier target settings when later targets differ', async () => {
    const { runner, database, state, getSettings } = fixture();
    const settings = { ...defaultMatchSettings, color: false };
    const answers = (Object.keys(matchPropertyLabels) as MatchProperty[]).map(
      (key) => settings[key],
    );
    const result = await runner.run('MATCHPROP', [
      'source',
      'destination',
      'S',
      ...answers,
      'other',
      '',
    ]);
    expect(result.status).toBe('ok');
    expect(database.undoCount).toBe(1);
    expect(state().entities[1]).toMatchObject({ aci: 1, lineweight: 50 });
    expect(state().entities[2]).toMatchObject({ aci: 4, lineweight: 50 });
    expect(getSettings().color).toBe(false);
  });
  it('executes HIDE ALL, UNISOLATE and ISOLATE with exact undo and persistent mode', async () => {
    const { runner, database, sysvars, state, initial } = fixture();
    sysvars.set('OBJECTISOLATIONMODE', 1);
    database.clearHistory();
    expect((await runner.run('HIDEOBJECTS', ['ALL', ''])).status).toBe('ok');
    expect(database.undoCount).toBe(1);
    expect(state().objectIsolation).toEqual({
      hiddenIds: ['source', 'destination', 'other'],
      persistent: true,
    });
    const hidden = state();
    await runner.run('U');
    expect(state()).toEqual(initial);
    await runner.run('REDO');
    expect(state()).toEqual(hidden);
    expect((await runner.run('UNISOLATEOBJECTS')).status).toBe('ok');
    expect(database.undoCount).toBe(2);
    const visible = state();
    expect(visible.objectIsolation).toBeUndefined();
    await runner.run('U');
    expect(state()).toEqual(hidden);
    await runner.run('REDO');
    expect(state()).toEqual(visible);
    await runner.run('ISOLATEOBJECTS', ['destination', '']);
    expect(state().objectIsolation?.hiddenIds).toEqual(['source', 'other']);
    await runner.run('U');
    expect(state()).toEqual(visible);
  });
  it('retains accepted targets on queued Escape, and rejects invalid sources without edits', async () => {
    const { runner, database, initial, state } = fixture();
    expect((await runner.run('MATCHPROP', ['missing', 'ALL', ''])).status).toBe('error');
    expect(state()).toEqual(initial);
    expect(database.undoCount).toBe(0);
    expect((await runner.run('MATCHPROP', ['source', 'destination', '\u001b'])).status).toBe(
      'cancelled',
    );
    expect(state().entities[1]).toMatchObject({ aci: 1 });
    expect(state().entities[2]).toMatchObject({ aci: 4 });
    expect(database.undoCount).toBe(1);
    await runner.run('U');
    expect(state()).toEqual(initial);
  });
  it('preserves empty-queue interactive routing and applies shared selection eligibility to ALL', async () => {
    const { runner, database, state, host, begin } = fixture();
    await runner.run('MATCHPROP');
    await runner.run('HIDEOBJECTS');
    expect(begin.mock.calls.map(([command]) => command)).toEqual(['MATCHPROP', 'HIDEOBJECTS']);
    expect(database.undoCount).toBe(0);
    const next = state();
    next.layers.push({ name: 'Locked', color: '#ffffff', visible: true, locked: true });
    next.entities[2]!.layer = 'Locked';
    host.commitPropertyState('SETUP', next);
    database.clearHistory();
    await runner.run('MATCHPROP', ['source', '_ALL', '']);
    expect(state().entities[1]).toMatchObject({ aci: 1 });
    expect(state().entities[2]).toMatchObject({ aci: 4 });
    expect(database.undoCount).toBe(1);
  });
});
