import { describe, expect, it } from 'vitest';
import { BrowserPlatform, PlatformCapabilityError } from './platform';

describe('browser OS boundary', () => {
  it('reports unavailable capabilities and never silently reads or writes files', async () => {
    const platform = new BrowserPlatform();
    expect(await platform.info()).toEqual({ mode: 'browser', capabilities: [] });
    await expect(platform.readFile('private.dwg')).rejects.toBeInstanceOf(PlatformCapabilityError);
    await expect(platform.writeFile('private.dwg', new Uint8Array([1, 2]))).rejects.toMatchObject({
      capability: 'files',
      mode: 'browser',
    });
    await expect(platform.chooseOpenFile()).rejects.toMatchObject({ capability: 'dialogs' });
  });

  it('identifies its isolated in-memory clipboard as a mock', async () => {
    const first = new BrowserPlatform();
    const second = new BrowserPlatform();
    expect(await first.writeClipboard('local test')).toEqual({ value: undefined, source: 'mock' });
    expect(await first.readClipboard()).toEqual({ value: 'local test', source: 'mock' });
    expect(await second.readClipboard()).toEqual({ value: '', source: 'mock' });
  });
});
