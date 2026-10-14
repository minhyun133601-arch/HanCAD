import { useRef, useState } from 'react';
import {
  editableSelection,
  selectCadArea,
  snapDraftPoint,
  transformCadSelection,
  translateCadEntities,
} from '@hancad/draft';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { CadPointerPick, CadSelectionDrag } from '@hancad/render';
import type { Messages } from '@hancad/ui';
import type { CanvasSurface } from './canvas-surface';
import type { useDrafting } from './useDrafting';
import type { useDimensions } from './useDimensions';
import type { useModification } from './useModification';
import type { useMeasurement } from './useMeasurement';
import type { useDrawingFiles } from './useDrawingFiles';
import type { useCommandSession } from './useCommandSession';

interface Options {
  files: ReturnType<typeof useDrawingFiles>;
  draft: ReturnType<typeof useDrafting>;
  dimensions: ReturnType<typeof useDimensions>;
  modification: ReturnType<typeof useModification>;
  measurement: ReturnType<typeof useMeasurement>;
  session: ReturnType<typeof useCommandSession>;
  progressOpen: boolean;
  messages: Messages;
  surface: { current: CanvasSurface | null };
}
const snapLabels = {
  endpoint: 'snapEndpoint',
  midpoint: 'snapMidpoint',
  center: 'snapCenter',
  quadrant: 'snapQuadrant',
  nearest: 'snapNearest',
  intersection: 'snapIntersection',
} as const;

export function useCanvasInteraction(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const moving = useRef<{
    ids: string[];
    entities: CadEntity[];
    start: CadPoint;
    delta: CadPoint;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<readonly CadEntity[] | null>(null);
  function blocked(): boolean {
    const live = latest.current;
    return live.files.reading || live.files.restoring || live.progressOpen;
  }
  function canSelectArea(): boolean {
    const live = latest.current;
    return (
      !blocked() &&
      !live.draft.isDrafting() &&
      !live.dimensions.isActive() &&
      !live.modification.needsPoint() &&
      !live.measurement.isActive()
    );
  }
  function resolve(point: CadPoint, force = false) {
    const live = latest.current;
    const enabled =
      force ||
      live.draft.isDrafting() ||
      live.dimensions.needsPoint() ||
      live.modification.needsPoint() ||
      live.measurement.isActive();
    const result = enabled
      ? snapDraftPoint(
          live.files.getState(),
          point,
          live.session.sysvars.getNumber('APERTURE') / (live.surface.current?.getView().scale ?? 1),
          live.session.sysvars.getNumber('OSMODE'),
          live.draft.getSnapEntities(),
        )
      : undefined;
    const autosnap = live.session.sysvars.getNumber('AUTOSNAP');
    live.surface.current?.setSnapMarker(
      result?.point,
      result?.kind,
      result && autosnap & 2 ? live.messages[snapLabels[result.kind]] : undefined,
      Boolean(autosnap & 1),
    );
    return { point: result?.point ?? point, snapped: result !== undefined };
  }
  function pick(event: CadPointerPick): void {
    if (blocked()) return;
    const live = latest.current;
    const target = resolve(event.point);
    if (live.dimensions.isActive()) {
      const entity = event.entityId
        ? live.files.getState().entities.find((item) => item.id === event.entityId)
        : undefined;
      live.dimensions.pick(target.point, entity);
    } else if (live.measurement.isActive()) live.measurement.pick(target.point);
    else if (live.modification.needsPoint()) live.modification.pick(target.point, target.snapped);
    else live.draft.pick({ ...event, ...target });
  }
  function cursor(point: CadPoint): void {
    if (blocked() || moving.current) return;
    const live = latest.current,
      target = resolve(point);
    if (live.dimensions.isActive()) {
      const id = live.dimensions.needsEntity() ? live.surface.current?.pick(point) : undefined;
      const entity = id ? live.files.getState().entities.find((item) => item.id === id) : undefined;
      live.dimensions.cursor(target.point, entity);
    } else if (live.measurement.isActive()) live.measurement.cursor(target.point);
    else if (live.modification.isActive()) live.modification.cursor(target.point, target.snapped);
    else live.draft.cursor(target.point, { snapped: target.snapped });
  }
  function suppressSelectionBox(start: CadPoint): boolean {
    const live = latest.current;
    const id = live.surface.current?.pick(start);
    return (
      !live.draft.isActive() &&
      !live.modification.isActive() &&
      Boolean(id && live.draft.getSelectedIds().includes(id))
    );
  }
  function selectionDrag(event: CadSelectionDrag): void {
    const live = latest.current;
    if (event.phase === 'cancel' || blocked()) {
      if (event.reason === 'escape') live.session.print(live.messages.cancel);
      moving.current = null;
      setDragPreview(null);
      live.surface.current?.setSnapMarker();
      return;
    }
    if (event.phase === 'start' && !event.shiftKey && suppressSelectionBox(event.start)) {
      const ids = [...live.draft.getSelectedIds()];
      moving.current = {
        ids,
        entities: editableSelection(live.files.getState(), ids),
        start: resolve(event.start, true).point,
        delta: { x: 0, y: 0 },
      };
    }
    const move = moving.current;
    if (move) {
      const target = resolve(event.end, true);
      const delta = { x: target.point.x - move.start.x, y: target.point.y - move.start.y };
      if (!target.snapped && live.session.sysvars.getNumber('ORTHOMODE') === 1) {
        if (Math.abs(delta.x) >= Math.abs(delta.y)) delta.y = 0;
        else delta.x = 0;
      }
      move.delta = delta;
      if (event.phase === 'end') {
        if (Math.hypot(delta.x, delta.y) > 1e-10) {
          const result = transformCadSelection(
            live.files.getState(),
            move.ids,
            delta,
            event.ctrlKey,
          );
          live.files.commitState(event.ctrlKey ? 'COPY' : 'MOVE', result.state);
          live.draft.clearSelection();
          live.draft.selectIds(result.ids);
        }
        moving.current = null;
        setDragPreview(null);
        live.surface.current?.setSnapMarker();
      } else setDragPreview(translateCadEntities(move.entities, delta));
    } else if (event.phase === 'end')
      live.draft.selectIds(
        selectCadArea(live.files.getState(), event.start, event.end),
        event.shiftKey,
      );
  }
  return {
    pick,
    cursor,
    canSelectArea,
    suppressSelectionBox,
    selectionDrag,
    dragPreview,
    getNavigationSettings: () => {
      const vars = latest.current.session.sysvars;
      return {
        zoomFactor: vars.getNumber('ZOOMFACTOR'),
        zoomWheel: vars.getNumber('ZOOMWHEEL'),
        middleButtonPan: vars.getNumber('MBUTTONPAN'),
      };
    },
  };
}
