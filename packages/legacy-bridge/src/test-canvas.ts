export interface CanvasOperation {
  name: string;
  args: unknown[];
}
export function createTestCanvas(): {
  canvas: HTMLCanvasElement;
  operations: CanvasOperation[];
  fire: (name: string, event: unknown) => void;
} {
  const operations: CanvasOperation[] = [];
  const handlers = new Map<string, (event: unknown) => void>();
  const context = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        (...args: unknown[]) =>
          operations.push({ name: String(property), args }),
      set: (_target, property, value: unknown) => {
        operations.push({ name: `set:${String(property)}`, args: [value] });
        return true;
      },
    },
  );
  const canvas = {
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    dataset: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    getContext: () => context,
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      handlers.set(name, handler),
    removeEventListener: (name: string) => handlers.delete(name),
    toBlob: (callback: BlobCallback, type: string) =>
      callback(
        new Blob(
          [
            type === 'image/jpeg'
              ? Uint8Array.from([0xff, 0xd8, 0x01, 0xff, 0xd9])
              : Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
          ],
          { type },
        ),
      ),
  };
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    operations,
    fire: (name, event) => handlers.get(name)?.(event),
  };
}
