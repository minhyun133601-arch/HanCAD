import fs from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { DrawingDatabase } from '../../../packages/db/src/database';
import { serializeHcd } from '../../../packages/db/src/hcd';
import { entityFields } from '../../../packages/db/src/types';
import type { DatabaseObject } from '@hancad/db';
import { drawing, enter, mapping, settleView } from './cad-actions';
import { saveFromFileMenu } from './file-menu';

async function tokens(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) await enter(page, value);
}
async function nativeObjects(page: Page): Promise<DatabaseObject[]> {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}').nativeDatabase
        ?.objects ?? [],
  );
}
async function expectVariable(page: Page, name: string, value: string): Promise<void> {
  await tokens(page, ['GETVAR', name]);
  await expect(page.getByRole('log').locator('.history-line').last()).toHaveText(
    `${name} = ${value}`,
  );
}
async function colors(
  page: Page,
): Promise<{ red: number; green: number; blue: number; marks: number; brightness: number }> {
  await settleView(page);
  return page.getByTestId('drawing-canvas').evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) throw new Error('Expected model canvas.');
    const gl = node.getContext('webgl2');
    if (!gl) throw new Error('Expected WebGL2.');
    const bytes = new Uint8Array(node.width * node.height * 4);
    gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let red = 0,
      green = 0,
      blue = 0,
      marks = 0,
      brightness = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      const r = bytes[i]!,
        g = bytes[i + 1]!,
        b = bytes[i + 2]!;
      if (r > 100 && g < 100 && b < 100) red++;
      if (g > 100 && r < 100 && b < 100) green++;
      if (b > 100 && r < 100 && g < 100) blue++;
      if (r !== 33 || g !== 40 || b !== 48) {
        marks++;
        brightness += r + g + b;
      }
    }
    return { red, green, blue, marks, brightness };
  });
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await tokens(page, ['OSMODE', '0', 'DYNMODE', '0', 'GRIDMODE', '0', 'SETVAR', 'UCSICON', '0']);
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('COLOR dialog keeps ACI, RGB and HSL drawing colors and one-step color undo', async ({
  page,
}) => {
  await enter(page, 'COLOR');
  let dialog = page.getByRole('dialog', { name: '색상 선택', exact: true });
  await dialog.getByRole('button', { name: 'ACI 254', exact: true }).click();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await expectVariable(page, 'CECOLOR', '254');
  await enter(page, 'U');
  await expectVariable(page, 'CECOLOR', 'BYLAYER');
  await enter(page, 'COLOR');
  dialog = page.getByRole('dialog', { name: '색상 선택', exact: true });
  await dialog.getByRole('button', { name: 'ACI 1', exact: true }).click();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await tokens(page, ['LINE', '0,0', '100,0', '']);
  expect((await drawing(page)).entities[0]?.aci).toBe(1);
  await enter(page, 'COLOR');
  dialog = page.getByRole('dialog', { name: '색상 선택', exact: true });
  await dialog.getByRole('tab', { name: '트루컬러', exact: true }).click();
  await dialog.getByLabel('R', { exact: true }).fill('20');
  await dialog.getByLabel('G', { exact: true }).fill('40');
  await dialog.getByLabel('B', { exact: true }).fill('60');
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await tokens(page, ['LINE', '0,20', '100,20', '']);
  expect((await drawing(page)).entities[1]?.trueColor).toBe(0x14283c);
  await enter(page, 'COLOR');
  dialog = page.getByRole('dialog', { name: '색상 선택', exact: true });
  await dialog.getByRole('tab', { name: '트루컬러', exact: true }).click();
  await dialog.getByRole('combobox', { name: '색상 모델', exact: true }).selectOption('HSL');
  await dialog.getByLabel('H', { exact: true }).fill('120');
  await dialog.getByLabel('S', { exact: true }).fill('100');
  await dialog.getByLabel('L', { exact: true }).fill('50');
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await tokens(page, ['LINE', '0,40', '100,40', '']);
  expect((await drawing(page)).entities[2]?.trueColor).toBe(0x00ff00);
  await enter(page, 'COLOR');
  dialog = page.getByRole('dialog', { name: '색상 선택', exact: true });
  await dialog.getByRole('tab', { name: '색상표', exact: true }).click();
  await expect(
    dialog.getByText('색상표 지원은 이후 단계에서 추가됩니다.', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: '확인', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
});

test('own complex LIN loads, retains Korean text and shape definitions through HCD reopen and recovery', async ({
  page,
}, testInfo) => {
  const text =
    '; own file\n*QA_HOT,온수 배관\nA,12,-2,["온수,HW",STANDARD,S=2,U=100G,X=-1,Y=.5],-2,[BOX,user.shx,A=90,S=.5],0\n';
  await enter(page, 'LINETYPE');
  const dialog = page.getByRole('dialog', { name: '선종류 관리자', exact: true });
  await dialog.getByRole('button', { name: '로드...', exact: true }).click();
  await dialog
    .getByLabel('파일 선택', { exact: true })
    .setInputFiles({ name: 'own-korean.lin', mimeType: 'text/plain', buffer: Buffer.from(text) });
  await dialog.getByRole('checkbox', { name: /QA_HOT/ }).check();
  await dialog.getByRole('button', { name: '로드', exact: true }).click();
  await dialog.getByRole('button', { name: 'QA_HOT', exact: true }).click();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await expect
    .poll(async () =>
      (await nativeObjects(page)).find((o) => o.type === 'LTYPE' && o.name === 'QA_HOT'),
    )
    .toBeTruthy();
  const original = (await nativeObjects(page)).find(
    (o) => o.type === 'LTYPE' && o.name === 'QA_HOT',
  )!;
  expect(original.fields.pattern).toEqual([
    { length: 12 },
    { length: -2 },
    {
      length: -2,
      complex: {
        kind: 'text',
        value: '온수,HW',
        source: 'STANDARD',
        scale: 2,
        rotation: 90,
        absoluteRotation: false,
        uprightRotation: true,
        x: -1,
        y: 0.5,
      },
    },
    {
      length: 0,
      complex: {
        kind: 'shape',
        value: 'BOX',
        source: 'user.shx',
        scale: 0.5,
        rotation: 90,
        absoluteRotation: true,
        uprightRotation: false,
        x: 0,
        y: 0,
      },
    },
  ]);
  await tokens(page, ['LINE', '0,0', '100,0', '']);
  expect((await drawing(page)).entities[0]?.linetype).toBe('QA_HOT');
  const download = await saveFromFileMenu(page, 'HCD 저장'),
    file = testInfo.outputPath('complex.hcd');
  await download.saveAs(file);
  await enter(page, 'NEW');
  await page.getByTestId('cad-file-input').setInputFiles(file);
  await expect
    .poll(async () =>
      (await nativeObjects(page)).find((o) => o.type === 'LTYPE' && o.name === 'QA_HOT'),
    )
    .toEqual(original);
  await page.reload();
  await expect
    .poll(async () =>
      (await nativeObjects(page)).find((o) => o.type === 'LTYPE' && o.name === 'QA_HOT'),
    )
    .toEqual(original);
});

test('LWEIGHT display and transparency changes affect GPU output with one-command undo', async ({
  page,
}) => {
  await tokens(page, ['CECOLOR', '1', 'LINE', '0,0', '100,0', '']);
  await mapping(page);
  await page.mouse.move(10, 10);
  const thin = await colors(page);
  await enter(page, 'LWEIGHT');
  const dialog = page.getByRole('dialog', { name: '선가중치 설정', exact: true });
  await dialog.getByRole('listbox', { name: '선가중치', exact: true }).selectOption('100');
  await dialog.getByRole('combobox', { name: '기본값', exact: true }).selectOption('100');
  await dialog.getByLabel('선가중치 표시', { exact: true }).check();
  await dialog.getByRole('button', { name: '확인', exact: true }).click();
  await expect.poll(async () => (await colors(page)).red).toBeGreaterThan(thin.red * 2);
  const thick = await colors(page);
  await enter(page, 'U');
  await expect.poll(async () => (await colors(page)).red).toBe(thin.red);
  await enter(page, 'REDO');
  await expect.poll(async () => (await colors(page)).red).toBe(thick.red);
  await page.getByRole('combobox', { name: 'Ribbon 투명도', exact: true }).selectOption('70');
  await tokens(page, ['LINE', '0,20', '100,20', '']);
  expect((await drawing(page)).entities[1]?.transparency).toBe(70);
  await mapping(page);
  await page.mouse.move(10, 10);
  const transparent = await colors(page);
  await page.getByRole('combobox', { name: 'Ribbon 투명도', exact: true }).selectOption('__MORE__');
  const transparency = page.getByRole('dialog', { name: '투명도', exact: true });
  await transparency.getByLabel('투명도 값', { exact: true }).fill('50');
  await transparency.getByLabel('투명도 표시', { exact: true }).uncheck();
  await transparency.getByRole('button', { name: '확인', exact: true }).click();
  await expect
    .poll(async () => (await colors(page)).brightness)
    .toBeGreaterThan(transparent.brightness);
  await enter(page, 'U');
  await expect(page.getByRole('combobox', { name: 'Ribbon 투명도', exact: true })).toHaveValue(
    '70',
  );
  await page.getByRole('combobox', { name: 'Ribbon 투명도', exact: true }).selectOption('__MORE__');
  await expect(transparency.getByLabel('투명도 표시', { exact: true })).not.toBeChecked();
  await transparency.getByLabel('투명도 표시', { exact: true }).check();
  await transparency.getByRole('button', { name: '확인', exact: true }).click();
  await expect.poll(async () => (await colors(page)).brightness).toBe(transparent.brightness);
  const original = (await drawing(page)).entities;
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  await page.getByRole('combobox', { name: 'Ribbon 투명도', exact: true }).selectOption('__MORE__');
  await transparency
    .getByRole('combobox', { name: '투명도', exact: true })
    .selectOption('explicit');
  await transparency.getByLabel('투명도 값', { exact: true }).fill('30');
  await transparency.getByRole('button', { name: '확인', exact: true }).click();
  await expect
    .poll(async () => (await drawing(page)).entities.map((e) => e.transparency))
    .toEqual([30, 30]);
  const changed = (await drawing(page)).entities;
  await enter(page, 'U');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(original);
  await enter(page, 'REDO');
  await expect.poll(async () => (await drawing(page)).entities).toEqual(changed);
});

test('native nested blocks render inherited ByLayer and ByBlock styles and obey parent layer freeze', async ({
  page,
}) => {
  const state = await drawing(page),
    db = new DrawingDatabase();
  db.transaction('PHASE08_NESTED_FIXTURE', (tx) => {
    tx.add({
      type: 'LAYER',
      owner: db.tables.LAYER,
      name: 'WALLS',
      fields: { color: 1, linetype: 'CONTINUOUS', lineweight: 100, transparency: 0x02000099 },
    });
    tx.add({
      type: 'LAYER',
      owner: db.tables.LAYER,
      name: 'DETAIL',
      fields: { color: 3, linetype: 'CONTINUOUS', lineweight: 100 },
    });
    const inner = tx.add({ type: 'BLOCK_RECORD', owner: db.tables.BLOCK_RECORD, name: 'inner' });
    tx.add({
      type: 'LINE',
      owner: inner.handle,
      fields: entityFields({
        start: [0, 0],
        end: [100, 0],
        color: 0,
        linetype: 'BYBLOCK',
        lineweight: -2,
        transparency: 0x01000000,
      }),
    });
    tx.add({
      type: 'LINE',
      owner: inner.handle,
      fields: entityFields({ start: [0, 20], end: [100, 20], layer: 'DETAIL' }),
    });
    tx.add({
      type: 'LINE',
      owner: inner.handle,
      fields: entityFields({
        start: [0, 40],
        end: [100, 40],
        trueColor: 0x0000ff,
        lineweight: 100,
        transparency: 0x020000ff,
      }),
    });
    const outer = tx.add({ type: 'BLOCK_RECORD', owner: db.tables.BLOCK_RECORD, name: 'outer' });
    tx.add({
      type: 'INSERT',
      owner: outer.handle,
      fields: entityFields({
        name: 'inner',
        color: 0,
        linetype: 'BYBLOCK',
        lineweight: -2,
        transparency: 0x01000000,
      }),
    });
    tx.add({
      type: 'INSERT',
      owner: db.find('BLOCK_RECORD', '*Model_Space')!.handle,
      fields: entityFields({ name: 'outer', layer: 'WALLS', insertionPoint: [100, 50] }),
    });
    for (const [name, value] of [
      ['GRIDMODE', 0],
      ['UCSICON', 0],
      ['LWDISPLAY', 1],
      ['TRANSPARENCYDISPLAY', 1],
    ] as const)
      tx.setVariable(name, value);
    tx.setVariable(
      'HANCAD_VIEW_STATE',
      JSON.stringify({ state, report: null, fileName: 'nested-styles.hcd' }),
    );
  });
  const bytes = serializeHcd(db);
  await fs.mkdir('test-artifacts', { recursive: true });
  await fs.writeFile('test-artifacts/phase08-nested-styles.hcd', bytes);
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'nested-styles.hcd',
    mimeType: 'application/zip',
    buffer: Buffer.from(bytes),
  });
  await expect
    .poll(async () => (await nativeObjects(page)).filter((o) => o.type === 'INSERT').length)
    .toBe(2);
  await mapping(page);
  await page.mouse.move(10, 10);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-entity-count', '3');
  const original = await colors(page);
  expect(original.red).toBeGreaterThan(100);
  expect(original.green).toBeGreaterThan(100);
  expect(original.blue).toBeGreaterThan(100);
  await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
  await page.getByRole('button', { name: 'WALLS 동결', exact: true }).click();
  await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
  await expect
    .poll(async () => colors(page))
    .toEqual({ red: 0, green: 0, blue: 0, marks: 0, brightness: 0 });
  await enter(page, 'U');
  await expect.poll(async () => colors(page)).toEqual(original);
  await page.reload();
  await expect
    .poll(async () => (await nativeObjects(page)).filter((o) => o.type === 'INSERT').length)
    .toBe(2);
  await mapping(page);
  await page.mouse.move(10, 10);
  await expect.poll(async () => (await colors(page)).red).toBeGreaterThan(100);
});
