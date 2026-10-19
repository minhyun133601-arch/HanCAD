import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestRuntime } from '../../../../packages/legacy-bridge/src/test-runtime';
import { walkLayerCli } from './layer-cli';
import { layerMetadata } from './layer-controller';
import {
  captureLayerState,
  exportLayerState,
  importLayerState,
  restoreLayerState,
} from './layer-states';
import { layerFilterMatches } from './layer-filters';
import { registerLayerCommands } from './register-layer-commands';
import { InputQueue } from '@hancad/editor';
import { fixture } from './layer-test-fixture';
beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
describe('CLI, filters and LAS', () => {
  it('restores only checked layer-state properties and round-trips the LAS restore mask', () => {
    const f = fixture(),
      saved = captureLayerState(f.state(), 'MASK');
    saved.properties = ['color', 'transparency'];
    const source = {
      ...f.state(),
      layers: f
        .state()
        .layers.map((layer) => ({ ...layer, aci: 2, transparency: 20, locked: true })),
    };
    const restored = restoreLayerState(source, saved);
    expect(restored.layers[1]).toMatchObject({ aci: 7, transparency: 0, locked: true });
    expect(importLayerState(exportLayerState(saved)).properties).toEqual(['color', 'transparency']);
  });
  it('keeps accepted -LAYER settings on Escape as one command and reuses the same parser headlessly', async () => {
    const f = fixture(),
      before = f.state();
    f.controller.begin('LAYER');
    f.controller.submit('M');
    f.controller.submit('ESC-TEST');
    f.controller.submit('C');
    f.controller.submit('3');
    f.controller.submit('');
    expect(f.host.database.undoCount).toBe(0);
    expect(f.controller.cli.state?.layers.find((layer) => layer.name === 'ESC-TEST')?.aci).toBe(3);
    f.controller.cancel();
    expect(f.host.database.undoCount).toBe(1);
    expect(f.state().settings.layer).toBe('ESC-TEST');
    f.host.database.undo();
    expect(f.state().layers).toEqual(before.layers);
    registerLayerCommands({
      host: () => f.host,
      begin: (name) => f.controller.begin(name),
      setOpen: () => {},
      setWalk: () => {},
      setPanelTab: () => {},
      close: () => {},
      openImport: () => {},
      exportState: () => {},
    });
    await f.host.registry.get('LAYER')?.execute?.({
      database: f.host.database,
      sysvars: f.host.sysvars,
      input: new InputQueue(['M', 'HEADLESS', 'C', '2', '', '']),
      locale: 'ko-KR',
      prefixes: { commandLine: true, builtin: false, global: false, transparent: false },
      print: f.host.print,
    });
    expect(f.state().layers.find((layer) => layer.name === 'HEADLESS')?.aci).toBe(2);
  });
  it('replays full -LAYER chain and rejects invalid values without losing earlier settings', () => {
    const f = fixture();
    const result = walkLayerCli(
      [
        'M',
        '설비',
        'C',
        '3',
        '',
        'L',
        'CONTINUOUS',
        '',
        'LW',
        '0.25',
        '',
        'TR',
        '35',
        '',
        'D',
        '배관 도면층',
        '',
        'LO',
        '치수',
        '',
      ],
      f.state(),
      layerMetadata(f.host),
      true,
    );
    expect(result.step).toBeUndefined();
    expect(result.state.settings.layer).toBe('설비');
    expect(result.state.layers.find((l) => l.name === '설비')).toMatchObject({
      aci: 3,
      lineweight: 25,
      transparency: 35,
      description: '배관 도면층',
    });
    expect(result.state.layers.find((l) => l.name === '치수')?.locked).toBe(true);
    const invalid = walkLayerCli(
      ['M', 'NEW', 'TR', '99', '20', 'NEW', ''],
      f.state(),
      layerMetadata(f.host),
      true,
    );
    expect(invalid.state.layers.find((l) => l.name === 'NEW')?.transparency).toBe(20);
  });
  it('keeps Korean names editable while keyword/value prompts use physical command input', () => {
    const f = fixture();
    expect(walkLayerCli(['M'], f.state(), layerMetadata(f.host), true).step?.text).toBe(true);
    expect(walkLayerCli(['C'], f.state(), layerMetadata(f.host), true).step?.text).toBeUndefined();
    expect(walkLayerCli(['TR', '30'], f.state(), layerMetadata(f.host), true).step?.text).toBe(
      true,
    );
  });
  it('preserves LAS states, color, transparency, flags, current layer and Korean description', () => {
    const f = fixture(),
      saved = captureLayerState(f.state(), '기본 도면층', '검토 전');
    saved.layers[1] = {
      ...saved.layers[1]!,
      frozen: true,
      locked: true,
      plot: false,
      newViewportFrozen: true,
      aci: 2,
      trueColor: 0x123456,
      transparency: 47,
      description: '기계실',
    };
    const parsed = importLayerState(exportLayerState(saved));
    expect(parsed).toMatchObject({ name: '기본 도면층', description: '검토 전', current: '0' });
    const { color: _color, ...properties } = saved.layers[1]!;
    expect(parsed.layers[1]).toMatchObject(properties);
    expect(parsed.layers[1]?.color).toBe('#123456');
    expect(() => importLayerState('not a LAS file')).toThrow();
  });
  it('evaluates property expression AND/OR, wildcard classes, numeric and group filters', () => {
    const layer = {
      name: 'A-WALL1',
      color: '#ffffff',
      visible: true,
      locked: false,
      aci: 1,
      lineweight: 25,
    };
    expect(
      layerFilterMatches(layer, {
        name: 'red',
        expression: 'name=A-* AND color=1 AND lineweight>=20',
      }),
    ).toBe(true);
    expect(
      layerFilterMatches(layer, { name: 'or', expression: 'locked=true OR name=A-WALL#' }),
    ).toBe(true);
    expect(layerFilterMatches(layer, { name: 'group', names: ['a-wall1'] })).toBe(true);
    expect(layerFilterMatches(layer, { name: 'bad', expression: 'color=2 AND name=*' })).toBe(
      false,
    );
  });
});
