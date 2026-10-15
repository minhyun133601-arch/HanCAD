import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { DrawingDatabase, JsonValue } from '@hancad/db';
import type { CadNavigationKind, CadWorldView } from '@hancad/render';
import type { CanvasSurface } from './canvas-surface';

/** Displayed-view variables; they are saved with the drawing but are not drawing edits. */
export const viewVariables = ['VIEWCTR', 'VIEWSIZE'] as const;

/** Drawing-session coordinates store Y downward; VIEWCTR uses drawing coordinates. */
export function viewVariableValues(view: CadWorldView): { VIEWCTR: number[]; VIEWSIZE: number } {
  return {
    VIEWCTR: [view.center.x, view.center.y === 0 ? 0 : -view.center.y, 0],
    VIEWSIZE: view.height,
  };
}

export function storedWorldView(database: DrawingDatabase): CadWorldView | undefined {
  const center = database.getVariable('VIEWCTR'),
    height = database.getVariable('VIEWSIZE');
  if (
    !Array.isArray(center) ||
    typeof center[0] !== 'number' ||
    typeof center[1] !== 'number' ||
    typeof height !== 'number' ||
    !(height > 0)
  )
    return undefined;
  return { center: { x: center[0], y: center[1] === 0 ? 0 : -center[1] }, height };
}

function sameView(a: CadWorldView | undefined, b: CadWorldView): boolean {
  if (!a) return false;
  const tolerance = Math.max(a.height, b.height) * 1e-9;
  return (
    Math.abs(a.height - b.height) <= tolerance &&
    Math.abs(a.center.x - b.center.x) <= tolerance &&
    Math.abs(a.center.y - b.center.y) <= tolerance
  );
}

/**
 * Records completed zoom/pan steps as navigation undo entries (merged when UNDO
 * Control Combine is on) and restores the view when U/REDO replays one.
 */
export function recordNavigation(
  database: DrawingDatabase,
  kind: CadNavigationKind,
  before: CadWorldView,
  after: CadWorldView,
): void {
  if (sameView(before, after)) return;
  if (!sameView(storedWorldView(database), before)) {
    // The view may have been fitted by OPEN/NEW; the journal must restore the actual prior view.
    for (const [name, value] of Object.entries(viewVariableValues(before)))
      database.writeUntrackedVariable(name, value as JsonValue);
  }
  database.invalidateSingleRedo();
  database.transaction(
    kind === 'zoom' ? 'ZOOM' : 'PAN',
    (transaction) => {
      for (const [name, value] of Object.entries(viewVariableValues(after)))
        transaction.setVariable(name, value as JsonValue);
    },
    'navigation',
  );
}

export function useViewHistory(
  database: DrawingDatabase,
  surface: RefObject<CanvasSurface | null>,
): (kind: CadNavigationKind, before: CadWorldView, after: CadWorldView) => void {
  useEffect(() => {
    let scheduled = false;
    return database.events.subscribe((event) => {
      if (event.type !== 'sysvar-changed' || !viewVariables.some((name) => name === event.name))
        return;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        const view = storedWorldView(database),
          current = surface.current;
        if (view && current && !sameView(view, current.getWorldView())) current.setWorldView(view);
      });
    });
  }, [database, surface]);
  return (kind, before, after) => recordNavigation(database, kind, before, after);
}
