import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import { SystemVariables } from '@hancad/sysvars';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { applyCurrentProperty, currentPropertyFields } from './properties-current';
import { creationSettings } from './creation-settings';
import { syncLayerRecords } from './layers/layer-records';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
describe('Properties with no object selection', () => {
  it('converts UI inheritance/True Color values to canonical creation variables', () => {
    const variables = new SystemVariables(),
      state = createEmptyCadState();
    expect(
      currentPropertyFields(variables, state).find((field) => field.key === 'transparency')?.value,
    ).toBe('bylayer');
    applyCurrentProperty(variables, state, 'transparency', 'ByBlock');
    expect(variables.get('CETRANSPARENCY')).toBe(-2);
    applyCurrentProperty(variables, state, 'color', '#40a0ff');
    expect(variables.get('CECOLOR')).toBe('RGB:64,160,255');
    expect(creationSettings(state.settings, (name) => variables.get(name))).toMatchObject({
      trueColor: 0x40a0ff,
      transparency: 'byblock',
    });
  });
  it('validates current defaults before changing a variable and permits locked current layers', () => {
    const variables = new SystemVariables(),
      state = createEmptyCadState();
    state.layers.push({ name: 'Locked', color: '#ffffff', visible: true, locked: true });
    variables.database.transaction('SETUP', (tx) =>
      syncLayerRecords(variables.database, tx, state),
    );
    applyCurrentProperty(variables, state, 'layer', 'Locked');
    expect(variables.get('CLAYER')).toBe('Locked');
    applyCurrentProperty(variables, state, 'linetypeScale', '3 / 2');
    expect(variables.get('CELTSCALE')).toBe(1.5);
    for (const [key, value] of [
      ['color', '#bad'],
      ['layer', 'missing'],
      ['linetypeScale', '1/0'],
      ['linetypeScale', '-1'],
      ['lineweight', '999'],
      ['transparency', '91'],
    ])
      expect(() => applyCurrentProperty(variables, state, key!, value!)).toThrow();
    expect(variables.get('CELTSCALE')).toBe(1.5);
    expect(variables.get('CECOLOR')).toBe('BYLAYER');
  });
});
