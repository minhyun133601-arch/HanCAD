import type { MeshData } from './mesh';

/** Deterministic packed stress data bypasses the persistent/undoable drawing model. */
export function stressMesh(first: number, count: number, scale: number): MeshData {
  const tile = Math.floor(first / 8192);
  const ox = (tile % 12) * 1000,
    oy = Math.floor(tile / 12) * 1000;
  let seed = (first + 1) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const values: number[] = [];
  const edge = (ax: number, ay: number, bx: number, by: number, d: number, length: number) => {
    values.push(ax, ay, d, length, 0, bx, by, d + Math.hypot(bx - ax, by - ay), length, 0);
  };
  for (let i = 0; i < count; i++) {
    const x = random() * 980 + 10,
      y = random() * 980 + 10,
      angle = random() * Math.PI * 2,
      r = 2 + random() * 6;
    if ((first + i) % 3 === 0) {
      edge(x, y, x + Math.cos(angle) * r, y + Math.sin(angle) * r, 0, r);
    } else if ((first + i) % 3 === 1) {
      const sweep = Math.PI * (0.5 + random()),
        length = sweep * r;
      const step = 2 * Math.acos(Math.max(-1, 1 - 0.25 / Math.max(1e-9, scale * r)));
      const segments = Math.max(2, Math.min(2048, Math.ceil(sweep / Math.max(0.00001, step))));
      for (let n = 0; n < segments; n++) {
        const a = angle + (sweep * n) / segments,
          b = angle + (sweep * (n + 1)) / segments;
        edge(
          x + Math.cos(a) * r,
          y + Math.sin(a) * r,
          x + Math.cos(b) * r,
          y + Math.sin(b) * r,
          (length * n) / segments,
          length,
        );
      }
    } else {
      edge(x, y, x + r, y, 0, r * 3);
      edge(x + r, y, x + r, y + r, r, r * 3);
      edge(x + r, y + r, x, y + r, r * 2, r * 3);
    }
  }
  return {
    origin: { x: ox, y: oy },
    bounds: { minX: ox, minY: oy, maxX: ox + 1000, maxY: oy + 1000 },
    lines: new Float32Array(values),
    wide: new Float32Array(),
    fills: new Float32Array(),
    entities: count,
  };
}
