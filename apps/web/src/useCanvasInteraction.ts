import { useEffect, useRef, useState } from 'react';
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
import type { useEditingTools } from './useEditingTools';
import type { useTextCreation } from './useTextCreation';
import type { useViewNavigation } from './useViewNavigation';
import { drawingStyleTables } from '@hancad/render';
import type { DrawingStyleTables } from '@hancad/render';
import { tempOverrides } from './temp-overrides';

interface Options {
  files: ReturnType<typeof useDrawingFiles>;
  draft: ReturnType<typeof useDrafting>;
  dimensions: ReturnType<typeof useDimensions>;
  modification: ReturnType<typeof useModification>;
  measurement: ReturnType<typeof useMeasurement>;
  editing: ReturnType<typeof useEditingTools>;
  text: ReturnType<typeof useTextCreation>;
  session: ReturnType<typeof useCommandSession>;
  progressOpen: boolean;
  messages: Messages;
  surface: { current: CanvasSurface | null };
  navigation: ReturnType<typeof useViewNavigation>;
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
  const shift = useRef(false);
  const lastCursor = useRef<CadPoint | null>(null);
  const styleCache = useRef<{
    state: ReturnType<Options['files']['getState']>;
    tables: DrawingStyleTables;
  } | null>(null);
  useEffect(
    () =>
      options.session.database.events.subscribe(() => {
        styleCache.current = null;
      }),
    [options.session.database],
  );
  useEffect(() => {
    tempOverrides.clearObjectSnap();
    return () => tempOverrides.clearObjectSnap();
  }, [options.session.database, options.files.fitRevision]);
  useEffect(
    () =>
      tempOverrides.subscribe(() => {
        if (lastCursor.current) cursor(lastCursor.current);
      }),
    [],
  );
  function styleTables(): DrawingStyleTables {
    const live = latest.current,
      state = live.files.getState();
    if (styleCache.current?.state !== state)
      styleCache.current = {
        state,
        tables: drawingStyleTables(live.session.database.all(), state),
      };
    return styleCache.current.tables;
  }
  useEffect(() => {
    const changed = (event: KeyboardEvent): void => {
      if (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
      shift.current = event.type === 'keydown';
      if (lastCursor.current) cursor(lastCursor.current);
    };
    document.addEventListener('keydown', changed);
    document.addEventListener('keyup', changed);
    const reset = (): void => {
      shift.current = false;
    };
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('keydown', changed);
      document.removeEventListener('keyup', changed);
      window.removeEventListener('blur', reset);
    };
  }, []);
  function blocked(): boolean {
    const live = latest.current;
    return live.files.reading || live.files.restoring || live.progressOpen;
  }
  function canSelectArea(): boolean {
    const live = latest.current;
    if (live.navigation.isActive()) return !blocked() && live.navigation.canSelectArea();
    return (
      !blocked() &&
      !live.draft.isDrafting() &&
      !live.dimensions.isActive() &&
      !live.modification.needsPoint() &&
      !live.measurement.isActive() &&
      !live.text.isActive() &&
      (!live.editing.isActive() || live.editing.canSelectArea())
    );
  }
  function needsPoint(): boolean {
    const live = latest.current;
    if (live.navigation.isActive()) return live.navigation.needsPoint();
    return (
      live.draft.isDrafting() ||
      live.dimensions.needsPoint() ||
      live.modification.needsPoint() ||
      live.measurement.isActive() ||
      live.editing.needsPoint() ||
      live.text.needsPoint()
    );
  }
  function resolve(point: CadPoint, force = false) {
    const live = latest.current;
    const enabled = force || needsPoint();
    const result = enabled
      ? snapDraftPoint(
          live.editing.getState(),
          point,
          live.session.sysvars.getNumber('APERTURE') / (live.surface.current?.getView().scale ?? 1),
          tempOverrides.number(live.session.sysvars, 'OSMODE'),
          live.draft.getSnapEntities(),
        )
      : undefined;
    const autosnap = tempOverrides.number(live.session.sysvars, 'AUTOSNAP');
    live.surface.current?.setSnapMarker(
      result?.point,
      result?.kind,
      result && autosnap & 2 ? live.messages[snapLabels[result.kind]] : undefined,
      Boolean(autosnap & 1),
    );
    return { point: result?.point ?? point, snapped: result !== undefined };
  }
  function pick(event: CadPointerPick): CadPoint | undefined {
    if (blocked()) return;
    const live = latest.current;
    const pointInput = needsPoint();
    const target = resolve(event.point);
    const override = tempOverrides.getObjectSnap();
    if (pointInput && override !== undefined && override !== 'none' && !target.snapped) {
      live.session.print(live.messages.snapNotFound(live.messages[snapLabels[override]]));
      return;
    }
    let accepted = false;
    if (live.navigation.isActive())
      accepted = live.navigation.pick({ ...event, point: target.point }) === true;
    else if (live.measurement.isActive()) accepted = live.measurement.pick(target.point);
    else if (live.editing.isActive()) {
      const entity = live.editing.entityAt(
        event.point,
        8 / (live.surface.current?.getView().scale ?? 1),
      );
      accepted = live.editing.pick(target.point, entity, event.shiftKey);
    } else if (live.text.isActive()) accepted = live.text.pick(target.point);
    else if (live.dimensions.isActive()) {
      const entity = event.entityId
        ? live.files.getState().entities.find((item) => item.id === event.entityId)
        : undefined;
      accepted = live.dimensions.pick(target.point, entity);
    } else if (live.modification.needsPoint())
      accepted = live.modification.pick(target.point, target.snapped);
    else accepted = live.draft.pick({ ...event, ...target });
    if (pointInput && accepted) {
      tempOverrides.consumeObjectSnap();
      return target.point;
    }
  }
  function cursor(point: CadPoint): void {
    lastCursor.current = point;
    if (blocked() || moving.current) return;
    const live = latest.current;
    const target = resolve(point);
    if (live.navigation.isActive()) {
      live.navigation.cursor(target.point);
      return;
    }
    if (live.measurement.isActive()) live.measurement.cursor(target.point);
    else if (live.editing.isActive()) {
      const entity = live.editing.entityAt(point, 8 / (live.surface.current?.getView().scale ?? 1));
      live.editing.cursor(target.point, entity, shift.current);
    } else if (live.text.isActive()) live.text.cursor(target.point);
    else if (live.dimensions.isActive()) {
      const id = live.dimensions.needsEntity() ? live.surface.current?.pick(point) : undefined;
      const entity = id ? live.files.getState().entities.find((item) => item.id === id) : undefined;
      live.dimensions.cursor(target.point, entity);
    } else if (live.modification.isActive()) live.modification.cursor(target.point, target.snapped);
    else live.draft.cursor(target.point, { snapped: target.snapped });
  }
  function suppressSelectionBox(start: CadPoint): boolean {
    const live = latest.current;
    const id = live.surface.current?.pick(start);
    return (
      !live.draft.isActive() &&
      !live.modification.isActive() &&
      !live.editing.isActive() &&
      !live.text.isActive() &&
      Boolean(id && live.draft.getSelectedIds().includes(id))
    );
  }
  function selectionDrag(event: CadSelectionDrag): void {
    const live = latest.current;
    if (live.navigation.isActive()) {
      live.navigation.selectionDrag(event);
      return;
    }
    if (event.phase === 'cancel' || blocked()) {
      if (event.reason === 'escape') live.session.print(live.messages.cancel);
      moving.current = null;
      setDragPreview(null);
      live.surface.current?.setSnapMarker();
      return;
    }
    if (live.editing.isActive()) {
      if (event.phase === 'end')
        live.editing.area(
          event.start,
          event.end,
          event.points ?? [event.start, event.end],
          event.shiftKey,
        );
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
      if (!target.snapped && tempOverrides.number(live.session.sysvars, 'ORTHOMODE') === 1) {
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
        transitionEnabled: vars.getNumber('VTENABLE'),
        transitionDuration: vars.getNumber('VTDURATION'),
        transitionFps: vars.getNumber('VTFPS'),
      };
    },
    getNavigationMode: () => latest.current.navigation.mode(),
    getNavigationWindow: () => latest.current.navigation.window(),
    getSystemVariable: (name: string): unknown => latest.current.session.sysvars.get(name),
    getLinetypes: () => styleTables().linetypes,
    getLayerStyles: () => styleTables().layers,
    getAidSettings: () => {
      const live = latest.current,
        vars = live.session.sysvars;
      const pair = (name: string) => {
        const value = vars.get(name);
        return {
          x: Array.isArray(value) && typeof value[0] === 'number' ? value[0] : 0,
          y: Array.isArray(value) && typeof value[1] === 'number' ? value[1] : 0,
        };
      };
      const min = pair('LIMMIN'),
        max = pair('LIMMAX');
      return {
        cursorSize: vars.getNumber('CURSORSIZE'),
        pickbox: vars.getNumber('PICKBOX'),
        ucsIcon: vars.getNumber('UCSICON'),
        gridMode: vars.getNumber('GRIDMODE'),
        gridUnit: pair('GRIDUNIT'),
        snapUnit: pair('SNAPUNIT'),
        gridMajor: vars.getNumber('GRIDMAJOR'),
        gridDisplay: vars.getNumber('GRIDDISPLAY'),
        gridStyle: vars.getNumber('GRIDSTYLE'),
        limits: { minX: min.x, minY: -max.y, maxX: max.x, maxY: -min.y },
        background: live.navigation.backgroundColor(),
      };
    },
    selectionGesture: (): 'area' | 'fence' =>
      latest.current.editing.needsFence() ? 'fence' : 'area',
  };
}
