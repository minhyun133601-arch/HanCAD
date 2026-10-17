import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { dimensions, drawing, enter, mapping, point, settleView } from './cad-actions';
import { saveFromFileMenu } from './file-menu';

const output = fileURLToPath(new URL('../../../test-artifacts/dimensions', import.meta.url));

test('dimension coordinates, styles, Korean text, circle picks, undo, and exports work', async ({
  page,
}) => {
  // This full workflow creates seven dimensions, exports five formats and reloads
  // the drawing; parallel renderer/file tests can consume the default 30s budget.
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await enter(page, 'DAL');
  await enter(page, '10,10');
  await enter(page, '13,14');
  await enter(page, '7,15');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  expect((await dimensions(page))[0]?.measurement).toBe(5);
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  await enter(page, 'DIMSCALE');
  await enter(page, '2');
  await enter(page, 'DAL');
  await enter(page, '20,10');
  await enter(page, '23,14');
  await enter(page, '17,15');
  const measurements = await dimensions(page);
  expect(measurements.map((dimension) => dimension.measurement)).toEqual([5, 5]);
  expect(measurements[1]?.displayMeasurement).toBe(measurements[0]?.displayMeasurement);
  expect(measurements[1]?.textSize).toBe(measurements[0]!.textSize * 2);
  expect(measurements[1]?.arrowSize).toBe(measurements[0]!.arrowSize * 2);
  await enter(page, 'DIMSCALE');
  await enter(page, '1');
  await enter(page, 'DLI');
  await enter(page, '30,10');
  await enter(page, '33,14');
  await enter(page, 'H');
  await enter(page, 'T');
  const textInput = page.getByRole('textbox', { name: '명령 입력', exact: true });
  await expect(textInput).toHaveJSProperty('tagName', 'INPUT');
  await expect(textInput).toBeFocused();
  await textInput.fill('한글 치수 <>');
  await page.keyboard.press('Enter');
  await enter(page, '31,4');
  await enter(page, 'DLI');
  await enter(page, '40,10');
  await enter(page, '43,14');
  await enter(page, 'V');
  await enter(page, '46,12');
  const current = await dimensions(page);
  expect(current[2]?.kind).toBe('horizontal');
  expect(current[2]?.measurement).toBe(3);
  expect(current[2]?.label).toContain('한글 치수 3');
  expect(current[3]?.kind).toBe('vertical');
  expect(current[3]?.measurement).toBe(4);
  await enter(page, 'C');
  await enter(page, '65,25');
  await enter(page, '10');
  let view = await mapping(page);
  await page.getByRole('tab', { name: '주석', exact: true }).click();
  await page.getByRole('button', { name: '반지름 치수', exact: true }).click();
  await point(page, view, 75, 25);
  await enter(page, '90,42');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('6');
  view = await mapping(page);
  await enter(page, 'DDI');
  await point(page, view, 65, 15);
  await enter(page, '90,10');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('7');
  await enter(page, 'DAN');
  await enter(page, '');
  await enter(page, '110,20');
  await enter(page, '130,20');
  await enter(page, '110,40');
  await enter(page, '124,34');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('8');
  const radialAngular = (await dimensions(page)).slice(4);
  expect(radialAngular.map((dimension) => dimension.measurement)).toEqual([10, 20, 90]);
  expect(radialAngular[0]?.label).toContain('R10');
  expect(radialAngular[1]?.label).toContain('20');
  expect(radialAngular[2]?.label).toContain('90');
  await enter(page, 'DAL');
  await enter(page, '1,1');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('8');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '0');
  const before = JSON.stringify((await drawing(page)).entities);
  await page.getByRole('button', { name: '도면 전체 맞춤', exact: true }).click();
  await settleView(page);
  await fs.mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'dimension-sample-view.png') });
  for (const [label, extension] of [
    ['PDF 저장', 'pdf'],
    ['PNG 저장', 'png'],
    ['JPG 저장', 'jpg'],
    ['SVG 저장', 'svg'],
    ['DXF 저장', 'dxf'],
  ] as const) {
    const download = await saveFromFileMenu(page, label);
    const target = path.join(output, `dimension-sample.${extension}`);
    await download.saveAs(target);
    expect((await fs.stat(target)).size).toBeGreaterThan(500);
  }
  const svg = await fs.readFile(path.join(output, 'dimension-sample.svg'), 'utf8');
  expect(svg).toContain('한글 치수 3');
  expect(svg).toContain('R10');
  expect(svg).toContain('90');
  const dxf = await fs.readFile(path.join(output, 'dimension-sample.dxf'), 'utf8');
  expect(dxf).toContain('DIMENSION');
  expect(dxf).toContain('*D');
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('8');
  expect(JSON.stringify((await drawing(page)).entities)).toBe(before);
  expect((await dimensions(page)).map((dimension) => dimension.measurement)).toEqual([
    5, 5, 3, 4, 10, 20, 90,
  ]);
  expect(errors).toEqual([]);
});

test('basic dimension settings use live variables, apply selected styles once, and persist standalone changes', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page, 'DAL');
  await enter(page, '10,10');
  await enter(page, '40,50');
  await enter(page, '0,55');
  const originalDefinition = (await drawing(page)).entities[0];
  const originalGeometry = (await dimensions(page))[0];
  await enter(page, 'D');
  const dialog = page.getByRole('dialog', { name: '기본 치수 설정', exact: true });
  await expect(dialog).toContainText('ISO-25');
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue(
    '2.5',
  );
  await dialog.getByRole('spinbutton', { name: '문자 높이', exact: true }).fill('4');
  await dialog.getByRole('spinbutton', { name: '화살표 크기', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: '표시 축척', exact: true }).fill('2');
  await dialog
    .getByRole('textbox', { name: '접두·접미 문자 (<> = 측정값)', exact: true })
    .fill('공차 <> mm');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  expect((await dimensions(page))[0]?.textSize).toBe(2.5);
  expect((await dimensions(page))[0]).toEqual(originalGeometry);
  await enter(page, 'DAL');
  await enter(page, '70,10');
  await enter(page, '100,50');
  await enter(page, '60,55');
  const previous = await drawing(page),
    previousStyles = previous.entities;
  const geometry = await dimensions(page);
  expect(geometry[1]?.measurement).toBe(50);
  expect(geometry[1]?.displayMeasurement).toBe(50);
  expect(geometry[1]?.textSize).toBe(8);
  expect(geometry[1]?.arrowSize).toBe(2);
  expect(geometry[1]?.label).toContain('공차 50 mm');
  await page.keyboard.press('Control+a');
  await enter(page, 'D');
  await expect(dialog.getByRole('checkbox', { name: /선택한 치수에도 적용/ })).toBeChecked();
  await dialog.getByRole('spinbutton', { name: '문자 높이', exact: true }).fill('3');
  await dialog.getByRole('spinbutton', { name: '표시 축척', exact: true }).fill('1');
  await dialog.getByRole('spinbutton', { name: '화살표 크기', exact: true }).fill('0');
  await dialog.getByRole('spinbutton', { name: '0 억제 비트값', exact: true }).fill('0');
  await dialog.getByRole('textbox', { name: '접두·접미 문자 (<> = 측정값)', exact: true }).fill('');
  await dialog.getByRole('button', { name: '적용', exact: true }).click();
  const modified = await dimensions(page);
  expect(modified.map((dimension) => dimension.measurement)).toEqual([50, 50]);
  expect(modified.map((dimension) => dimension.textSize)).toEqual([3, 3]);
  expect(modified.map((dimension) => dimension.arrows.length)).toEqual([0, 0]);
  expect(modified.map((dimension) => dimension.label)).toEqual(['50.00', '50.00']);
  const first = (await drawing(page)).entities[0];
  if (first?.type !== 'dimension' || originalDefinition?.type !== 'dimension')
    throw new Error('Expected dimensions');
  expect(first.a).toEqual(originalDefinition.a);
  expect(first.b).toEqual(originalDefinition.b);
  await enter(page, 'U');
  expect((await drawing(page)).entities).toEqual(previousStyles);
  await enter(page, 'REDO');
  expect((await dimensions(page)).map((dimension) => dimension.textSize)).toEqual([3, 3]);
  await enter(page, 'DIMTXT');
  await enter(page, '6');
  await page.reload();
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('2');
  await enter(page, 'D');
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue('6');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'broken.dxf',
    mimeType: 'application/dxf',
    buffer: Buffer.from('invalid data'),
  });
  await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('오류');
  await enter(page, 'D');
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue('6');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  const previousIdentity = await page.evaluate(
    () => JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}').documentId,
  );
  // Keep the reader pending so cancellation is independent of decoding speed.
  await page.evaluate(() => {
    const NativeWorker = Worker;
    globalThis.Worker = new Proxy(NativeWorker, {
      construct(target, args: [string | URL, WorkerOptions?]) {
        const worker = new target(...args);
        if (args[1]?.name === 'local-dwg-reader') worker.postMessage = () => {};
        return worker;
      },
    });
  });
  await page
    .getByTestId('cad-file-input')
    .setInputFiles(fileURLToPath(new URL('../../../vendor/example_2000.dwg', import.meta.url)));
  await page.getByRole('button', { name: '읽기 취소', exact: true }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}').documentId,
    ),
  ).toBe(previousIdentity);
  await enter(page, 'D');
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue('6');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await enter(page, 'NEW');
  await enter(page, 'D');
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue(
    '2.5',
  );
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await page.reload();
  await enter(page, 'D');
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue(
    '2.5',
  );
});

test('standalone style changes persist on empty drawings and foreign overlays do not cross document identities', async ({
  page,
}) => {
  await page.goto('/');
  await enter(page, 'DIMTXT');
  await enter(page, '7');
  await page.reload();
  await enter(page, 'D');
  const dialog = page.getByRole('dialog', { name: '기본 치수 설정', exact: true });
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue('7');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await page.evaluate(() => {
    const overlay = JSON.parse(localStorage.getItem('hancad.dimension-style.v1') ?? '{}');
    overlay.documentId = crypto.randomUUID();
    overlay.style.DIMTXT = 99;
    localStorage.setItem('hancad.dimension-style.v1', JSON.stringify(overlay));
  });
  await page.reload();
  await enter(page, 'D');
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue('7');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}');
    delete saved.documentId;
    localStorage.setItem('hancad.active-drawing.v1', JSON.stringify(saved));
  });
  await page.reload();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}').documentId,
    ),
  ).toMatch(/^[a-f0-9-]{36}$/);
  await enter(page, 'DIMTXT');
  await enter(page, '6');
  await page.reload();
  await enter(page, 'D');
  await expect(dialog.getByRole('spinbutton', { name: '문자 높이', exact: true })).toHaveValue('6');
});

test('smart dimension previews line and circle picks, and angular dimensions accept two lines', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await enter(page, 'L');
  await enter(page, '10,10');
  await enter(page, '60,10');
  await enter(page, '');
  await enter(page, 'L');
  await enter(page, '10,10');
  await enter(page, '10,50');
  await enter(page, '');
  await enter(page, 'C');
  await enter(page, '80,30');
  await enter(page, '10');
  let view = await mapping(page);
  await page.getByRole('button', { name: '자동 치수', exact: true }).click();
  await point(page, view, 35, 10, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute(
    'data-preview-count',
    /[1-9]\d*/,
  );
  await point(page, view, 35, 10);
  await point(page, view, 35, 20);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('4');
  expect((await dimensions(page))[0]?.measurement).toBe(50);
  view = await mapping(page);
  await enter(page, 'DIM');
  await point(page, view, 90, 30, false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute(
    'data-preview-count',
    /[1-9]\d*/,
  );
  await point(page, view, 90, 30);
  // Keep the mouse placement below the viewport's top-right drawing-tools overlay.
  await point(page, view, 95, 42);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('5');
  expect((await dimensions(page))[1]?.kind).toBe('diameter');
  expect((await dimensions(page))[1]?.measurement).toBe(20);
  view = await mapping(page);
  await enter(page, 'DAN');
  await point(page, view, 35, 10);
  await point(page, view, 10, 30);
  await point(page, view, 25, 25);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('6');
  expect((await dimensions(page))[2]?.measurement).toBe(90);
});
