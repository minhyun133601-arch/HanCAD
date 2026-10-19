import { DrawSession, selectCadArea, selectCadPath } from '@hancad/draft';
import type { DraftSession } from '@hancad/draft';
import { getLegacyRuntime } from '@hancad/legacy-bridge';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { SystemVariables } from '@hancad/sysvars';
import type { useSelectionController } from './useSelectionController';

type Selection = ReturnType<typeof useSelectionController>;
export function drawSelectionBridge(options: {
  getSession: () => DrawSession | DraftSession | null;
  getState: () => LegacyCadState;
  selection: Selection;
}) {
  const { selection } = options;
  function active(): DrawSession | undefined {
    const session = options.getSession();
    return session instanceof DrawSession && session.getRequest()?.selectionSet
      ? session
      : undefined;
  }
  return {
    selectArea: (...args: Parameters<Selection['selectArea']>) => {
      const session = active();
      if (!session) return selection.selectArea(...args);
      const [a, b, remove, kind] = args;
      if (remove) session.acceptText('R');
      const ids = selectCadArea(
        { ...options.getState(), entities: session.getSelectionEntities() },
        a,
        b,
        kind,
        true,
      );
      for (const id of ids) session.acceptPoint(b, {}, id);
      if (remove) session.acceptText('A');
    },
    selectPath: (...args: Parameters<Selection['selectPath']>) => {
      const session = active();
      if (!session) return selection.selectPath(...args);
      const [points, kind, remove] = args;
      if (remove) session.acceptText('R');
      const ids = selectCadPath(
        { ...options.getState(), entities: session.getSelectionEntities() },
        points,
        kind,
        true,
      );
      for (const id of ids) session.acceptPoint(points[0] ?? { x: 0, y: 0 }, {}, id);
      if (remove) session.acceptText('A');
    },
    getSelectionGesture: () =>
      active() ? active()?.getRequest()?.selectionGesture : selection.getSelectionGesture(),
    beginImpliedWindow: (point: CadPoint) => {
      if (!active()) selection.beginImpliedWindow(point);
    },
  };
}

/** Accepted provisional geometry can be selected again without creating an undo entry. */
export function provisionalEntityId(
  session: DrawSession,
  point: CadPoint,
  fallback: string | undefined,
  variables: SystemVariables,
): string | undefined {
  const screen = variables.get('SCREENSIZE'),
    height = Array.isArray(screen) ? (screen[1] ?? 1) : 1;
  const tolerance =
    (Math.max(1, variables.getNumber('PICKBOX')) * variables.getNumber('VIEWSIZE')) /
    Math.max(1, height);
  return (
    getLegacyRuntime().core.cadEngine.hitTest(session.getSnapEntities(), point, tolerance)?.id ??
    fallback
  );
}
