import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { nativeAcceptance } from './native-acceptance-runtime.mjs';
const qa = await nativeAcceptance('phase06-native-final-smoke', 9225);
const { root, dir, log, connect } = qa;
try {
  const page = await connect('mask', qa.port);
  const platform = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('platform_info'));
  assert.equal(platform.mode, 'desktop');
  log('native-final-platform', { url: page.url(), platform });
  async function enter(value) {
    await page.getByRole('textbox', { name: '명령 입력', exact: true }).focus();
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  async function tokens(values) {
    for (const value of values) await enter(value);
  }
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('hancad.active-drawing.v1')).state);
  await tokens([
    'NEW',
    'DYNMODE',
    '0',
    'OSMODE',
    '0',
    'ORTHOMODE',
    '0',
    'WIPEOUTFRAME',
    '1',
    'WIPEOUT',
    '0,0',
    '100,0',
    '100,50',
    '0,50',
    '',
  ]);
  await expect(page.getByTestId('drawing-entity-count')).toHaveText('1');
  assert.equal((await state()).entities[0].frameMode, 1);
  const session = await page.context().newCDPSession(page);
  async function download(mode, format) {
    const target = path.join(dir, mode);
    await fs.mkdir(target, { recursive: true });
    for (const name of await fs.readdir(target))
      if (name.endsWith(`.${format}`)) await fs.unlink(path.join(target, name));
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: target,
      eventsEnabled: true,
    });
    const wait = page.waitForEvent('download');
    await enter(`EXPORT${format.toUpperCase()}`);
    const file = await wait;
    assert.equal(await file.failure(), null);
    return path.join(target, file.suggestedFilename());
  }
  const images = {};
  for (const [mode, keyword, count] of [
    ['display', 'D', 1],
    ['on', 'ON', 2],
    ['off', 'OFF', 1],
  ]) {
    await tokens(['WIPEOUT', 'F', keyword]);
    await expect(page.locator('.command-prompt')).toHaveText('명령:');
    const svgPath = await download(mode, 'svg'),
      svg = await fs.readFile(svgPath, 'utf8');
    assert.equal((svg.match(/<path\b/g) || []).length, count);
    assert.match(svg, /fill="#ffffff" stroke="none"/);
    const pngPath = await download(mode, 'png');
    const image = JSON.parse(
      execFileSync(
        'python',
        [
          '-c',
          "from PIL import Image; import json,sys; im=Image.open(sys.argv[1]).convert('RGB'); data=im.tobytes(); print(json.dumps({'size':im.size,'ink':sum(data[i]!=255 or data[i+1]!=255 or data[i+2]!=255 for i in range(0,len(data),3))}))",
          pngPath,
        ],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
    assert.ok(mode === 'on' ? image.ink > 0 : image.ink === 0);
    assert.equal((await state()).entities[0].frameMode, 1);
    images[mode] = image;
    await page.getByTestId('drawing-canvas').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await expect(page.locator('.command-prompt')).toHaveText('명령:');
    const copied = JSON.parse(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-STA',
          '-File',
          path.join(root, 'scripts/native-clipboard-inspect.ps1'),
          '-OutputDirectory',
          path.join(dir, mode),
        ],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
    assert.equal(copied.sourceFrameMode, 1);
    assert.equal(copied.pixelMismatches, 0);
    const clipboardPng = path.join(dir, mode, 'native-registered-png.png');
    const copiedImage = JSON.parse(
      execFileSync(
        'python',
        [
          '-c',
          "from PIL import Image; import json,sys; im=Image.open(sys.argv[1]).convert('RGB'); data=im.tobytes(); print(json.dumps({'size':im.size,'ink':sum(data[i]!=255 or data[i+1]!=255 or data[i+2]!=255 for i in range(0,len(data),3))}))",
          clipboardPng,
        ],
        { encoding: 'utf8', windowsHide: true },
      ),
    );
    assert.ok(mode === 'on' ? copiedImage.ink > 0 : copiedImage.ink === 0);
    log(`native-wipeout-${mode}`, {
      svgPaths: count,
      png: image,
      sourceFrameMode: 1,
      clipboardImage: copiedImage,
      pixelMismatches: copied.pixelMismatches,
    });
  }
  await page.screenshot({ path: path.join(dir, 'final-wipeout.png') });
  await tokens(['NEW', 'L', '10,10', '30,10', '']);
  await page.getByTestId('drawing-canvas').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await expect(page.locator('.command-prompt')).toHaveText('명령:');
  const metadata = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-File',
        path.join(root, 'scripts/native-clipboard-inspect.ps1'),
        '-OutputDirectory',
        dir,
      ],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
  assert.equal(metadata.entityCount, 1);
  assert.equal(metadata.pixelMismatches, 0);
  assert.ok(metadata.formats.includes('Bitmap'));
  log('native-final-clipboard-image', metadata);
} catch (error) {
  await qa.capture(error);
  process.exitCode = 1;
} finally {
  await qa.close();
}
