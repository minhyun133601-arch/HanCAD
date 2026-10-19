import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { nativeAcceptance } from './native-acceptance-runtime.mjs';
import { phase08Helpers } from './native-acceptance-phase08-helpers.mjs';

const qa = await nativeAcceptance('phase08-native-runtime', 9241);
let page,
  helpers,
  completed = 0;
const errors = [];
async function passed(name, evidence = {}) {
  await helpers.capture(name);
  completed++;
  qa.log(name, evidence);
}
try {
  page = await qa.connect('layers-properties', qa.port);
  page.on('pageerror', (error) => errors.push(error.message));
  helpers = phase08Helpers(qa, page);
  const { tokens, nativeObjects, fresh, exactUndoRedo, pixels, clearSelection, variable } = helpers;
  qa.log(
    'native-phase08-assets',
    await page.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean)),
  );

  await fresh();
  {
    const before = (await qa.drawing(page)).layers;
    await tokens([
      '-LAYER',
      'M',
      '기계실 벽체',
      'C',
      '3',
      '',
      'TR',
      '35',
      '',
      'LW',
      '0.25',
      '',
      'D',
      '검토용 벽체',
      '',
      '',
    ]);
    await qa.idle(page);
    const result = await qa.drawing(page),
      layer = result.layers.find((row) => row.name === '기계실 벽체');
    assert.equal(result.settings.layer, '기계실 벽체');
    assert.equal(layer.aci, 3);
    assert.equal(layer.transparency, 35);
    assert.equal(layer.lineweight, 25);
    assert.equal(layer.description, '검토용 벽체');
    await exactUndoRedo('korean-layer-cli', before, (state) => state.layers);
    await tokens(['LINE', '0,0', '100,0', '']);
    await qa.count(page, 1);
    assert.equal((await qa.drawing(page)).entities[0].layer, '기계실 벽체');
    await variable('CLAYER', '기계실 벽체');
    await passed('native-korean-layer-cli', {
      koreanName: layer.name,
      exactUndoRedo: true,
      assignedNewLine: true,
    });
  }

  await fresh();
  {
    await qa.enter(page, 'LAYER');
    const palette = page.getByTestId('layer-palette');
    await expect(palette).toBeVisible();
    await palette.getByRole('textbox', { name: '새 도면층 이름', exact: true }).fill('전기_조명');
    await palette.getByRole('button', { name: '새 도면층', exact: true }).click();
    await palette
      .locator('tr[data-layer="전기_조명"]')
      .getByRole('button', { name: '전기_조명', exact: true })
      .click();
    await page.keyboard.press('F2');
    const rename = palette.getByRole('textbox', { name: '전기_조명 이름', exact: true });
    await rename.fill('전기_콘센트');
    await rename.press('Enter');
    await expect(palette.locator('tr[data-layer="전기_콘센트"]')).toBeVisible();
    await tokens(['LINE', '0,0', '50,0', '']);
    await qa.count(page, 1);
    await expect(palette).toBeVisible();
    await passed('native-modeless-layer-manager', {
      createdKoreanLayer: true,
      f2Rename: true,
      commandInputWhileOpen: true,
    });
  }

  await fresh();
  {
    await tokens([
      '-LAYER',
      'M',
      'WALLS',
      '',
      'CECOLOR',
      '1',
      'LINE',
      '0,0',
      '100,0',
      '',
      '-LAYER',
      'M',
      'DIMS',
      '',
      'CECOLOR',
      '3',
      'CIRCLE',
      '50,40',
      '10',
      '-LAYER',
      'M',
      '0',
      '',
    ]);
    const view = await qa.mapping(page);
    await page.mouse.move(10, 10);
    const original = await pixels(),
      layers = (await qa.drawing(page)).layers;
    await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
    await page.getByRole('button', { name: 'WALLS 동결', exact: true }).click();
    await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
    await expect.poll(async () => (await pixels()).red).toBe(0);
    const frozen = (await qa.drawing(page)).layers;
    await qa.enter(page, 'U');
    await expect.poll(async () => (await qa.drawing(page)).layers).toEqual(layers);
    await expect.poll(pixels).toEqual(original);
    await qa.enter(page, 'REDO');
    await expect.poll(async () => (await qa.drawing(page)).layers).toEqual(frozen);
    await expect.poll(async () => (await pixels()).red).toBe(0);
    await qa.enter(page, 'U');
    await qa.enter(page, 'LAYISO');
    await qa.point(page, view, 50, 0);
    await qa.enter(page, '');
    await expect
      .poll(async () => (await qa.drawing(page)).layers.find((row) => row.name === 'DIMS')?.locked)
      .toBe(true);
    const isolated = (await qa.drawing(page)).layers;
    await qa.enter(page, 'LAYUNISO');
    assert.deepEqual((await qa.drawing(page)).layers, layers);
    await qa.enter(page, 'U');
    assert.deepEqual((await qa.drawing(page)).layers, isolated);
    await qa.enter(page, 'REDO');
    assert.deepEqual((await qa.drawing(page)).layers, layers);
    await clearSelection();
    await passed('native-ribbon-freeze-layer-isolation', {
      immediateGpuHide: true,
      exactGpuUndo: true,
      exactFlagsUndoRedo: true,
    });
  }

  await fresh([
    'CECOLOR',
    '1',
    'LINE',
    '10,10',
    '40,10',
    '',
    'CECOLOR',
    '3',
    'CIRCLE',
    '70,40',
    '5',
  ]);
  {
    const before = (await qa.drawing(page)).entities;
    await qa.selectAll(page, 2);
    await qa.enter(page, 'PROPERTIES');
    const palette = page.getByTestId('properties-palette');
    const color = palette.getByLabel('색상', { exact: true });
    await expect(color).toHaveAttribute('placeholder', '*다양함*');
    await color.fill('#00ffff');
    await color.press('Enter');
    await expect
      .poll(async () => (await qa.drawing(page)).entities.map((entity) => entity.trueColor))
      .toEqual([0x00ffff, 0x00ffff]);
    await exactUndoRedo('mixed-properties', before);
    await passed('native-mixed-properties', {
      lineAndCircle: true,
      varies: true,
      sharedEdit: true,
      exactUndoRedo: true,
    });
  }

  await fresh();
  {
    const text =
      '; Original native QA library\n*QA_NATIVE,온수 배관\nA,12,-2,["온수,HW",STANDARD,S=2,U=100G,X=-1,Y=.5],-2,[BOX,user.shx,A=90,S=.5],0\n';
    const supportPath = path.join(qa.dir, 'native-온수.lin');
    await fs.writeFile(supportPath, text);
    const bytes = await page.evaluate(
      (filePath) => window.__TAURI_INTERNALS__.invoke('read_support_file', { path: filePath }),
      supportPath,
    );
    assert.equal(Buffer.from(bytes).toString('utf8'), text);
    await qa.enter(page, 'LINETYPE');
    const dialog = page.getByRole('dialog', { name: '선종류 관리자', exact: true });
    await dialog.getByRole('button', { name: '로드...', exact: true }).click();
    await dialog.getByLabel('파일 선택', { exact: true }).setInputFiles({
      name: 'native-korean.lin',
      mimeType: 'text/plain',
      buffer: Buffer.from(text),
    });
    await dialog.getByRole('checkbox', { name: /QA_NATIVE/ }).check();
    await dialog.getByRole('button', { name: '로드', exact: true }).click();
    await dialog.getByRole('button', { name: 'QA_NATIVE', exact: true }).click();
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await expect
      .poll(async () =>
        (await nativeObjects()).some((o) => o.type === 'LTYPE' && o.name === 'QA_NATIVE'),
      )
      .toBe(true);
    const definition = (await nativeObjects()).find(
      (o) => o.type === 'LTYPE' && o.name === 'QA_NATIVE',
    );
    assert.equal(definition.fields.pattern[2].complex.value, '온수,HW');
    assert.equal(definition.fields.pattern[2].complex.uprightRotation, true);
    assert.equal(definition.fields.pattern[2].complex.rotation, 90);
    assert.equal(definition.fields.pattern[3].complex.kind, 'shape');
    assert.equal(definition.fields.pattern[3].complex.source, 'user.shx');
    await tokens(['LINE', '0,0', '100,0', '']);
    assert.equal((await qa.drawing(page)).entities[0].linetype, 'QA_NATIVE');
    await page.reload();
    await page.getByTestId('drawing-canvas').waitFor();
    await expect
      .poll(async () =>
        (await nativeObjects()).find((o) => o.type === 'LTYPE' && o.name === 'QA_NATIVE'),
      )
      .toEqual(definition);
    await passed('native-complex-linetype-recovery', {
      koreanText: true,
      shapeSource: true,
      angularUnits: true,
      exactRecovery: true,
      nativeSupportFileRead: true,
    });
  }

  {
    // Emitted by phase08-styles.spec.ts during the browser acceptance pass.
    const fixture = path.join(qa.root, 'test-artifacts', 'phase08-nested-styles.hcd');
    await fs.access(fixture);
    await page.getByTestId('cad-file-input').setInputFiles(fixture);
    await expect
      .poll(
        async () => (await nativeObjects()).filter((o) => o.type === 'INSERT' && !o.erased).length,
      )
      .toBe(2);
    await qa.mapping(page);
    await page.mouse.move(10, 10);
    await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-entity-count', '3');
    const before = await nativeObjects(),
      original = await pixels();
    assert.ok(original.red > 100 && original.green > 100 && original.blue > 100);
    await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
    await page.getByRole('button', { name: 'WALLS 동결', exact: true }).click();
    await page.getByRole('button', { name: '도면층 목록', exact: true }).click();
    await expect.poll(pixels).toEqual({ red: 0, green: 0, blue: 0, marks: 0 });
    await qa.enter(page, 'U');
    await expect.poll(pixels).toEqual(original);
    await expect.poll(nativeObjects).toEqual(before);
    await page.reload();
    await page.getByTestId('drawing-canvas').waitFor();
    await expect
      .poll(
        async () => (await nativeObjects()).filter((o) => o.type === 'INSERT' && !o.erased).length,
      )
      .toBe(2);
    await qa.mapping(page);
    await page.mouse.move(10, 10);
    await expect.poll(async () => (await pixels()).red).toBeGreaterThan(100);
    await passed('native-nested-block-inheritance', {
      fixture,
      byLayerAndByBlock: true,
      explicitTrueColor: true,
      parentFreeze: true,
      exactGpuUndo: true,
      exactGraphUndo: true,
      recovery: true,
    });
  }
  assert.deepEqual(errors, [], 'No uncaught native WebView2 page errors.');
  assert.equal(completed, 6);
  qa.log('phase08-native-acceptance-complete', {
    passed: completed,
    pageErrors: errors,
    input: 'Actual Tauri/WebView2 with CDP keyboard/mouse; physical Windows IME is not certified.',
  });
} catch (error) {
  if (page) await helpers?.capture('failure-current').catch(() => {});
  await qa.capture(error);
  process.exitCode = 1;
} finally {
  await qa.close();
}
