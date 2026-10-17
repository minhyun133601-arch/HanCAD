import { expect, test, type Page } from '@playwright/test';
import { drawing, enter, mapping, point } from './cad-actions';

async function variable(page: Page, name: string, value: string): Promise<void> {
  await enter(page, name);
  await enter(page, value);
}

test('an initial angle override typed at the command line stays literal while canvas temporary keys remain available', async ({
  page,
}) => {
  await page.goto('/');
  for (const value of ['L', '0,0', '<30', '100', '']) await enter(page, value);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  const line = (await drawing(page)).entities[0];
  if (line?.type !== 'line') throw new Error('Expected LINE');
  expect(line.b.x).toBeCloseTo(50 * Math.sqrt(3), 10);
  expect(line.b.y).toBeCloseTo(-50, 10);
});

test('LINE modifier sequence produces exact WCS coordinates in one undo group', async ({
  page,
}) => {
  await page.goto('/');
  await variable(page, 'OSMODE', '0');
  await enter(page, 'L');
  await enter(page, '100,50');
  await enter(page, '@100<30');
  await enter(page, '#0,0');
  await enter(page, '.X');
  await enter(page, '80,999');
  await enter(page, '0,40');
  await enter(page, 'FROM');
  await enter(page, '100,100');
  await enter(page, '@10,10');
  await enter(page, 'M2P');
  await enter(page, '0,0');
  await enter(page, '20,40');
  await enter(page, 'TT');
  await enter(page, '30,30');
  await enter(page, '50,50');
  await enter(page, '');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('6');
  const lines = (await drawing(page)).entities;
  expect(lines[0]).toMatchObject({ a: { x: 100, y: -50 } });
  if (lines[0]?.type !== 'line') throw new Error('Expected LINE');
  expect(lines[0].b.x).toBeCloseTo(100 + 50 * Math.sqrt(3), 10);
  expect(lines[0].b.y).toBeCloseTo(-100, 10);
  expect(lines[1]).toMatchObject({ b: { x: 0, y: 0 } });
  expect(lines[2]).toMatchObject({ b: { x: 80, y: -40 } });
  expect(lines[3]).toMatchObject({ b: { x: 110, y: -110 } });
  expect(lines[4]).toMatchObject({ b: { x: 10, y: -20 } });
  expect(lines[5]).toMatchObject({ b: { x: 50, y: -50 } });
  await enter(page, 'U');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('0');
  await enter(page, 'REDO');
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('6');
});

test('stationary endpoint hover acquires two paths and mouse pick uses their exact intersection', async ({
  page,
}) => {
  await page.goto('/');
  for (const tokens of [
    ['L', '40,0', '70,0', ''],
    ['L', '0,60', '0,90', ''],
  ])
    for (const token of tokens) await enter(page, token);
  const view = await mapping(page);
  await variable(page, 'OSMODE', '1');
  await variable(page, 'AUTOSNAP', '63');
  await variable(page, 'POLARMODE', '0');
  await variable(page, 'DYNMODE', '0');
  await enter(page, 'L');
  const canvas = page.getByTestId('drawing-canvas');
  await point(page, view, 40, 0, false);
  await expect(canvas).toHaveAttribute('data-tracking-points', '1');
  await point(page, view, 0, 60, false);
  await expect(canvas).toHaveAttribute('data-tracking-points', '2');
  await point(page, view, 40.2, 60.1, false);
  await expect(canvas).toHaveAttribute('data-tracking-paths', '2');
  await expect(canvas).toHaveAttribute('data-tracking-tooltip', /추적:/);
  await point(page, view, 40.2, 60.1);
  await enter(page, '100,100');
  await enter(page, '');
  const line = (await drawing(page)).entities[2];
  expect(line).toMatchObject({ a: { x: 40, y: -60 }, b: { x: 100, y: -100 } });
});

test('temporary endpoint and Ortho keys, polar direct distance and F-key states apply live', async ({
  page,
}) => {
  await page.goto('/');
  for (const token of ['L', '0,0', '100,0', '']) await enter(page, token);
  const view = await mapping(page);
  await variable(page, 'OSMODE', '2');
  await variable(page, 'AUTOSNAP', '63');
  await variable(page, 'ORTHOMODE', '0');
  await variable(page, 'DYNMODE', '0');
  await enter(page, 'L');
  await point(page, view, 0.1, 0.1, false);
  await page.keyboard.down('Shift');
  await page.keyboard.down('e');
  await point(page, view, 0.1, 0.1);
  await page.keyboard.up('e');
  await page.keyboard.up('Shift');
  await page.keyboard.down('Shift');
  await point(page, view, 20, 8);
  await page.keyboard.up('Shift');
  await enter(page, '');
  expect((await drawing(page)).entities[1]).toMatchObject({ a: { x: 0, y: 0 } });
  const line = (await drawing(page)).entities[1];
  if (line?.type !== 'line') throw new Error('Expected LINE');
  expect(line.b.y).toBeCloseTo(0, 12);
  await variable(page, 'POLARANG', '30');
  await enter(page, 'L');
  await enter(page, '0,0');
  await point(page, view, 20, 20 / Math.sqrt(3), false);
  await expect(page.getByTestId('drawing-canvas')).toHaveAttribute(
    'data-tracking-tooltip',
    /극좌표:/,
  );
  await enter(page, '100');
  await enter(page, '');
  const polar = (await drawing(page)).entities[2];
  if (polar?.type !== 'line') throw new Error('Expected LINE');
  expect(polar.b.x).toBeCloseTo(50 * Math.sqrt(3), 8);
  expect(polar.b.y).toBeCloseTo(-50, 8);
  for (const [key, name] of [
    ['F3', 'OSMODE'],
    ['F8', 'ORTHOMODE'],
    ['F10', 'AUTOSNAP'],
    ['F11', 'AUTOSNAP'],
    ['F12', 'DYNMODE'],
  ] as const) {
    await page.getByTestId('drawing-canvas').focus();
    await page.keyboard.press(key);
    await expect(page.getByRole('log', { name: '명령 기록' })).not.toContainText(`${name} 기능은`);
  }
});
