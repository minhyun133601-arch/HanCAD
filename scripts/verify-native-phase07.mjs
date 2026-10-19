import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { nativeAcceptance } from './native-acceptance-runtime.mjs';
import { verifyNativeQuickTrim } from './native-acceptance-trim.mjs';

const qa = await nativeAcceptance('phase07-native-runtime', 9237);
const { enter, drawing, count, idle, mapping, point, snapshot, log } = qa;
let page;
let completed = 0;

async function tokens(values) {
  for (const value of values) await enter(page, value);
}
async function fresh(values = []) {
  await tokens([
    'NEW',
    'OSMODE',
    '0',
    'ORTHOMODE',
    '0',
    'SNAPMODE',
    '0',
    'AUTOSNAP',
    '0',
    'DYNMODE',
    '0',
    'COMMANDPREVIEW',
    '1',
    'PICKFIRST',
    '1',
    'QPMODE',
    '0',
    'SELECTIONCYCLING',
    '0',
    ...values,
  ]);
  await idle(page);
}
async function all(command) {
  await tokens([command, 'ALL', '']);
}
async function capture(name) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await snapshot(page, name);
}
function graph(state) {
  return {
    entities: state.entities,
    clipboardBlocks: state.clipboardBlocks ?? [],
    groups: state.groups ?? [],
    mlineStyles: state.mlineStyles ?? [],
  };
}
async function undoRedo(name, before) {
  await idle(page);
  const after = await drawing(page);
  await capture(`${name}-accepted`);
  await enter(page, 'U');
  await idle(page);
  assert.deepEqual(
    graph(await drawing(page)),
    graph(before),
    `${name}: one U restores the complete source graph`,
  );
  await capture(`${name}-undo`);
  await enter(page, 'REDO');
  await idle(page);
  assert.deepEqual(
    graph(await drawing(page)),
    graph(after),
    `${name}: REDO restores exact identities and geometry`,
  );
  // Fit only after checking U/REDO: navigation itself can occupy the undo journal.
  await mapping(page);
  await capture(`${name}-rendered`);
  completed++;
  log(name, {
    beforeCount: before.entities.length,
    afterCount: after.entities.length,
    beforeIds: before.entities.map((entity) => entity.id),
    afterIds: after.entities.map((entity) => entity.id),
    exactUndo: true,
    exactRedo: true,
    snapshots: [`${name}-accepted`, `${name}-undo`, `${name}-rendered`],
  });
}
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-9, `${actual} equals ${expected} within 1e-9`);
}

try {
  page = await qa.connect('modify', qa.port);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  log(
    'native-phase07-assets',
    await page.evaluate(() => [...document.scripts].map((script) => script.src).filter(Boolean)),
  );

  for (const command of ['MOVE', 'ROTATE', 'COPY']) {
    await fresh(['L', '0,0', '100,0', '', 'COPYMODE', '0']);
    const before = await drawing(page);
    await mapping(page);
    await all(command);
    if (command === 'MOVE') {
      await tokens(['D', '20,30']);
      const entity = (await drawing(page)).entities[0];
      assert.equal(entity.id, before.entities[0].id);
      qa.assertPoint(entity.a, { x: 20, y: -30 });
      qa.assertPoint(entity.b, { x: 120, y: -30 });
    } else if (command === 'ROTATE') {
      await tokens(['0,0', 'R', '0,0', '100,0', 'P', '20,20', '20,120']);
      const entity = (await drawing(page)).entities[0];
      assert.equal(entity.id, before.entities[0].id);
      close(entity.b.x, 0);
      close(entity.b.y, -100);
    } else {
      await tokens(['0,0', 'A', '4', 'F', '300,0']);
      await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '3');
      assert.deepEqual((await drawing(page)).entities, before.entities);
      await capture('copy-array-fit-provisional');
      await qa.shortcut(page, 'Escape');
      await count(page, 4);
      assert.deepEqual(
        (await drawing(page)).entities.map((entity) => entity.a.x),
        [0, 100, 200, 300],
      );
    }
    await undoRedo(`native-${command.toLowerCase()}`, before);
  }

  for (const gap of [0, 1, 2]) {
    await fresh([
      'PLINE',
      '0,0',
      '100,0',
      'A',
      '100,100',
      'L',
      '0,100',
      'C',
      'OFFSETGAPTYPE',
      String(gap),
    ]);
    const before = await drawing(page),
      view = await mapping(page);
    await tokens(['OFFSET', '10']);
    await point(page, view, 50, 100);
    await point(page, view, 50, 105, false);
    await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-preview-count', '1');
    assert.deepEqual((await drawing(page)).entities, before.entities);
    await capture(`offset-gap-${gap}-provisional`);
    await point(page, view, 50, 105);
    await enter(page, '');
    await count(page, 2);
    const entity = (await drawing(page)).entities[1];
    assert.equal(entity.type, 'polyline');
    assert.equal(entity.closed, true);
    assert.equal(entity.curve.type, 'LWPOLYLINE');
    assert.equal(entity.points.length, gap === 0 ? 4 : 6);
    assert.equal(entity.bulges.filter((bulge) => Math.abs(bulge) > 1e-8).length, gap === 1 ? 3 : 1);
    if (gap === 0)
      for (const [x, y] of [
        [-10, 10],
        [-10, -110],
      ])
        assert.ok(entity.points.some((p) => p.x === x && p.y === y));
    await undoRedo(`native-offset-gap-${gap}`, before);
  }

  await fresh(['LINE', '10,0', '100,0', '', 'LINE', '0,10', '0,100', '', 'FILLETRAD', '25']);
  {
    const before = await drawing(page),
      view = await mapping(page),
      canvas = page.getByTestId('drawing-canvas');
    await enter(page, 'FILLET');
    await point(page, view, 80, 0);
    await point(page, view, 0, 80, false);
    await expect(canvas).toHaveAttribute('data-preview-count', '3');
    await page.keyboard.down('Shift');
    try {
      await point(page, view, 0, 75, false);
      await expect(canvas).toHaveAttribute('data-preview-count', '2');
      await capture('fillet-shift-zero-radius-provisional');
      await point(page, view, 0, 75);
    } finally {
      await page.keyboard.up('Shift');
    }
    await idle(page);
    const result = (await drawing(page)).entities;
    assert.equal(result.length, 2);
    for (const entity of result) {
      assert.equal(entity.type, 'line');
      qa.assertPoint(entity.a, { x: 0, y: 0 });
    }
    await tokens(['GETVAR', 'FILLETRAD']);
    await expect(
      page.getByRole('log', { name: '명령 기록' }).locator('.history-line').last(),
    ).toHaveText('FILLETRAD = 25');
    await undoRedo('native-fillet-shift-sharp', before);
  }

  await verifyNativeQuickTrim(qa, page, { fresh, capture, undoRedo });

  await fresh(['LINE', '0,0', '40,0', '', 'LINE', '100,0', '60,0', '']);
  {
    const before = await drawing(page);
    await all('JOIN');
    await count(page, 1);
    const entity = (await drawing(page)).entities[0];
    assert.equal(entity.type, 'line');
    qa.assertPoint(entity.a, { x: 0, y: 0 });
    qa.assertPoint(entity.b, { x: 100, y: 0 });
    await undoRedo('native-join-collinear-line', before);
  }

  await fresh(['LINE', '0,0', '100,0', '', 'ARC', '100,0', 'C', '100,50', '150,50']);
  {
    const beforeJoin = await drawing(page);
    await all('JOIN');
    await count(page, 1);
    const entity = (await drawing(page)).entities[0];
    assert.equal(entity.type, 'polyline');
    assert.equal(entity.curve.type, 'LWPOLYLINE');
    close(Math.abs(entity.bulges[1]), Math.tan(Math.PI / 8));
    await undoRedo('native-join-line-arc-polyline', beforeJoin);
    const view = await mapping(page);
    await enter(page, 'PEDIT');
    await point(page, view, 50, 0);
    await tokens(['W', '5', 'L', 'ON', '']);
    const beforeExplode = await drawing(page);
    assert.equal(beforeExplode.entities[0].constantWidth, 5);
    await all('EXPLODE');
    await count(page, 2);
    assert.deepEqual(
      (await drawing(page)).entities.map((e) => e.type),
      ['line', 'arc'],
    );
    await expect(page.getByRole('log', { name: '명령 기록' })).toContainText('폭 및 접선 정보');
    await undoRedo('native-explode-wide-polyline', beforeExplode);
  }

  await fresh(['LINE', '0,0', '100,0', '', 'LINE', '50,0', '150,0', '']);
  {
    const before = await drawing(page);
    await mapping(page);
    await all('OVERKILL');
    const dialog = page.getByRole('dialog', { name: '중복 객체 삭제', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('-1');
    await expect(dialog.getByRole('button', { name: '확인', exact: true })).toBeDisabled();
    await capture('overkill-invalid-tolerance-dialog');
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    assert.deepEqual(graph(await drawing(page)), graph(before));
    await all('OVERKILL');
    await expect(dialog).toBeVisible();
    await capture('overkill-valid-options-dialog');
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await count(page, 1);
    const entity = (await drawing(page)).entities[0];
    qa.assertPoint(entity.a, { x: 0, y: 0 });
    qa.assertPoint(entity.b, { x: 150, y: 0 });
    await undoRedo('native-overkill-dialog-overlap', before);
  }

  await fresh(['LINE', '0,0', '100,0', '']);
  {
    const before = await drawing(page);
    await mapping(page);
    await all('CHPROP');
    await tokens(['C', 'T', '12,34,56', 'LW', '0.26', 'T', '20', 'TR', '35', '']);
    const entity = (await drawing(page)).entities[0];
    assert.equal(entity.trueColor, 0x0c2238);
    assert.equal(entity.lineweight, 25);
    assert.equal(entity.thickness, 20);
    assert.equal(entity.transparency, 35);
    await undoRedo('native-chprop-properties', before);
  }
  assert.deepEqual(errors, [], 'No uncaught native WebView page errors.');
  assert.equal(completed, 13);
  log('phase07-native-acceptance-complete', {
    passed: completed,
    pageErrors: errors,
    input: 'WebView2 CDP-dispatched keyboard/mouse, not physical SendInput',
  });
} catch (error) {
  if (page) {
    await capture('failure-current').catch(() => {});
    log(
      'failure-command-history',
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
