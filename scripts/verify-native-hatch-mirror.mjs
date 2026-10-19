import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { nativeAcceptance } from './native-acceptance-runtime.mjs';

// Fixtures are emitted by the production-browser HCD acceptance spec first.
const qa = await nativeAcceptance('phase07-native-hatch-mirror', 9239);
let page;
const nativeObjects = () =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('hancad.active-drawing.v1') || '{}').nativeDatabase
        ?.objects || [],
  );
const activeHatches = async () =>
  (await nativeObjects()).filter((o) => o.type === 'HATCH' && !o.erased);
const number = (groups, code) => {
  const value = groups.find((g) => g.code === code)?.value;
  assert.equal(typeof value, 'number', `Numeric DXF group ${code} exists.`);
  return value;
};
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${actual} equals ${expected}`);
function section(groups, from, to) {
  const start = groups.findIndex((g) => g.code === from),
    end = to === undefined ? groups.length : groups.findIndex((g, i) => i > start && g.code === to);
  assert.ok(start >= 0 && end >= start, `HATCH section ${from}/${to} exists.`);
  return groups.slice(start, end);
}
function coordinates(groups, code, expected) {
  const actual = groups.filter((g) => g.code === code).map((g) => g.value);
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => close(value, expected[i]));
}
function verifyDefinition(hatch, mode) {
  const boundary = section(hatch.groups, 92, 75),
    pattern = section(hatch.groups, 75, 98),
    seed = section(hatch.groups, 98);
  coordinates(boundary, 10, [-2, -8, -8, -2]);
  coordinates(boundary, 20, [1, 1, 6, 6]);
  coordinates(boundary, 42, [-0.25, 0, 0, 0]);
  close(number(pattern, 52), mode ? 150 : 30);
  close(number(pattern, 53), mode ? 105 : 75);
  close(number(pattern, 43), -2);
  close(number(pattern, 44), 3);
  close(number(pattern, 45), mode ? 4 : -4);
  close(number(pattern, 46), 5);
  assert.equal(number(pattern, 41), 2);
  assert.deepEqual(
    pattern.filter((g) => g.code === 49).map((g) => g.value),
    [2, -1, 0],
  );
  close(number(seed, 10), -5);
  close(number(seed, 20), 4);
  assert.equal(number(hatch.groups, 71), 0);
  assert.equal(hatch.groups.find((g) => g.code === 2)?.value, 'QA_PATTERN');
  assert.equal(hatch.fields.layer, '0');
  assert.equal(hatch.fields.color, 3);
  assert.deepEqual(hatch.xdata, { HANCAD_QA: [{ code: 1000, value: 'native-pattern-metadata' }] });
}
async function tokens(values) {
  for (const value of values) await qa.enter(page, value);
}
async function capture(name) {
  await qa.snapshot(page, name);
  await fs.writeFile(
    path.join(qa.dir, `${name}-native.json`),
    JSON.stringify(await nativeObjects(), null, 2),
  );
}
try {
  page = await qa.connect('hatch-mirror-final', qa.port);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  qa.log(
    'native-hatch-assets',
    await page.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean)),
  );
  for (const mode of [0, 1]) {
    const fixture = path.join(
      qa.root,
      'test-artifacts',
      `phase07-native-hatch-mirror-mode${mode}.hcd`,
    );
    await fs.access(fixture);
    const tabs = page.locator('.file-tab'),
      previousTabs = await tabs.count();
    await page.getByTestId('cad-file-input').setInputFiles(fixture);
    await expect(tabs).toHaveCount(previousTabs + 1);
    await expect(page.locator('.file-tab[aria-current="page"]')).toHaveText(path.basename(fixture));
    await expect.poll(async () => (await activeHatches()).length).toBe(1);
    await tokens([
      'OSMODE',
      '0',
      'ORTHOMODE',
      '0',
      'SNAPMODE',
      '0',
      'DYNMODE',
      '0',
      'MIRRHATCH',
      String(mode),
    ]);
    const before = await nativeObjects(),
      beforeEntities = (await qa.drawing(page)).entities,
      original = (await activeHatches())[0];
    assert.equal(
      beforeEntities.length,
      mode ? 1 : 0,
      'The imported HCD fixture has the expected legacy contents.',
    );
    await capture(`mirrhatch${mode}-source`);
    await tokens(['MIRROR', 'ALL', '', '0,0', '0,100', mode ? 'Y' : 'N']);
    await qa.idle(page);
    await expect.poll(async () => (await activeHatches()).length).toBe(mode ? 1 : 2);
    const after = await nativeObjects(),
      afterEntities = (await qa.drawing(page)).entities,
      hatch = (await activeHatches()).find((o) => o.handle !== original.handle);
    assert.ok(hatch);
    verifyDefinition(hatch, mode);
    assert.equal(after.find((o) => o.handle === original.handle)?.erased, mode === 1);
    if (!mode) assert.deepEqual(afterEntities, beforeEntities);
    else {
      assert.equal(afterEntities.length, 1);
      close(afterEntities[0].a.x, -10);
      close(afterEntities[0].a.y, -10);
      close(afterEntities[0].b.x, -20);
      close(afterEntities[0].b.y, -10);
    }
    await expect(page.getByRole('log', { name: '명령 기록' })).toContainText(
      'HATCH 패턴 화면 표시는 아직 지원하지 않습니다.',
    );
    await capture(`mirrhatch${mode}-accepted`);
    await tokens(['MIRROR', 'P', '']);
    if (!mode) {
      await expect(page.locator('.command-prompt')).toContainText('대칭선의 첫 번째 점 지정');
      await page.keyboard.press('Escape');
    }
    await qa.idle(page);
    assert.deepEqual(
      await nativeObjects(),
      after,
      'Previous inquiry never mutates native geometry.',
    );
    await qa.enter(page, 'U');
    await qa.idle(page);
    await expect.poll(nativeObjects).toEqual(before);
    assert.deepEqual((await qa.drawing(page)).entities, beforeEntities);
    await capture(`mirrhatch${mode}-undo`);
    await qa.enter(page, 'REDO');
    await qa.idle(page);
    await expect.poll(nativeObjects).toEqual(after);
    assert.deepEqual((await qa.drawing(page)).entities, afterEntities);
    await capture(`mirrhatch${mode}-redo`);
    await page.reload();
    await expect.poll(nativeObjects).toEqual(after);
    assert.deepEqual((await qa.drawing(page)).entities, afterEntities);
    await capture(`mirrhatch${mode}-reloaded`);
    await qa.mapping(page);
    await capture(`mirrhatch${mode}-rendered`);
    qa.log(`native-mirrhatch-${mode}`, {
      fixture,
      oldHandle: original.handle,
      newHandle: hatch.handle,
      mirrorPattern: mode === 1,
      eraseSource: mode === 1,
      legacyCount: afterEntities.length,
      exactNativeUndo: true,
      exactNativeRedo: true,
      recoveryReload: true,
      previousSelection: mode ? 'erased source pruned' : 'retained original reacquired',
      boundaryAndPatternDefinition: 'verified',
      patternRenderer: 'unsupported; explicitly reported',
      snapshots: ['source', 'accepted', 'undo', 'redo', 'reloaded', 'rendered'].map(
        (stage) => `mirrhatch${mode}-${stage}`,
      ),
    });
  }
  assert.deepEqual(errors, []);
  qa.log('native-hatch-mirror-complete', {
    passed: 2,
    pageErrors: errors,
    input: 'WebView2 CDP keyboard; imported native HCD fixtures',
  });
} catch (error) {
  if (page) {
    await capture('failure-current').catch(() => {});
    qa.log(
      'failure-history',
      await page
        .getByRole('log', { name: '명령 기록' })
        .innerText()
        .catch(() => ''),
    );
  }
  await qa.capture(error);
  process.exitCode = 1;
} finally {
  await qa.close();
}
