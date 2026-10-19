import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { DrawingDatabase } from '../../../packages/db/src/database';
import { serializeHcd } from '../../../packages/db/src/hcd';
import { entityFields } from '../../../packages/db/src/types';
import type { DatabaseObject, DxfGroup } from '@hancad/db';
import { drawing, enter } from './cad-actions';

const pairs: [number, string | number][] = [
  [100, 'AcDbEntity'],
  [8, '0'],
  [62, 3],
  [100, 'AcDbHatch'],
  [10, 0],
  [20, 0],
  [30, 0],
  [210, 0],
  [220, 0],
  [230, 1],
  [2, 'QA_PATTERN'],
  [70, 0],
  [71, 0],
  [91, 1],
  [92, 2],
  [72, 1],
  [73, 1],
  [93, 4],
  [10, 2],
  [20, 1],
  [42, 0.25],
  [10, 8],
  [20, 1],
  [42, 0],
  [10, 8],
  [20, 6],
  [42, 0],
  [10, 2],
  [20, 6],
  [42, 0],
  [97, 0],
  [75, 0],
  [76, 1],
  [52, 30],
  [41, 2],
  [77, 0],
  [78, 1],
  [53, 75],
  [43, 2],
  [44, 3],
  [45, -4],
  [46, 5],
  [79, 3],
  [49, 2],
  [49, -1],
  [49, 0],
  [98, 1],
  [10, 5],
  [20, 4],
];
async function tokens(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) await enter(page, value);
}
async function nativeObjects(page: Page): Promise<DatabaseObject[]> {
  return page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}');
    return session.nativeDatabase?.objects ?? [];
  });
}
async function hatches(page: Page): Promise<DatabaseObject[]> {
  return (await nativeObjects(page)).filter((object) => object.type === 'HATCH' && !object.erased);
}
function number(groups: readonly DxfGroup[], code: number): number {
  const value = groups.find((group) => group.code === code)?.value;
  if (typeof value !== 'number') throw new Error(`Missing numeric group ${code}`);
  return value;
}
function section(groups: readonly DxfGroup[], from: number, to?: number): readonly DxfGroup[] {
  const start = groups.findIndex((group) => group.code === from);
  const end =
    to === undefined
      ? groups.length
      : groups.findIndex((group, i) => i > start && group.code === to);
  if (start < 0 || end < 0) throw new Error('Missing native HATCH section');
  return groups.slice(start, end);
}
function coordinates(groups: readonly DxfGroup[], code: number, expected: readonly number[]): void {
  const values = groups.filter((group) => group.code === code).map((group) => group.value);
  expect(values).toHaveLength(expected.length);
  values.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 9));
}
function reflectedDefinition(object: DatabaseObject, mirrorPattern: boolean): void {
  const boundary = section(object.groups, 92, 75);
  coordinates(boundary, 10, [-2, -8, -8, -2]);
  coordinates(boundary, 20, [1, 1, 6, 6]);
  coordinates(boundary, 42, [-0.25, 0, 0, 0]);
  const pattern = section(object.groups, 75, 98);
  expect(number(pattern, 52)).toBeCloseTo(mirrorPattern ? 150 : 30, 9);
  expect(number(pattern, 53)).toBeCloseTo(mirrorPattern ? 105 : 75, 9);
  expect(number(pattern, 41)).toBe(2);
  expect(number(pattern, 43)).toBeCloseTo(-2, 9);
  expect(number(pattern, 44)).toBeCloseTo(3, 9);
  expect(number(pattern, 45)).toBeCloseTo(mirrorPattern ? 4 : -4, 9);
  expect(number(pattern, 46)).toBeCloseTo(5, 9);
  expect(pattern.filter((g) => g.code === 49).map((g) => g.value)).toEqual([2, -1, 0]);
  const seed = section(object.groups, 98);
  expect(number(seed, 10)).toBeCloseTo(-5, 9);
  expect(number(seed, 20)).toBeCloseTo(4, 9);
  expect(number(object.groups, 71)).toBe(0);
  expect(object.groups.find((g) => g.code === 2)?.value).toBe('QA_PATTERN');
  expect(object.fields).toMatchObject({ layer: '0', color: 3, extrusion: [0, 0, 1] });
  expect(object.xdata).toEqual({ HANCAD_QA: [{ code: 1000, value: 'native-pattern-metadata' }] });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(message.text());
  });
  await page.goto('/');
});

for (const mode of [0, 1]) {
  test(`native HATCH MIRRHATCH=${mode} preserves pattern metadata and shares one U/REDO with the host`, async ({
    page,
  }) => {
    await tokens(page, ['OSMODE', '0', 'ORTHOMODE', '0', 'SNAPMODE', '0', 'DYNMODE', '0']);
    if (mode === 1) await tokens(page, ['LINE', '10,10', '20,10', '']);
    const state = await drawing(page),
      database = new DrawingDatabase();
    database.transaction('NATIVE_HATCH_FIXTURE', (tx) => {
      tx.add({ type: 'APPID', name: 'HANCAD_QA', owner: database.tables.APPID });
      tx.add({
        type: 'HATCH',
        owner: database.find('BLOCK_RECORD', '*Model_Space')!.handle,
        fields: entityFields({ color: 3 }),
        groups: pairs.map(([code, value]) => ({ code, value })),
        xdata: { HANCAD_QA: [{ code: 1000, value: 'native-pattern-metadata' }] },
      });
      tx.setVariable(
        'HANCAD_VIEW_STATE',
        JSON.stringify({ state, report: null, fileName: 'native-hatch.hcd' }),
      );
    });
    const bytes = serializeHcd(database);
    await fs.mkdir('test-artifacts', { recursive: true });
    await fs.writeFile(`test-artifacts/phase07-native-hatch-mirror-mode${mode}.hcd`, bytes);
    await page.getByTestId('cad-file-input').setInputFiles({
      name: 'native-hatch.hcd',
      mimeType: 'application/zip',
      buffer: Buffer.from(bytes),
    });
    await expect.poll(async () => (await hatches(page)).length).toBe(1);
    const original = (await hatches(page))[0]!;
    const beforeEntities = (await drawing(page)).entities;
    await tokens(page, [
      'MIRRHATCH',
      String(mode),
      'MIRROR',
      'ALL',
      '',
      '0,0',
      '0,100',
      mode ? 'Y' : 'N',
    ]);
    await expect(page.locator('.command-prompt')).toHaveText('명령:');
    await expect.poll(async () => (await hatches(page)).length).toBe(mode ? 1 : 2);
    const after = await hatches(page),
      reflected = after.find((object) => object.handle !== original.handle)!;
    reflectedDefinition(reflected, mode === 1);
    if (!mode) {
      expect(after.find((object) => object.handle === original.handle)).toEqual(original);
      expect((await drawing(page)).entities).toEqual(beforeEntities);
    } else {
      expect(
        (await nativeObjects(page)).find((object) => object.handle === original.handle)?.erased,
      ).toBe(true);
      const line = (await drawing(page)).entities[0];
      if (line?.type !== 'line') throw new Error('Expected mirrored LINE');
      expect(line.a.x).toBeCloseTo(-10, 9);
      expect(line.a.y).toBeCloseTo(-10, 9);
      expect(line.b.x).toBeCloseTo(-20, 9);
      expect(line.b.y).toBeCloseTo(-10, 9);
    }
    const afterEntities = (await drawing(page)).entities;
    if (!mode) {
      await tokens(page, ['MIRROR', 'P', '']);
      await expect(page.locator('.command-prompt')).toContainText('첫 번째');
      await page.getByTestId('drawing-canvas').focus();
      await page.keyboard.press('Escape');
      await expect(page.locator('.command-prompt')).toHaveText('명령:');
      await expect.poll(async () => hatches(page)).toEqual(after);
    }
    await enter(page, 'U');
    await expect.poll(async () => hatches(page)).toEqual([original]);
    await expect.poll(async () => (await drawing(page)).entities).toEqual(beforeEntities);
    await enter(page, 'REDO');
    await expect.poll(async () => hatches(page)).toEqual(after);
    await expect.poll(async () => (await drawing(page)).entities).toEqual(afterEntities);
    await page.reload();
    await expect.poll(async () => hatches(page)).toEqual(after);
    await expect.poll(async () => (await drawing(page)).entities).toEqual(afterEntities);
  });
}
