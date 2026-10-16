import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyCadState, normalizeCadState } from '@hancad/legacy-bridge';
import { draftLine } from '@hancad/draft';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { creationSettings } from './creation-settings';
import { CreationStyleError } from './creation-style-error';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

it('snapshots live creation variables into entities that survive the legacy normalization boundary', () => {
  const vars = new SystemVariables();
  vars.set('CECOLOR', 'RGB:130,200,240');
  vars.set('CELWEIGHT', 53);
  vars.set('CELTSCALE', 4);
  vars.set('CETRANSPARENCY', 45);
  vars.set('PLINEGEN', 1);
  const settings = creationSettings(createEmptyCadState().settings, (name) => vars.get(name));
  const entity = draftLine(settings, { x: 0, y: 0 }, { x: 100, y: 0 });
  expect(normalizeCadState({ entities: [entity] }).entities[0]).toMatchObject({
    trueColor: 0x82c8f0,
    linetype: 'BYLAYER',
    lineweight: 53,
    linetypeScale: 4,
    transparency: 45,
    plinegen: true,
  });
  vars.set('CECOLOR', 'WHITE');
  vars.set('CETRANSPARENCY', -2);
  const white = creationSettings(settings, (name) => vars.get(name));
  expect(white).toMatchObject({ aci: 7, color: '#ffffff', transparency: 'byblock' });
  expect(white.trueColor).toBeUndefined();
  vars.set('CECOLOR', 'ByLayer');
  expect(creationSettings(white, (name) => vars.get(name)).aci).toBe(256);
  vars.dispose();
});

it('accepts decimal ACI, first-seven color names and all valid RGB channel boundaries', () => {
  const vars = new SystemVariables(),
    settings = createEmptyCadState().settings;
  for (const [value, expected] of [
    ['1', 1],
    ['255', 255],
    ['red', 1],
    ['Green', 3],
    ['WHITE', 7],
    ['ByBlock', 0],
    ['ByLayer', 256],
  ] as const) {
    vars.set('CECOLOR', value);
    expect(creationSettings(settings, (name) => vars.get(name)).aci).toBe(expected);
  }
  for (const [value, expected] of [
    ['rgb:000,000,000', 0],
    ['RGB:255,255,255', 0xffffff],
    ['RGB: 0, 255, 128', 0x00ff80],
  ] as const) {
    vars.set('CECOLOR', value);
    expect(creationSettings(settings, (name) => vars.get(name)).trueColor).toBe(expected);
  }
  vars.dispose();
});

it('reports malformed and unsupported CECOLOR values as typed errors without changing settings', () => {
  const vars = new SystemVariables(),
    settings = createEmptyCadState().settings,
    before = structuredClone(settings);
  for (const [value, code] of [
    ['RGB:256,0,0', 'invalid-rgb'],
    ['RGB:-1,0,0', 'invalid-rgb'],
    ['RGB:1.5,0,0', 'invalid-rgb'],
    ['RGB:1,2', 'invalid-rgb'],
    ['0', 'invalid-color'],
    ['256', 'invalid-color'],
    ['1e2', 'invalid-color'],
    ['0x10', 'invalid-color'],
    ['not a color', 'invalid-color'],
    ['HSL:120,100,50', 'unsupported-hsl'],
    ['DIC COLOR GUIDE(R)$DIC 43', 'unsupported-color-book'],
  ] as const) {
    vars.set('CECOLOR', value);
    let captured: unknown;
    try {
      creationSettings(settings, (name) => vars.get(name));
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(CreationStyleError);
    expect(captured).toMatchObject({ code });
    expect(settings).toEqual(before);
  }
  vars.dispose();
});
