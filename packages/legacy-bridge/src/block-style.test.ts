import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { normalizeCadState, readCadFile } from './index';
import { createTestRuntime } from './test-runtime';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

const record = (type: string, ...tags: (string | number)[]): string =>
  [0, type, ...tags].join('\n') + '\n';
const layer = (
  name: string,
  color: number,
  linetype: string,
  weight: number,
  trueColor?: number,
): string =>
  record(
    'LAYER',
    2,
    name,
    62,
    color,
    6,
    linetype,
    370,
    weight,
    ...(trueColor === undefined ? [] : [420, trueColor]),
  );
const insert = (
  block: string,
  layer: string,
  color: number,
  linetype: string,
  weight: number,
  x = 0,
  trueColor?: number,
): string =>
  record(
    'INSERT',
    2,
    block,
    8,
    layer,
    62,
    color,
    6,
    linetype,
    370,
    weight,
    10,
    x,
    20,
    0,
    ...(trueColor === undefined ? [] : [420, trueColor]),
  );
const line = (color: number, y: number, layerName = 'B', trueColor?: number): string =>
  record(
    'LINE',
    8,
    layerName,
    62,
    color,
    6,
    color === 0 ? 'BYBLOCK' : 'BYLAYER',
    370,
    color === 0 ? -2 : -1,
    10,
    0,
    20,
    y,
    11,
    10,
    21,
    y,
    ...(trueColor === undefined ? [] : [420, trueColor]),
  );

function fixture(layerTrueColor?: number): string {
  return (
    record('SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1021', 9, '$INSUNITS', 70, 4) +
    record('ENDSEC') +
    record('SECTION', 2, 'TABLES') +
    record('TABLE', 2, 'LAYER') +
    layer('A', 7, 'LT_A', 70, layerTrueColor) +
    layer('B', 3, 'LT_B', 25) +
    layer('C', 2, 'LT_B', 35) +
    record('ENDTAB') +
    record('TABLE', 2, 'LTYPE') +
    record('LTYPE', 2, 'LT_A', 40, 12, 49, 8, 49, -4) +
    record('LTYPE', 2, 'LT_B', 40, 4, 49, 2, 49, -2) +
    record('ENDTAB') +
    record('ENDSEC') +
    record('SECTION', 2, 'BLOCKS') +
    record('BLOCK', 2, 'Inner', 10, 0, 20, 0) +
    line(0, 0) +
    line(0, 1, 'B', 0x123456) +
    line(256, 2) +
    line(0, 3, '0') +
    record('ENDBLK') +
    record('BLOCK', 2, 'Outer', 10, 0, 20, 0) +
    insert('Inner', 'B', 0, 'BYBLOCK', -2) +
    insert('Inner', 'C', 256, 'BYLAYER', -1, 20) +
    record('ENDBLK') +
    record('ENDSEC') +
    record('SECTION', 2, 'ENTITIES') +
    insert('Outer', 'A', 256, 'BYLAYER', -1) +
    insert('Inner', 'A', 0, 'BYLAYER', -1, 100, 0xabcdef) +
    record('ENDSEC') +
    record('EOF')
  );
}

it('flattens nested INSERT ByBlock properties in the parent context and keeps explicit true color authoritative', async () => {
  const { state } = await readCadFile(new File([fixture()], 'nested-styles.dxf'));
  expect(state.entities).toHaveLength(12);
  expect(state.entities[0]).toMatchObject({
    layer: 'B',
    aci: 7,
    color: '#FFFFFF',
    linetype: 'LT_A',
    lineweight: 70,
  });
  expect(state.entities[0]?.trueColor).toBeUndefined();
  expect(state.entities[1]).toMatchObject({
    layer: 'B',
    aci: 0,
    trueColor: 0x123456,
    color: '#123456',
    linetype: 'LT_A',
    lineweight: 70,
  });
  expect(state.entities[2]).toMatchObject({
    layer: 'B',
    aci: 256,
    color: '#00FF00',
    linetype: 'BYLAYER',
    lineweight: -1,
  });
  expect(state.entities[3]).toMatchObject({ layer: 'B', aci: 7, linetype: 'LT_A', lineweight: 70 });
  expect(state.entities[4]).toMatchObject({
    layer: 'B',
    aci: 2,
    color: '#FFFF00',
    linetype: 'LT_B',
    lineweight: 35,
  });
  expect(state.entities[7]).toMatchObject({ layer: 'C', aci: 2, linetype: 'LT_B', lineweight: 35 });
  expect(state.entities[8]).toMatchObject({
    layer: 'B',
    trueColor: 0xabcdef,
    color: '#abcdef',
    linetype: 'LT_A',
    lineweight: 70,
  });
  expect(state.entities[9]).toMatchObject({ trueColor: 0x123456, color: '#123456' });
  expect(state.entities[11]).toMatchObject({ layer: 'A', trueColor: 0xabcdef });
  expect(JSON.stringify(normalizeCadState(JSON.parse(JSON.stringify(state))))).toBe(
    JSON.stringify(state),
  );
  expect(JSON.stringify(state)).not.toContain('resolvedColor');
});

it('inherits an INSERT layer true color without rebinding it to the child layer', async () => {
  const { state } = await readCadFile(new File([fixture(0x2468ac)], 'layer-truecolor.dxf'));
  expect(state.entities[0]).toMatchObject({
    layer: 'B',
    aci: 7,
    trueColor: 0x2468ac,
    color: '#2468ac',
    linetype: 'LT_A',
    lineweight: 70,
  });
  expect(state.entities[1]).toMatchObject({ trueColor: 0x123456, color: '#123456' });
});
