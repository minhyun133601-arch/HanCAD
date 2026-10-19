import { useEffect, useRef, useState } from 'react';
import {
  editableSelection,
  transformCadSelection,
  translateCadEntities,
  nearestEntityGrip,
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
import { tempOverrides } from './temp-overrides';
import { useEditorAids } from './useEditorAids';
import { snapLabel } from './drafting-aid-settings';
import type { DynamicConstraints } from './dynamic-input-state';
import type { useGrips } from './useGrips';
import type { useClipboardCommands } from './useClipboardCommands';
import { useSelectionPreview } from './useSelectionPreview';
import { useCanvasSettings } from './useCanvasSettings';

export interface CanvasInteractionOptions {
  files: ReturnType<typeof useDrawingFiles>;
  draft: ReturnType<typeof useDrafting>;
  dimensions: ReturnType<typeof useDimensions>;
  modification: ReturnType<typeof useModification>;
  measurement: ReturnType<typeof useMeasurement>;
  editing: ReturnType<typeof useEditingTools>;
  text: ReturnType<typeof useTextCreation>;
  grip: ReturnType<typeof useGrips>;
  clipboard: ReturnType<typeof useClipboardCommands>;
  session: ReturnType<typeof useCommandSession>;
  progressOpen: boolean;
  messages: Messages;
  surface: { current: CanvasSurface | null };
  navigation: ReturnType<typeof useViewNavigation>;
  getDynamicConstraints?: () => DynamicConstraints;
}

export function useCanvasInteraction(options: CanvasInteractionOptions) {
  const latest = useRef(options);
  latest.current = options;
  const aids = useEditorAids(options);
  const canvasSettings = useCanvasSettings(options, needsPoint);
  const selectionPreview = useSelectionPreview({
    surface: options.surface,
    sysvars: options.session.sysvars,
    getState: options.files.getState,
    enabled: () => !needsPoint() && !blocked(),
    selectionActive: () =>
      latest.current.draft.isActive() || latest.current.modification.isActive(),
    pick: (event) => {
      latest.current.draft.pick(event);
      latest.current.surface.current?.canvas.focus();
    },
    korean: options.messages.cancel.includes('취소'),
  });
  aids.setRedraw(cursor);
  const moving = useRef<{
    ids: string[];
    entities: CadEntity[];
    start: CadPoint;
    delta: CadPoint;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<readonly CadEntity[] | null>(null);
  const shift = useRef(false);
  const lastCursor = useRef<CadPoint | null>(null);
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
    if (
      !live.draft.isActive() &&
      !live.modification.isActive() &&
      !live.clipboard.isActive() &&
      !live.editing.isActive() &&
      live.session.sysvars.getNumber('PICKFIRST') === 0
    )
      return false;
    if (live.draft.getSelectionGesture()) return false;
    return (
      !blocked() &&
      (!live.draft.isDrafting() || live.draft.isSelectionSet()) &&
      !live.dimensions.isActive() &&
      !live.modification.needsPoint() &&
      !live.measurement.isActive() &&
      !live.text.isActive() &&
      !live.grip.isActive() &&
      !live.clipboard.needsPoint() &&
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
      live.text.needsPoint() ||
      live.grip.needsPoint() ||
      live.clipboard.needsPoint()
    );
  }
  function resolve(point: CadPoint, force = false) {
    return aids.resolve(point, force || needsPoint());
  }
  function pick(event: CadPointerPick): CadPoint | undefined {
    if (blocked()) return;
    const live = latest.current;
    if (needsPoint() && live.getDynamicConstraints?.().invalid) {
      live.session.print(live.messages.invalidPoint);
      return;
    }
    if (
      !needsPoint() &&
      !live.draft.isActive() &&
      !live.modification.isActive() &&
      !live.clipboard.isActive() &&
      !live.editing.isActive() &&
      !live.navigation.isActive() &&
      !live.dimensions.isActive() &&
      live.session.sysvars.getNumber('PICKFIRST') === 0
    )
      return;
    if (
      !live.navigation.isActive() &&
      !live.draft.isDrafting() &&
      !live.dimensions.isActive() &&
      !live.modification.isActive() &&
      !live.measurement.isActive() &&
      !live.editing.isActive() &&
      !live.text.isActive() &&
      !live.clipboard.isActive() &&
      !live.draft.isActive() &&
      live.grip.pickGrip(
        event.point,
        Math.max(4, live.session.sysvars.getNumber('GRIPSIZE')) /
          (live.surface.current?.getView().scale ?? 1),
        event.shiftKey,
      )
    )
      return;
    const pointInput = needsPoint();
    if (
      !pointInput &&
      !live.navigation.isActive() &&
      !live.editing.isActive() &&
      !live.dimensions.isActive() &&
      !live.draft.getSelectionGesture()
    ) {
      const selected = selectionPreview.pick(event);
      if (!selected) return;
      event = selected;
    }
    let target = resolve(event.point);
    const override = tempOverrides.getObjectSnap();
    if (pointInput && override !== undefined && override !== 'none' && !target.snapped) {
      const acquired = aids.acquireIntersection(event.point);
      if (acquired === true) return;
      if (acquired)
        target = {
          point: acquired.point,
          snapped: true,
          constrained: true,
          snap: acquired,
          paths: [],
        };
      else {
        live.session.print(
          live.messages.snapNotFound(
            snapLabel(override, live.messages.commandPrompt.startsWith('명령') ? 'ko-KR' : 'en-US'),
          ),
        );
        return;
      }
    }
    let accepted = false;
    if (
      !pointInput &&
      event.entityId &&
      (event.ctrlKey || live.draft.isSubobjectSelection()) &&
      live.files
        .getState()
        .entities.some(
          (entity) =>
            entity.id === event.entityId && (entity.type === 'polyline' || entity.type === 'rect'),
        )
    ) {
      live.draft.pickSubobject(event.entityId, event.point, event.shiftKey);
      return;
    }
    if (live.navigation.isActive())
      accepted = live.navigation.pick({ ...event, point: target.point }) === true;
    else if (live.grip.isActive())
      accepted = live.grip.pick(target.point, Boolean(target.snapped), event.ctrlKey);
    else if (live.clipboard.needsPoint()) accepted = live.clipboard.pick(target.point);
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
      accepted = live.modification.pick(target.point, Boolean(target.snapped));
    else {
      const scalar = live.getDynamicConstraints?.().scalar;
      accepted = live.draft.pick({
        ...event,
        ...target,
        ...(scalar !== undefined ? { scalar } : {}),
      });
    }
    if (pointInput && accepted) {
      aids.clear();
      tempOverrides.consumeObjectSnap();
      return target.point;
    }
  }
  function cursor(point: CadPoint): void {
    lastCursor.current = point;
    if (blocked() || moving.current) return;
    selectionPreview.hover(point);
    const live = latest.current;
    if (!needsPoint() && !live.navigation.isActive()) {
      const surface = live.surface.current;
      const local = surface?.worldToScreen(point),
        rect = surface?.canvas.getBoundingClientRect();
      live.grip.hover(
        point,
        Math.max(4, live.session.sysvars.getNumber('GRIPSIZE')) / (surface?.getView().scale ?? 1),
        local && rect ? { x: local.x + rect.left, y: local.y + rect.top } : undefined,
      );
    }
    const target = resolve(point);
    if (live.navigation.isActive()) {
      live.navigation.cursor(target.point);
      return;
    }
    if (live.grip.isActive()) live.grip.cursor(target.point, Boolean(target.snapped));
    else if (live.clipboard.needsPoint()) live.clipboard.cursor(target.point);
    else if (live.measurement.isActive()) live.measurement.cursor(target.point);
    else if (live.editing.isActive()) {
      const entity = live.editing.entityAt(point, 8 / (live.surface.current?.getView().scale ?? 1));
      live.editing.cursor(target.point, entity, shift.current);
    } else if (live.text.isActive()) live.text.cursor(target.point);
    else if (live.dimensions.isActive()) {
      const id = live.dimensions.needsEntity() ? live.surface.current?.pick(point) : undefined;
      const entity = id ? live.files.getState().entities.find((item) => item.id === id) : undefined;
      live.dimensions.cursor(target.point, entity);
    } else if (live.modification.isActive())
      live.modification.cursor(target.point, Boolean(target.snapped));
    else {
      const scalar = live.getDynamicConstraints?.().scalar;
      live.draft.cursor(target.point, { ...target, ...(scalar !== undefined ? { scalar } : {}) });
    }
  }
  function isGripPoint(start: CadPoint): boolean {
    const live = latest.current;
    const idle =
      !live.draft.isActive() &&
      !live.modification.isActive() &&
      !live.editing.isActive() &&
      !live.text.isActive() &&
      !live.dimensions.isActive() &&
      !live.clipboard.isActive() &&
      !live.grip.isActive();
    return Boolean(
      idle &&
      nearestEntityGrip(
        live.grip.getGrips(),
        start,
        Math.max(4, live.session.sysvars.getNumber('GRIPSIZE')) /
          (live.surface.current?.getView().scale ?? 1),
      ),
    );
  }
  function suppressSelectionBox(start: CadPoint): boolean {
    const live = latest.current;
    const id = live.surface.current?.pick(start);
    return (
      !(live.session.sysvars.getNumber('PICKAUTO') & 2) &&
      !live.draft.isActive() &&
      !live.modification.isActive() &&
      !live.editing.isActive() &&
      !live.text.isActive() &&
      Boolean(id && live.draft.getSelectedIds().includes(id))
    );
  }
  function selectionDrag(event: CadSelectionDrag): void {
    const live = latest.current;
    selectionPreview.area(event);
    if (
      event.twoPoint &&
      event.phase === 'start' &&
      !live.editing.isActive() &&
      !live.navigation.isActive()
    )
      live.draft.beginImpliedWindow(event.start);
    if (live.navigation.isActive()) {
      live.navigation.selectionDrag(event);
      return;
    }
    if (event.phase === 'cancel' || blocked()) {
      if (event.twoPoint) live.draft.resetSelectionPrompt();
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
            Boolean(live.session.sysvars.getNumber('PICKSTYLE') & 1),
          );
          live.files.commitState(event.ctrlKey ? 'COPY' : 'MOVE', result.state);
          live.draft.clearSelection();
          live.draft.selectIds(result.ids);
        }
        moving.current = null;
        setDragPreview(null);
        live.surface.current?.setSnapMarker();
      } else setDragPreview(translateCadEntities(move.entities, delta));
    } else if (event.phase === 'end') {
      if (event.gesture === 'lasso' || event.gesture === 'fence') {
        const crossing =
          event.mode === 'crossing' ||
          (event.mode !== 'window' && (event.points?.[1]?.x ?? event.end.x) < event.start.x);
        live.draft.selectPath(
          event.points ?? [event.start, event.end],
          event.gesture === 'fence' ? 'fence' : crossing ? 'crossing' : 'window',
          event.shiftKey,
        );
      } else
        live.draft.selectArea(
          event.start,
          event.end,
          event.shiftKey,
          event.gesture === 'window' || event.gesture === 'crossing' ? event.gesture : 'box',
        );
    }
  }
  return {
    pick,
    cursor,
    canSelectArea,
    suppressSelectionBox,
    isGripPoint,
    selectionDrag,
    dragPreview,
    selectionOverlay: selectionPreview.overlay,
    cycleOverlap: selectionPreview.cycle,
    resolveTypedPoint: aids.resolveTypedPoint,
    ...canvasSettings,
    openGripMenu: (x: number, y: number): boolean => {
      const live = latest.current,
        surface = live.surface.current;
      if (!surface) return false;
      const rect = surface.canvas.getBoundingClientRect();
      return live.grip.openMenu(
        surface.screenToWorld({ x: x - rect.left, y: y - rect.top }),
        Math.max(4, live.session.sysvars.getNumber('GRIPSIZE')) / surface.getView().scale,
        x,
        y,
      );
    },
    selectionGesture: (): 'area' | 'fence' =>
      latest.current.editing.needsFence() ? 'fence' : 'area',
  };
}
