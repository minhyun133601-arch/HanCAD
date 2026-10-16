/** Command window placement is a profile (registry) preference, not a drawing setting. */
export interface CommandLineLayout {
  docked: boolean;
  /** Floating bar left edge in workspace pixels; negative means centered. */
  x: number;
  /** Floating bar distance from the workspace bottom in pixels. */
  bottom: number;
  width: number;
  /** History lines shown when docked. */
  dockedLines: number;
  /** Floating window transparency in percent (0 opaque - 90). */
  transparency: number;
}

export const defaultCommandLineLayout: CommandLineLayout = Object.freeze({
  docked: false,
  x: -1,
  bottom: 12,
  width: 930,
  dockedLines: 3,
  transparency: 25,
});

const key = 'hancad.command-line.layout.v1';

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function normalizeLayout(value: unknown): CommandLineLayout {
  const source = typeof value === 'object' && value !== null ? value : {};
  const field = (name: keyof CommandLineLayout): unknown =>
    (source as Record<string, unknown>)[name];
  const base = defaultCommandLineLayout;
  return {
    docked: typeof field('docked') === 'boolean' ? (field('docked') as boolean) : base.docked,
    x: bounded(field('x'), -1, 10000, base.x),
    bottom: bounded(field('bottom'), 0, 10000, base.bottom),
    width: bounded(field('width'), 320, 4000, base.width),
    dockedLines: Math.round(bounded(field('dockedLines'), 1, 50, base.dockedLines)),
    transparency: Math.round(bounded(field('transparency'), 0, 90, base.transparency)),
  };
}

export function loadLayout(): CommandLineLayout {
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeLayout(JSON.parse(raw)) : defaultCommandLineLayout;
  } catch {
    return defaultCommandLineLayout;
  }
}

export function saveLayout(layout: CommandLineLayout): void {
  try {
    localStorage.setItem(key, JSON.stringify(normalizeLayout(layout)));
  } catch {
    /* The command window remains usable without stored placement. */
  }
}
