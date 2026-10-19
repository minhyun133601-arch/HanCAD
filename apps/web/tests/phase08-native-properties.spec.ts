import { expect, test, type Page } from '@playwright/test';
import { DrawingDatabase } from '../../../packages/db/src/database';
import { serializeHcd } from '../../../packages/db/src/hcd';
import { entityFields } from '../../../packages/db/src/types';
import type { DatabaseObject, DxfGroup, JsonObject } from '@hancad/db';
import type { LegacyCadRuntime } from '@hancad/legacy-bridge';
import { drawing, enter, mapping, settleView } from './cad-actions';
import type { CanvasMapping } from './cad-actions';

async function nativeObjects(page: Page): Promise<DatabaseObject[]> {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('hancad.active-drawing.v1') ?? '{}').nativeDatabase
        ?.objects ?? [],
  );
}
async function nativeObject(page: Page, type: string): Promise<DatabaseObject> {
  const object = (await nativeObjects(page)).find((item) => item.type === type);
  if (!object) throw new Error(`Missing native fixture entity: ${type}`);
  return object;
}
async function importFixture(page: Page): Promise<CanvasMapping> {
  const state = await page.evaluate(() => {
      const runtime = (globalThis as typeof globalThis & { HeechangTool?: LegacyCadRuntime })
        .HeechangTool;
      if (!runtime) throw new Error('Local CAD runtime is unavailable.');
      return runtime.core.cadEngine.normalizeState({ name: 'native-properties.hcd' });
    }),
    database = new DrawingDatabase();
  database.transaction('PHASE08_NATIVE_PROPERTIES_FIXTURE', (tx) => {
    const owner = database.find('BLOCK_RECORD', '*Model_Space')!.handle;
    const add = (type: string, geometry: JsonObject, groups: DxfGroup[]): void => {
      tx.add({
        type,
        owner,
        fields: entityFields(geometry),
        groups: [...groups, { code: 999, value: `${type}-vendor` }],
        xdata: { APP: [{ code: 1000, value: `${type}-retained` }] },
      });
    };
    add('ARC', { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: 180 }, [
      { code: 100, value: 'AcDbCircle' },
      { code: 10, value: 0 },
      { code: 20, value: 0 },
      { code: 30, value: 0 },
      { code: 40, value: 10 },
      { code: 100, value: 'AcDbArc' },
      { code: 50, value: 0 },
      { code: 51, value: 180 },
    ]);
    add('POINT', { position: [30, 0, 2] }, [
      { code: 100, value: 'AcDbPoint' },
      { code: 10, value: 30 },
      { code: 20, value: 0 },
      { code: 30, value: 2 },
    ]);
    tx.setVariable('GRIDMODE', 0);
    tx.setVariable('UCSICON', 0);
    tx.setVariable(
      'HANCAD_VIEW_STATE',
      JSON.stringify({ state, report: null, fileName: 'native-properties.hcd' }),
    );
  });
  await page.getByTestId('cad-file-input').setInputFiles({
    name: 'native-properties.hcd',
    mimeType: 'application/zip',
    buffer: Buffer.from(serializeHcd(database)),
  });
  await expect
    .poll(
      async () =>
        (await nativeObjects(page)).filter((o) => ['ARC', 'POINT'].includes(o.type)).length,
    )
    .toBe(2);
  await expect(page.locator('.file-tab[aria-current="page"]')).toHaveText('native-properties.hcd');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-entity-count', '2');
  expect((await drawing(page)).entities).toEqual([]);
  await enter(page, 'PROPERTIES');
  await expect(page.getByTestId('properties-palette')).toBeVisible();
  const view = await mapping(page);
  await enter(page, 'REGEN');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  await settleView(page);
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-count', '2');
  return view;
}
async function frame(page: Page, view: CanvasMapping, type: 'ARC' | 'POINT'): Promise<Buffer> {
  await page.mouse.move(10, 10);
  await settleView(page);
  const region =
    type === 'ARC'
      ? { x: 0, y: 12, width: 8, height: 12 }
      : { x: 32.5, y: 0, width: 15, height: 8 };
  const clip = {
    x: view.width / 2 + (region.x - view.originX - region.width / 2) * view.zoom,
    y: view.height / 2 + (-region.y - view.originY - region.height / 2) * view.zoom,
    width: region.width * view.zoom,
    height: region.height * view.zoom,
  };
  // The Properties palette overlays model space; read the actual drawing framebuffer
  // so input focus and command-history chrome never enter the geometry comparison.
  const data = await page.getByTestId('drawing-canvas').evaluate((node, area) => {
    if (!(node instanceof HTMLCanvasElement)) throw new Error('Expected drawing canvas.');
    const gl = node.getContext('webgl2');
    if (!gl) throw new Error('Expected WebGL2 framebuffer.');
    const bounds = node.getBoundingClientRect(),
      scaleX = node.width / bounds.width,
      scaleY = node.height / bounds.height,
      x = Math.max(0, Math.floor(area.x * scaleX)),
      top = Math.max(0, Math.floor(area.y * scaleY)),
      width = Math.max(1, Math.min(node.width - x, Math.ceil(area.width * scaleX))),
      height = Math.max(1, Math.min(node.height - top, Math.ceil(area.height * scaleY))),
      pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(x, node.height - top - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const image = document.createElement('canvas');
    image.width = width;
    image.height = height;
    image.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0);
    return image.toDataURL('image/png').split(',')[1]!;
  }, clip);
  return Buffer.from(data, 'base64');
}
const cases = [
  { type: 'ARC', label: '반지름', original: '10', expression: 'sqrt(196)', result: '14' },
  { type: 'POINT', label: '위치 X', original: '30', expression: '10 + 25', result: '35' },
] as const;

for (const example of cases) {
  test(`native ${example.type} Properties expression updates DXF, rendering and one-step U/REDO`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto('/');
    for (const token of ['OSMODE', '0', 'DYNMODE', '0']) await enter(page, token);
    const view = await importFixture(page);
    const palette = page.getByTestId('properties-palette');
    await palette.getByLabel('객체 유형 필터', { exact: true }).selectOption(example.type);
    const field = palette.getByLabel(example.label, { exact: true });
    await expect(field).toHaveValue(example.original);
    const original = await nativeObject(page, example.type),
      untouchedType = example.type === 'ARC' ? 'POINT' : 'ARC',
      untouched = await nativeObject(page, untouchedType),
      before = await frame(page, view, example.type);
    await field.fill(example.expression);
    await field.press('Enter');
    await expect(field).toHaveValue(example.result);
    await expect
      .poll(async () => {
        const changed = await nativeObject(page, example.type);
        return example.type === 'ARC' ? changed.fields.radius : changed.fields.position;
      })
      .toEqual(example.type === 'ARC' ? 14 : [35, 0, 2]);
    const changed = await nativeObject(page, example.type);
    expect(changed.handle).toBe(original.handle);
    expect(changed.owner).toBe(original.owner);
    expect(changed.xdata).toEqual(original.xdata);
    expect(changed.groups.filter((group) => group.code === 999)).toEqual(
      original.groups.filter((group) => group.code === 999),
    );
    expect(changed.groups.find((g) => g.code === (example.type === 'ARC' ? 40 : 10))?.value).toBe(
      example.type === 'ARC' ? 14 : 35,
    );
    expect(await nativeObject(page, untouchedType)).toEqual(untouched);
    expect((await drawing(page)).entities).toEqual([]);
    const after = await frame(page, view, example.type);
    await testInfo.attach('before', { body: before, contentType: 'image/png' });
    await testInfo.attach('after', { body: after, contentType: 'image/png' });
    expect(after.equals(before)).toBe(false);
    await enter(page, 'U');
    await expect.poll(async () => nativeObject(page, example.type)).toEqual(original);
    expect(await nativeObject(page, untouchedType)).toEqual(untouched);
    const undone = await frame(page, view, example.type);
    await testInfo.attach('undo', { body: undone, contentType: 'image/png' });
    expect(undone.equals(before)).toBe(true);
    await enter(page, 'REDO');
    await expect.poll(async () => nativeObject(page, example.type)).toEqual(changed);
    expect((await frame(page, view, example.type)).equals(after)).toBe(true);
    await page.reload();
    await expect
      .poll(async () => (await nativeObjects(page)).find((object) => object.type === example.type))
      .toEqual(changed);
    expect(await nativeObject(page, untouchedType)).toEqual(untouched);
    expect((await drawing(page)).entities).toEqual([]);
    expect(errors).toEqual([]);
  });
}
