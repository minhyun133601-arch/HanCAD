export interface GridPoint {
  x: number;
  y: number;
}
export interface DraftingGrid {
  spacing: GridPoint;
  base: GridPoint;
  /** Counterclockwise WCS radians; points at this boundary use model Y down. */
  angle: number;
  isometric: boolean;
  isoplane: number;
}

export function isoplaneAngles(pair: number): readonly [number, number] {
  return pair === 0
    ? [Math.PI / 2, (Math.PI * 5) / 6]
    : pair === 1
      ? [Math.PI / 6, (Math.PI * 5) / 6]
      : [Math.PI / 6, Math.PI / 2];
}

/** Shared lattice for the displayed grid, cursor and accepted grid-snap positions. */
export function draftingGridBasis(grid: DraftingGrid): readonly [GridPoint, GridPoint] {
  const angles = grid.isometric ? isoplaneAngles(grid.isoplane) : [0, Math.PI / 2];
  const lengths = grid.isometric
    ? [grid.spacing.y, grid.spacing.y]
    : [grid.spacing.x, grid.spacing.y];
  return [0, 1].map((i) => {
    const angle = (angles[i] ?? 0) + grid.angle,
      length = lengths[i] ?? 1;
    return { x: Math.cos(angle) * length, y: -Math.sin(angle) * length };
  }) as [GridPoint, GridPoint];
}

export function gridCoordinates(point: GridPoint, grid: DraftingGrid): GridPoint {
  const [a, b] = draftingGridBasis(grid);
  const x = point.x - grid.base.x,
    y = point.y - grid.base.y;
  const determinant = a.x * b.y - a.y * b.x;
  return { x: (x * b.y - y * b.x) / determinant, y: (y * a.x - x * a.y) / determinant };
}

export function gridPoint(u: number, v: number, grid: DraftingGrid): GridPoint {
  const [a, b] = draftingGridBasis(grid);
  return { x: grid.base.x + u * a.x + v * b.x, y: grid.base.y + u * a.y + v * b.y };
}

/** In an oblique lattice rounding both coefficients alone need not be nearest. */
export function snapGridPoint(point: GridPoint, grid: DraftingGrid): GridPoint {
  if (!(grid.spacing.x > 0 && grid.spacing.y > 0)) return { ...point };
  const uv = gridCoordinates(point, grid),
    u = Math.round(uv.x),
    v = Math.round(uv.y);
  let best = gridPoint(u, v, grid),
    distance = Math.hypot(point.x - best.x, point.y - best.y);
  if (grid.isometric)
    for (let i = u - 1; i <= u + 1; i++)
      for (let j = v - 1; j <= v + 1; j++) {
        const next = gridPoint(i, j, grid),
          d = Math.hypot(point.x - next.x, point.y - next.y);
        if (d < distance) {
          best = next;
          distance = d;
        }
      }
  return best;
}
