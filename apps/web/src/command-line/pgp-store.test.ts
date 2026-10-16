import { describe, expect, it } from 'vitest';
import { PgpStore } from './pgp-store';
import type { SupportFileHandle } from './support-file-handles';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}
function fakeHandle(contents: string[], permission: PermissionState = 'granted') {
  const written: string[] = [];
  let reads = 0;
  const handle: SupportFileHandle = {
    name: 'acad.pgp',
    getFile: async () => new File([contents[Math.min(reads++, contents.length - 1)]!], 'acad.pgp'),
    queryPermission: async () => permission,
    requestPermission: async () => permission,
    createWritable: async () => ({
      write: async (data) => void written.push(new TextDecoder().decode(data as Uint8Array)),
      close: async () => undefined,
    }),
  };
  return { handle, written };
}

describe('user PGP store', () => {
  it('keeps a decoded copy across instances and notifies listeners', async () => {
    const storage = memoryStorage();
    const store = new PgpStore(storage);
    let notified = 0;
    store.subscribe(() => notified++);
    const cp949 = new Uint8Array([
      0x3b,
      0x20,
      0xbf,
      0xf8,
      0x0d,
      0x0a,
      ...new TextEncoder().encode('Q, *QSAVE'),
    ]);
    await store.load('aliases', new File([cp949], 'acad.pgp'));
    expect(store.file('aliases')).toEqual({
      name: 'acad.pgp',
      text: '; 원\r\nQ, *QSAVE',
      encoding: 'cp949',
    });
    expect(notified).toBe(1);
    expect(store.linked('aliases')).toBe(false);
    expect(new PgpStore(storage).file('aliases')?.text).toBe('; 원\r\nQ, *QSAVE');
    expect(await store.reload()).toEqual({ status: 'copy' });
    expect(await new PgpStore(memoryStorage()).reload()).toEqual({ status: 'none' });
  });

  it('re-reads a linked file on REINIT and writes edits back as UTF-8', async () => {
    const store = new PgpStore(memoryStorage());
    const { handle, written } = fakeHandle(['C, *CIRCLE', 'C, *COPY']);
    await store.load('aliases', await handle.getFile(), handle);
    expect(store.linked('aliases')).toBe(true);
    expect(store.file('aliases')?.text).toBe('C, *CIRCLE');
    expect(await store.reload()).toEqual({ status: 'reloaded' });
    expect(store.file('aliases')?.text).toBe('C, *COPY');
    expect(await store.save('aliases', 'C, *CHAMFER\r\n', ['L'])).toBe('written');
    expect(written).toEqual(['C, *CHAMFER\r\n']);
    expect(store.removed).toEqual(['L']);
  });

  it('keeps the copy when permission is denied and resets on clear', async () => {
    const store = new PgpStore(memoryStorage());
    const { handle } = fakeHandle(['L, *LINE'], 'denied');
    await store.load('aliases', new File(['L, *LINE'], 'acad.pgp'), handle);
    expect(await store.reload()).toEqual({ status: 'denied', name: 'acad.pgp' });
    expect(await store.save('aliases', 'L, *LIST')).toBe('denied');
    expect(store.file('aliases')?.text).toBe('L, *LIST');
    store.clear('aliases');
    expect(store.file('aliases')).toBeUndefined();
    expect(store.removed).toEqual([]);
  });

  it('ignores malformed stored data', () => {
    const storage = memoryStorage();
    storage.setItem('hancad.user-pgp.v1', '{"aliases":{"name":3},"removed":["C","bad alias",7]}');
    const store = new PgpStore(storage);
    expect(store.file('aliases')).toBeUndefined();
    expect(store.removed).toEqual(['C']);
  });
});
