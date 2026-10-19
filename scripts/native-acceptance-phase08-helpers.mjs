import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

export function phase08Helpers(qa, page) {
  const tokens = async (values) => {
    for (const value of values) await qa.enter(page, value);
  };
  const nativeObjects = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('hancad.active-drawing.v1') || '{}').nativeDatabase
          ?.objects || [],
    );
  async function fresh(values = []) {
    await tokens([
      'NEW',
      'OSMODE',
      '0',
      'ORTHOMODE',
      '0',
      'SNAPMODE',
      '0',
      'DYNMODE',
      '0',
      'GRIDMODE',
      '0',
      'SETVAR',
      'UCSICON',
      '0',
      'PICKFIRST',
      '1',
      'QPMODE',
      '0',
      ...values,
    ]);
    await qa.idle(page);
  }
  async function capture(name) {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await qa.snapshot(page, name);
    await fs.writeFile(
      path.join(qa.dir, `${name}-native.json`),
      JSON.stringify(await nativeObjects(), null, 2),
    );
  }
  async function clearSelection() {
    await qa.shortcut(page, 'Escape');
    await qa.shortcut(page, 'Escape');
  }
  async function exactUndoRedo(name, before, project = (state) => state.entities) {
    const after = project(await qa.drawing(page));
    await qa.enter(page, 'U');
    await qa.idle(page);
    assert.deepEqual(
      project(await qa.drawing(page)),
      before,
      `${name}: one U restores exact source.`,
    );
    await capture(`${name}-undo`);
    await qa.enter(page, 'REDO');
    await qa.idle(page);
    assert.deepEqual(
      project(await qa.drawing(page)),
      after,
      `${name}: REDO restores exact result.`,
    );
    await capture(`${name}-redo`);
  }
  async function pixels() {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    return page.getByTestId('drawing-canvas').evaluate((node) => {
      const gl = node.getContext('webgl2');
      if (!gl) throw new Error('Expected WebGL2 model renderer.');
      const bytes = new Uint8Array(node.width * node.height * 4);
      gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      let red = 0,
        green = 0,
        blue = 0,
        marks = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        const r = bytes[i],
          g = bytes[i + 1],
          b = bytes[i + 2];
        if (r > 100 && g < 100 && b < 100) red++;
        if (g > 100 && r < 100 && b < 100) green++;
        if (b > 100 && r < 100 && g < 100) blue++;
        if (r !== 33 || g !== 40 || b !== 48) marks++;
      }
      return { red, green, blue, marks };
    });
  }
  async function variable(name, value) {
    await tokens(['GETVAR', name]);
    await expect(page.getByRole('log').locator('.history-line').last()).toHaveText(
      `${name} = ${value}`,
    );
  }
  return { tokens, nativeObjects, fresh, capture, clearSelection, exactUndoRedo, pixels, variable };
}
