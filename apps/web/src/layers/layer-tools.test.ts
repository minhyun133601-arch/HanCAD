import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRuntime } from '../../../../packages/legacy-bridge/src/test-runtime';
import {
  createLayers,
  changeLayerField,
  deleteLayers,
  renameLayer,
  setCurrentLayer,
} from './layer-model';
import { captureLayerState, restorePreviousLayers } from './layer-states';
import { commitLayerChange, layerMetadata } from './layer-controller';
import { layerStateWithNative } from './layer-records';
beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
import { fixture } from './layer-test-fixture';
describe('layer editing and command integration', () => {
  it('keeps on/off and freeze independent and rejects freezing current or setting frozen current', () => {
    const { state } = fixture();
    const frozen = changeLayerField(state(), '벽체', 'frozen', true);
    expect(frozen.layers.find((layer) => layer.name === '벽체')).toMatchObject({
      visible: true,
      frozen: true,
    });
    expect(() => setCurrentLayer(frozen, '벽체')).toThrow();
    expect(() => changeLayerField(state(), state().settings.layer, 'frozen', true)).toThrow();
  });
  it('protects 0/Defpoints/current/used layers, retains Defpoints no-plot, and renames all references', () => {
    const { state } = fixture();
    const def = createLayers(state(), 'Defpoints');
    expect(def.layers.find((layer) => layer.name === 'Defpoints')?.plot).toBe(false);
    expect(
      changeLayerField(def, 'Defpoints', 'plot', true).layers.find(
        (layer) => layer.name === 'Defpoints',
      )?.plot,
    ).toBe(false);
    for (const name of ['0', 'Defpoints', '벽체'])
      expect(() => deleteLayers(def, [name])).toThrow();
    expect(() => renameLayer(def, '0', 'zero')).toThrow();
    const renamed = renameLayer(def, '벽체', 'WALLS');
    expect(renamed.entities[0]?.layer).toBe('WALLS');
    expect(state().entities[0]?.layer).toBe('벽체');
  });
  it.each(['off', 'lock'] as const)(
    'LAYISO %s and LAYUNISO restore every prior property byte for byte with one undo per command',
    (mode) => {
      const f = fixture();
      const meta = layerMetadata(f.host);
      meta.isolateMode = mode;
      commitLayerChange(f.host, 'SETTINGS', f.state(), meta, false);
      f.host.database.clearHistory();
      const before = JSON.stringify(layerStateWithNative(f.host.database, f.state()).layers);
      f.select(['line']);
      f.controller.begin('LAYISO');
      expect(f.host.database.undoCount).toBe(1);
      expect(f.state().layers.find((layer) => layer.name === '치수')).toMatchObject(
        mode === 'off' ? { visible: false } : { locked: true },
      );
      f.controller.begin('LAYUNISO');
      expect(JSON.stringify(f.state().layers)).toBe(before);
      expect(f.host.database.undoCount).toBe(2);
      f.host.database.undo();
      expect(f.state().layers.find((layer) => layer.name === '치수')).toMatchObject(
        mode === 'off' ? { visible: false } : { locked: true },
      );
    },
  );
  it('LAYOFF/LAYON/LAYFRZ/LAYTHW/LAYLCK/LAYULK select correct layers and preserve other flags', () => {
    const f = fixture();
    f.select(['line']);
    f.controller.begin('LAYOFF');
    expect(f.state().layers.find((l) => l.name === '벽체')?.visible).toBe(false);
    f.controller.begin('LAYON');
    expect(f.state().layers.every((l) => l.visible)).toBe(true);
    f.controller.begin('LAYFRZ');
    expect(f.state().layers.find((l) => l.name === '벽체')?.frozen).toBe(true);
    f.controller.begin('LAYTHW');
    expect(f.state().layers.every((l) => !l.frozen)).toBe(true);
    f.controller.begin('LAYLCK');
    expect(f.state().layers.find((l) => l.name === '벽체')?.locked).toBe(true);
    f.select(['circle']);
    f.controller.begin('LAYLCK');
    f.select(['line']);
    f.controller.begin('LAYULK');
    expect(f.state().layers.find((l) => l.name === '벽체')?.locked).toBe(false);
    expect(f.state().layers.find((l) => l.name === '치수')?.locked).toBe(true);
  });
  it('LAYMCUR and LAYCUR journal CLAYER with affected legacy/native layers', () => {
    const f = fixture();
    f.select(['line']);
    f.controller.begin('LAYMCUR');
    expect(f.state().settings.layer).toBe('벽체');
    expect(f.host.sysvars.get('CLAYER')).toBe('벽체');
    f.select(['circle']);
    f.controller.begin('LAYCUR');
    expect(f.state().entities[1]?.layer).toBe('벽체');
    f.host.database.undo();
    expect(f.state().entities[1]?.layer).toBe('치수');
    f.host.database.undo();
    expect(f.host.sysvars.get('CLAYER')).toBe('0');
  });
  it('LAYMCH, COPYTOLAYER and LAYMRG keep target selections separate and preserve atomic Undo', () => {
    const f = fixture();
    f.select(['line']);
    f.controller.begin('LAYMCH');
    f.select(['circle']);
    f.controller.submit('');
    expect(f.state().entities[0]?.layer).toBe('치수');
    f.host.database.undo();
    f.select(['line']);
    f.controller.begin('COPYTOLAYER');
    expect(f.host.getSelectedIds()).toEqual([]);
    f.select(['circle']);
    f.controller.submit('');
    f.controller.submit('D');
    f.controller.submit('10,20');
    expect(f.state().entities.at(-1)).toMatchObject({
      layer: '치수',
      a: { x: 10, y: -20 },
      b: { x: 20, y: -20 },
    });
    expect(f.state().entities).toHaveLength(3);
    f.host.database.undo();
    expect(f.state().entities).toHaveLength(2);
    f.select(['line']);
    f.controller.begin('LAYMRG');
    f.select(['circle']);
    f.controller.submit('');
    f.controller.submit('Y');
    expect(f.state().entities[0]?.layer).toBe('치수');
    expect(f.state().layers.some((l) => l.name === '벽체')).toBe(false);
    f.host.database.undo();
    expect(f.state().layers.some((l) => l.name === '벽체')).toBe(true);
  });
  it('LAYDEL requires explicit confirmation, erases entire layer, and restores with U', () => {
    const f = fixture();
    f.select(['line']);
    f.controller.begin('LAYDEL');
    f.controller.submit('');
    expect(f.state().entities).toHaveLength(2);
    f.controller.begin('LAYDEL');
    f.controller.submit('Y');
    expect(f.state().entities).toHaveLength(1);
    expect(f.host.database.find('LAYER', '벽체')).toBeUndefined();
    f.host.database.undo();
    expect(f.state().entities).toHaveLength(2);
  });
  it('COPYTOLAYER base and second mouse points use the shared point-acquisition path', () => {
    const f = fixture();
    f.select(['line']);
    f.controller.begin('COPYTOLAYER');
    f.select(['circle']);
    f.controller.submit('');
    expect(f.controller.copy.pick({ x: 5, y: -10 })).toBe(true);
    f.controller.copy.cursor({ x: 25, y: -40 });
    expect(f.controller.snapshot?.preview?.[0]).toMatchObject({
      a: { x: 20, y: -30 },
      layer: '치수',
    });
    expect(f.controller.copy.pick({ x: 25, y: -40 })).toBe(true);
    expect(f.state().entities.at(-1)).toMatchObject({
      a: { x: 20, y: -30 },
      b: { x: 30, y: -30 },
      layer: '치수',
    });
  });
  it('SETBYLAYER masks properties and honors ByBlock and include-block answers', () => {
    const f = fixture();
    const state = f.state();
    state.entities[0] = {
      ...state.entities[0]!,
      aci: 0,
      trueColor: 0xff0000,
      linetype: 'DASHED',
      lineweight: 50,
      transparency: 40,
    };
    f.host.commitState('SETUP', state);
    f.host.sysvars.set('SETBYLAYERMODE', 1 | 128);
    f.select(['line']);
    f.controller.begin('SETBYLAYER');
    f.controller.submit('N');
    f.controller.submit('N');
    expect(f.state().entities[0]).toMatchObject({
      aci: 0,
      linetype: 'DASHED',
      lineweight: 50,
      transparency: 'bylayer',
    });
    f.controller.begin('SETBYLAYER');
    f.controller.submit('Y');
    f.controller.submit('Y');
    expect(f.state().entities[0]?.aci).toBe(256);
    expect(f.state().entities[0]?.trueColor).toBeUndefined();
  });
  it('LAYERP restores properties but retains new/deleted/renamed layer names', () => {
    const f = fixture();
    const saved = captureLayerState(layerStateWithNative(f.host.database, f.state()));
    let changed = renameLayer(layerStateWithNative(f.host.database, f.state()), '벽체', 'WALLS');
    changed = createLayers(changed, 'ADDED');
    changed = changeLayerField(changed, 'WALLS', 'locked', true);
    const restored = restorePreviousLayers(changed, saved);
    expect(restored.layers.find((l) => l.name === 'WALLS')?.locked).toBe(false);
    expect(restored.layers.some((l) => l.name === 'ADDED')).toBe(true);
    expect(restored.layers.some((l) => l.name === '벽체')).toBe(false);
  });
});
