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
  let nextResource = 0;
  const constants = new Map<string, number>();
  const gl = new Proxy(
    {},
    {
      get: (_target, property) => {
        const name = String(property);
        if (/^[A-Z][A-Z_0-9]+$/.test(name)) {
          if (!constants.has(name)) constants.set(name, constants.size + 1);
          return constants.get(name);
        }
        return (...args: unknown[]): unknown => {
          operations.push({ name: `gl:${name}`, args });
          if (name.startsWith('create')) return { resource: name, id: ++nextResource };
          if (name === 'getParameter') return 4096;
          if (name === 'getShaderParameter' || name === 'getProgramParameter') return true;
          if (name === 'getUniformLocation') return { uniform: args[1] };
          if (name === 'getShaderInfoLog' || name === 'getProgramInfoLog') return '';
          return undefined;
        };
      },
    },
  );
  const context = new Proxy(
    {},
    {
      get:
        (_target, property) =>
        (...args: unknown[]) => {
          operations.push({ name: String(property), args });
          if (property === 'measureText') {
            const width = [...String(args[0])].reduce(
              (sum, char) => sum + ((char.codePointAt(0) ?? 0) >= 0x2e80 ? 64 : 32),
              0,
            );
            return {
              width,
              actualBoundingBoxLeft: 0,
              actualBoundingBoxRight: width,
              actualBoundingBoxAscent: 48,
              actualBoundingBoxDescent: 12,
            };
          }
          return undefined;
        },
      set: (_target, property, value: unknown) => {
        operations.push({ name: `set:${String(property)}`, args: [value] });
        return true;
      },
    },
  );
  const documentHandlers = new Map<string, (event: unknown) => void>();
  const windowHandlers = new Map<string, (event: unknown) => void>();
  const ownerDocument = {
    createElement: () => makeCanvas(),
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      documentHandlers.set(name, handler),
    removeEventListener: (name: string) => documentHandlers.delete(name),
    defaultView: {
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        windowHandlers.set(name, handler),
      removeEventListener: (name: string) => windowHandlers.delete(name),
    },
  };
  const makeCanvas = () => ({
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    dataset: {},
    style: { cssText: '' },
    ownerDocument,
    parentElement: {
      append: (value: unknown) => operations.push({ name: 'append', args: [value] }),
    },
    setAttribute: (name: string, value: string) =>
      operations.push({ name: 'setAttribute', args: [name, value] }),
    remove: () => operations.push({ name: 'remove', args: [] }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    getContext: (name: string) => (name === 'webgl2' ? gl : context),
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
  });
  const canvas = makeCanvas();
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    operations,
    fire: (name, event) => handlers.get(name)?.(event),
  };
}
