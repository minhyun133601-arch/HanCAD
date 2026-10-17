import { expect, test, type Page } from '@playwright/test';
import { enter, mapping, point } from './cad-actions';

async function amberAt(page: Page, x: number, y: number): Promise<number> {
  return page.getByTestId('drawing-canvas').evaluate(
    (canvas, location) => {
      const overlay = canvas.parentElement?.querySelector<HTMLCanvasElement>('canvas[aria-hidden]');
      if (!overlay) throw new Error('Missing drawing overlay');
      const scale = overlay.width / overlay.getBoundingClientRect().width;
      const context = overlay.getContext('2d');
      if (!context) throw new Error('Missing overlay context');
      const pixels = context.getImageData(
        Math.round(location.x * scale) - 3,
        Math.round(location.y * scale) - 3,
        7,
        7,
      ).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          pixels[i]! > 180 &&
          pixels[i + 1]! > 90 &&
          pixels[i + 1]! < 220 &&
          pixels[i + 2]! < 90 &&
          pixels[i + 3]! > 120
        )
          count++;
      return count;
    },
    { x, y },
  );
}

test('locking length and angle redraws the LINE preview before another mouse move', async ({
  page,
}) => {
  await page.goto('/');
  for (const value of ['L', '0,0', '200,200', '', 'OSMODE', '0', 'AUTOSNAP', '0', 'DYNMODE', '3'])
    await enter(page, value);
  const view = await mapping(page);
  await enter(page, 'L');
  await enter(page, '0,0');
  await point(page, view, 40, 10, false);
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.type('100');
  await page.keyboard.press('Tab');
  await page.keyboard.type('30');
  await page.keyboard.press('Tab');
  const end = {
    x: view.width / 2 + (50 * Math.sqrt(3) - view.originX) * view.zoom,
    y: view.height / 2 + (-50 - view.originY) * view.zoom,
  };
  await expect.poll(() => amberAt(page, end.x, end.y)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      amberAt(
        page,
        view.width / 2 + (40 - view.originX) * view.zoom,
        view.height / 2 + (-10 - view.originY) * view.zoom,
      ),
    )
    .toBe(0);
});
