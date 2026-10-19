import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer } from 'node:net';

export async function requireFreeNativePort(port) {
  await new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once('error', (error) =>
      reject(new Error(`Native QA requires a free local CDP port: ${port}`, { cause: error })),
    );
    reservation.listen({ port, host: '127.0.0.1', exclusive: true }, () =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
  });
}

export async function nativeAcceptance(outputName, defaultPort) {
  const { values } = parseArgs({
    options: {
      workspace: { type: 'string' },
      binary: { type: 'string' },
      port: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      `Usage: node scripts/${path.basename(process.argv[1])} [--workspace path] [--binary path] [--port basePort]`,
    );
    process.exit(0);
  }
  const root = path.resolve(
    values.workspace ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
  const dir = path.join(root, 'test-artifacts', outputName);
  const executable = path.resolve(root, values.binary ?? 'target/release/hancad-desktop.exe');
  const port = values.port === undefined ? defaultPort : Number(values.port);
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65534, 'Invalid local CDP port.');
  await fs.access(executable);
  await fs.mkdir(dir, { recursive: true });
  const processes = [],
    browsers = [],
    results = [];
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function assertPoint(actual, expected) {
    assert.equal(actual.x, expected.x);
    assert.equal(actual.y, expected.y);
    assert.equal(actual.z || 0, expected.z || 0);
  }
  function log(check, evidence) {
    results.push({ check, evidence });
    console.log(check, JSON.stringify(evidence));
  }
  async function connect(name, port) {
    await requireFreeNativePort(port);
    const userData = path.join(dir, `profile-${name}`);
    const child = spawn(executable, [], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        WEBVIEW2_USER_DATA_FOLDER: userData,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    processes.push(child);
    child.stdout.on('data', (x) => console.log(`${name} stdout:`, String(x)));
    child.stderr.on('data', (x) => console.log(`${name} stderr:`, String(x)));
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      if (child.exitCode !== null) throw new Error(`${name} exited ${child.exitCode}`);
      await pause(200);
    }
    assert.ok(ready, `${name} native WebView2 CDP available`);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    browsers.push(browser);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || (await context.waitForEvent('page'));
    page.setDefaultTimeout(10000);
    await page.getByTestId('drawing-canvas').waitFor();
    assert.equal(await page.evaluate(() => '__TAURI_INTERNALS__' in window), true);
    const info = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('platform_info'));
    assert.deepEqual(info, { mode: 'desktop', capabilities: ['clipboard'] });
    log(`native-${name}`, { pid: child.pid, url: page.url(), info });
    return page;
  }
  async function enter(page, value) {
    await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
    for (const character of value) {
      if (character === '@') await page.keyboard.press('Shift+Digit2');
      else await page.keyboard.type(character);
    }
    await page.keyboard.press('Enter');
  }
  const drawing = (page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem('hancad.active-drawing.v1') || '{}').state);
  const count = (page, value) =>
    expect(page.getByTestId('drawing-entity-count')).toHaveText(String(value));
  const idle = (page) => expect(page.locator('.command-prompt')).toHaveText('명령:');
  async function selectAll(page, size = 1) {
    await page.getByTestId('drawing-canvas').focus();
    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('drawing-canvas')).toHaveAttribute(
      'data-selection-count',
      String(size),
    );
  }
  async function shortcut(page, chord) {
    await page.getByTestId('drawing-canvas').focus();
    await page.keyboard.press(chord);
  }
  async function snapshot(page, name) {
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
    await fs.writeFile(
      path.join(dir, `${name}.json`),
      JSON.stringify(await drawing(page), null, 2),
    );
  }
  async function mapping(page) {
    await enter(page, 'ZOOM');
    await enter(page, 'E');
    await idle(page);
    await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-view-transition', '0');
    await enter(page, 'ZOOM');
    await enter(page, '0.8X');
    await idle(page);
    await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-view-transition', '0');
    await enter(page, 'GETVAR');
    await enter(page, 'VIEWCTR');
    const text = await page
      .getByRole('log', { name: '명령 기록' })
      .locator('.history-line')
      .last()
      .innerText();
    const center = text.split(' = ')[1].split(',').map(Number);
    return page.getByTestId('drawing-canvas').evaluate((node, center) => {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        zoom: Number(node.dataset.zoom),
        originX: center[0],
        originY: -center[1],
      };
    }, center);
  }
  async function point(page, view, x, y, click = true) {
    const sx = view.x + view.width / 2 + (x - view.originX) * view.zoom,
      sy = view.y + view.height / 2 + (-y - view.originY) * view.zoom;
    if (click) await page.mouse.click(sx, sy);
    else await page.mouse.move(sx, sy);
  }
  async function drag(page, view, points, area, screenshot) {
    await point(page, view, ...points[0], false);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) await point(page, view, x, y, false);
    await expect(page.getByTestId('drawing-canvas')).toHaveAttribute('data-selection-area', area);
    if (screenshot) await page.screenshot({ path: path.join(dir, `${screenshot}.png`) });
    await page.mouse.up();
  }

  async function capture(error) {
    log('failure', { message: error.message, stack: error.stack });
    for (let i = 0; i < browsers.length; i++)
      for (const page of browsers[i].contexts()[0].pages()) {
        await page.screenshot({ path: path.join(dir, `failure-${i}.png`) }).catch(() => {});
        console.log(
          'failure-history',
          i,
          await page
            .getByRole('log', { name: '명령 기록' })
            .innerText()
            .catch(() => ''),
        );
      }
  }
  async function close() {
    await fs.writeFile(path.join(dir, 'results.json'), JSON.stringify(results, null, 2));
    for (const browser of browsers) await browser.close().catch(() => {});
    for (const child of processes) child.kill();
  }
  return {
    root,
    dir,
    port,
    assertPoint,
    log,
    connect,
    enter,
    drawing,
    count,
    idle,
    selectAll,
    shortcut,
    snapshot,
    mapping,
    point,
    drag,
    capture,
    close,
  };
}
