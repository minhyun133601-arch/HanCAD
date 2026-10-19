import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
export async function verifyNativeGrips(qa, a) {
  const { assertPoint, log, enter, drawing, mapping, point, drag, snapshot } = qa;
  await enter(a, 'NEW');
  for (const token of [
    'L',
    '0,0',
    '40,0',
    '',
    'L',
    '80,20',
    '120,20',
    '',
    'QPMODE',
    '0',
    'PICKAUTO',
    '1',
  ])
    await enter(a, token);
  let view = await mapping(a);
  const canvas = a.getByTestId('drawing-canvas');
  await drag(
    a,
    view,
    [
      [-10, -10],
      [50, 10],
    ],
    'window',
    'native-window-blue',
  );
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await a.keyboard.press('Escape');
  await drag(
    a,
    view,
    [
      [100, 30],
      [20, -10],
    ],
    'crossing',
    'native-crossing-green',
  );
  await expect(canvas).toHaveAttribute('data-selection-count', '2');
  await a.keyboard.down('Shift');
  await point(a, view, 10, 0);
  await a.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await a.keyboard.press('Escape');
  await enter(a, 'PICKAUTO');
  await enter(a, '5');
  await drag(
    a,
    view,
    [
      [-10, 10],
      [50, 10],
      [50, -10],
      [-10, -10],
      [-10, 10],
    ],
    'lasso',
    'native-lasso',
  );
  await expect(canvas).toHaveAttribute('data-selection-count', '1');
  await enter(a, 'MOVE');
  await enter(a, '0,0');
  await enter(a, '10,0');
  assertPoint((await drawing(a)).entities[0].a, { x: 10, y: 0 });
  await enter(a, 'MOVE');
  await enter(a, 'ALL');
  await enter(a, '');
  await enter(a, '0,0');
  await enter(a, '@10,0');
  assertPoint((await drawing(a)).entities[0].a, { x: 20, y: 0 });
  log(
    'native-directional-lasso-shift-noun-verb',
    'passed native WebView pointer events; screenshots include blue/green/lasso overlays',
  );
  await enter(a, 'NEW');
  for (const token of ['L', '10,10', '110,10', '']) await enter(a, token);
  view = await mapping(a);
  await point(a, view, 45, 10);
  await point(a, view, 10, 10);
  for (const mode of ['이동', '회전', '축척']) {
    await a.keyboard.press('Space');
    await expect(a.locator('.command-prompt')).toContainText(mode);
  }
  await enter(a, '2');
  assertPoint((await drawing(a)).entities[0].a, { x: 10, y: -10 });
  assertPoint((await drawing(a)).entities[0].b, { x: 210, y: -10 });
  await snapshot(a, 'native-grip-scaled');
  await enter(a, 'U');
  await enter(a, 'REDO');
  assertPoint((await drawing(a)).entities[0].b, { x: 210, y: -10 });
  log('native-grip-space-three-scale-two', 'passed exact geometry plus undo/redo');
  await enter(a, 'NEW');
  for (const token of ['PL', '0,0', '100,0', '100,60', '']) {
    await enter(a, token);
    log('pline-token', {
      token,
      prompt: await a.locator('.command-prompt').innerText(),
      entities: (await drawing(a)).entities.length,
    });
  }
  view = await mapping(a);
  await point(a, view, 40, 0);
  await point(a, view, 0, 0, false);
  let menu = a.getByRole('menu', { name: '그립 편집', exact: true });
  await expect(menu).toBeVisible();
  for (const name of ['정점 추가(A)', '정점 제거(R)', '호로 변환(C)'])
    await expect(a.getByRole('menuitem', { name, exact: true })).toBeVisible();
  await a.getByRole('menuitem', { name: '정점 추가(A)', exact: true }).click();
  await enter(a, '50,20');
  assert.equal((await drawing(a)).entities[0].points.length, 4);
  await point(a, view, 50, 20, false);
  await expect(menu).toBeVisible();
  await a.getByRole('menuitem', { name: '정점 제거(R)', exact: true }).click();
  assert.equal((await drawing(a)).entities[0].points.length, 3);
  await point(a, view, 0, 0, false);
  await expect(menu).toBeVisible();
  await a.getByRole('menuitem', { name: '호로 변환(C)', exact: true }).click();
  await enter(a, '50,50');
  assert.ok(Math.abs((await drawing(a)).entities[0].bulges[0] - 1) < 1e-9);
  await snapshot(a, 'native-polyline-arc');
  log('native-polyline-multifunction', 'passed Add/Remove Vertex and Convert to Arc');
}
