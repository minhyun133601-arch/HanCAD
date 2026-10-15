import { describe, expect, it } from 'vitest';
import { DocumentManager } from './index';

describe('document databases and native persistence', () => {
  it('keeps untitled state after recovery and avoids duplicate generated drawing names', () => {
    const manager = new DocumentManager();
    const recovered = manager.create(undefined, 'Drawing2.dwg', undefined, 'restored', false);
    expect(recovered.sysvars.get('DWGTITLED')).toBe(0);
    const next = manager.create();
    expect(next.name).toBe('Drawing3.dwg');
    expect(next.sysvars.get('DWGTITLED')).toBe(0);
    manager.rename(next.id, 'Drawing3.hcd');
    expect(next.sysvars.get('DWGTITLED')).toBe(1);
  });
  it('keeps document journals independent and shares profile settings across HCD activation', () => {
    const manager = new DocumentManager(),
      first = manager.create(),
      second = manager.create();
    const events: string[] = [];
    manager.events.subscribe((event) => events.push(event.type));
    first.sysvars.set('LUPREC', 2);
    second.sysvars.set('LUPREC', 7);
    first.sysvars.set('OSMODE', 32);
    first.database.transaction('PROXY', (tx) =>
      tx.add({
        type: 'VENDOR_ENTITY',
        fields: { unknown: [1, 2, { value: '한글' }] },
        groups: [{ code: 9999, value: 'raw' }],
      }),
    );
    first.blobs.set('vendor.bin', Uint8Array.from([0, 127, 255]));
    const bytes = manager.saveHcd(first.id),
      snapshot = first.database.serialize();
    manager.activate(second.id);
    second.database.undo();
    expect(first.sysvars.get('LUPREC')).toBe(2);
    expect(second.sysvars.get('LUPREC')).toBe(4);
    const opened = manager.openHcd(bytes, '저장 도면.hcd');
    expect(opened.database.serialize()).toBe(snapshot);
    expect(opened.blobs.get('vendor.bin')).toEqual(first.blobs.get('vendor.bin'));
    expect(opened.sysvars.get('OSMODE')).toBe(32);
    expect(opened.database.undoCount).toBe(0);
    expect(opened.sysvars.get('DWGNAME')).toBe('저장 도면.hcd');
    manager.rename(opened.id, '새 이름.hcd');
    expect(opened.sysvars.get('DWGNAME')).toBe('새 이름.hcd');
    expect(events).toContain('document-activated');
    expect(events).toContain('document-renamed');
    const active = manager.active;
    expect(() => manager.openHcd(bytes.slice(0, 15), 'bad.hcd')).toThrow();
    expect(manager.active).toBe(active);
    expect(manager.all).toHaveLength(3);
  });
});
