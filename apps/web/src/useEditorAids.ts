import { useEffect, useRef } from 'react';
import { SnapIndex, legacyEntitySnapSources } from '@hancad/draft';
import type { DraftSnap, PointSnapOverride } from '@hancad/draft';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { Locale } from '@hancad/ui';
import type { DynamicConstraints } from './dynamic-input-state';
import type { useCanvasInteraction } from './useCanvasInteraction';
import { EditorDraftingAids, overrideMode, type AidResult } from './editor-drafting-aids';
import { drawingSnapSources } from './native-snap-sources';
import {
  constrainDynamicPoint,
  draftingAidSettings,
  snapLabel,
  trackingTooltip,
} from './drafting-aid-settings';
import { tempOverrides } from './temp-overrides';

type Options = Parameters<typeof useCanvasInteraction>[0] & {
  getDynamicConstraints?: () => DynamicConstraints;
};

export function useEditorAids(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const aids = useRef(new EditorDraftingAids());
  const index = useRef(new SnapIndex());
  const cache = useRef<{ state?: LegacyCadState; points: string; draftIds: string[] }>({
    points: '',
    draftIds: [],
  });
  const last = useRef<CadPoint | undefined>(undefined);
  const shift = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const redraw = useRef<(point: CadPoint) => void>(() => {});
  const dynamicSignature = useRef('');
  useEffect(() => {
    const signature = JSON.stringify(latest.current.getDynamicConstraints?.());
    if (signature === dynamicSignature.current) return;
    dynamicSignature.current = signature;
    if (last.current) redraw.current(last.current);
  });
  const locale = (): Locale =>
    latest.current.messages.commandPrompt.startsWith('명령') ? 'ko-KR' : 'en-US';
  function cancelTimer(): void {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
  function clear(): void {
    cancelTimer();
    aids.current.clear();
    latest.current.surface.current?.setSnapMarker();
    latest.current.surface.current?.setTrackingOverlay();
  }
  useEffect(
    () =>
      latest.current.session.database.events.subscribe((event) => {
        if (event.type !== 'sysvar-changed' && event.type !== 'history-changed')
          delete cache.current.state;
      }),
    [options.session.database],
  );
  useEffect(() => {
    clear();
    tempOverrides.clearObjectSnap();
    return () => {
      clear();
      tempOverrides.clearObjectSnap();
    };
  }, [options.session.database, options.files.fitRevision]);
  const context = `${options.draft.snapshot?.tool}:${options.draft.snapshot?.points.length}:${options.draft.snapshot?.pointInput.stage}:${options.navigation.active}:${options.measurement.active}:${options.modification.active}:${options.grip.active}:${options.clipboard.active}`;
  useEffect(clear, [context]);
  useEffect(() => {
    const refresh = (): void => {
      if (last.current) redraw.current(last.current);
    };
    const unsubscribe = tempOverrides.subscribe(refresh);
    const variables = latest.current.session.sysvars.events.subscribe(refresh);
    const keys = (event: KeyboardEvent): void => {
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        shift.current = event.type === 'keydown';
        refresh();
      }
      if (event.type !== 'keydown' || event.defaultPrevented) return;
      if (event.code === 'Escape') {
        clear();
        return;
      }
      if (event.code !== 'Tab' || latest.current.session.input || event.ctrlKey || event.altKey)
        return;
      if (document.querySelector('dialog[open], [data-context-menu-open]')) return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
      )
        return;
      if (aids.current.cycle(event.shiftKey ? -1 : 1)) {
        event.preventDefault();
        event.stopPropagation();
        refresh();
      }
    };
    const blur = (): void => {
      shift.current = false;
      cancelTimer();
    };
    document.addEventListener('keydown', keys, true);
    document.addEventListener('keyup', keys, true);
    window.addEventListener('blur', blur);
    return () => {
      unsubscribe();
      variables();
      cancelTimer();
      document.removeEventListener('keydown', keys, true);
      document.removeEventListener('keyup', keys, true);
      window.removeEventListener('blur', blur);
    };
  }, []);
  function prepared(): SnapIndex {
    const live = latest.current,
      state = live.editing.getState();
    const accepted = live.draft.snapshot?.points;
    const gripCopies = live.grip.getSnapEntities();
    const points = JSON.stringify([
      live.draft.snapshot?.tool,
      accepted?.length,
      accepted?.[0],
      accepted?.at(-1),
      gripCopies.length,
      gripCopies.at(-1)?.id,
    ]);
    if (cache.current.state !== state) {
      index.current.replaceAll(drawingSnapSources(live.session.database, state));
      cache.current = { state, points: '', draftIds: [] };
    }
    if (cache.current.points !== points) {
      for (const id of cache.current.draftIds) index.current.remove(id);
      const extra = [...live.draft.getSnapEntities(), ...gripCopies].flatMap(
        legacyEntitySnapSources,
      );
      for (const source of extra) index.current.upsert(source);
      cache.current.points = points;
      cache.current.draftIds = extra.map((source) => source.id);
    }
    return index.current;
  }
  function baseContext() {
    const live = latest.current,
      context = live.draft.getAidContext();
    const gripInput = live.grip.snapshot?.pointInput;
    if (gripInput)
      return {
        base: gripInput.sourcePoint
          ? undefined
          : (gripInput.temporaryBase ?? live.grip.snapshot?.basePoint),
        previous: undefined,
        temporary: gripInput.trackingPoints,
      };
    if (live.clipboard.needsPoint()) {
      const clipboard = live.clipboard.getAidContext();
      return {
        base: clipboard.pointInput.sourcePoint
          ? undefined
          : (clipboard.pointInput.temporaryBase ?? clipboard.basePoint),
        previous: undefined,
        temporary: clipboard.trackingPoints,
      };
    }
    if (live.layers.needsPoint()) {
      const layer = live.layers.getAidContext();
      return {
        base: layer.pointInput.sourcePoint
          ? undefined
          : (layer.pointInput.temporaryBase ?? layer.basePoint),
        previous: undefined,
        temporary: layer.trackingPoints,
      };
    }
    const points = live.measurement.snapshot?.points ?? live.dimensions.snapshot?.points;
    const base = live.draft.isDrafting()
      ? context.pointInput.sourcePoint || context.deferred
        ? undefined
        : context.basePoint
      : (points?.at(-1) ??
        live.modification.snapshot?.basePoint ??
        live.grip.snapshot?.basePoint ??
        live.clipboard.snapshot?.basePoint ??
        live.text.snapshot?.point ??
        (live.editing.snapshot?.tool === 'OFFSET' ? live.editing.snapshot.basePoint : undefined));
    return { base, previous: context.previousPoint, temporary: context.trackingPoints };
  }
  function resolve(point: CadPoint, enabled: boolean): AidResult {
    last.current = point;
    cancelTimer();
    const live = latest.current,
      vars = live.session.sysvars;
    const idleGrid =
      !enabled && vars.getNumber('SNAPMODE') === 1 && vars.getNumber('SNAPGRIDLEGACY') === 1;
    if (!enabled && !idleGrid) {
      latest.current.surface.current?.setTrackingOverlay();
      latest.current.surface.current?.setSnapMarker();
      return { point, paths: [] };
    }
    const { base, previous, temporary } = baseContext();
    const autosnap = tempOverrides.number(vars, 'AUTOSNAP'),
      override = tempOverrides.getObjectSnap();
    const surface = live.surface.current,
      view = surface?.getWorldView(),
      size = surface?.getViewportSize();
    const halfWidth = view && size ? (view.height * size.width) / Math.max(1, size.height) / 2 : 0;
    const result = aids.current.resolve({
      index: enabled ? prepared() : index.current,
      point,
      tolerance: vars.getNumber('APERTURE') / (live.surface.current?.getView().scale ?? 1),
      chordTolerance: 0.25 / (live.surface.current?.getView().scale ?? 1),
      osmode: enabled ? tempOverrides.number(vars, 'OSMODE') : 0,
      osoptions: vars.getNumber('OSOPTIONS'),
      autosnap: enabled ? autosnap : 0,
      settings: draftingAidSettings(vars),
      temporary,
      shift: shift.current,
      time: performance.now(),
      explicitIntersection: override === 'intersection' || override === 'apparentIntersection',
      // Face-based dynamic UCS is not active in the current 2D editor.
      dynamicUcs: false,
      ...(view
        ? {
            viewport: {
              minX: view.center.x - halfWidth,
              maxX: view.center.x + halfWidth,
              minY: view.center.y - view.height / 2,
              maxY: view.center.y + view.height / 2,
            },
          }
        : {}),
      ...(base ? { base } : {}),
      ...(previous ? { previous } : {}),
    });
    const dynamic = live.getDynamicConstraints?.();
    const lockedAngle = live.grip.snapshot?.pointInput.lockedAngle;
    if (lockedAngle !== undefined && base) {
      const dx = Math.cos(lockedAngle),
        dy = -Math.sin(lockedAngle);
      const distance = (result.point.x - base.x) * dx + (result.point.y - base.y) * dy;
      result.point = { ...result.point, x: base.x + distance * dx, y: base.y + distance * dy };
      result.snapped = false;
      delete result.snap;
      delete result.deferred;
    }
    if (dynamic && Object.keys(dynamic).some((key) => key !== 'relative')) {
      result.point = constrainDynamicPoint(result.point, base, dynamic, vars);
      result.snapped = false;
      delete result.snap;
      delete result.deferred;
    }
    const snap = result.snap;
    live.surface.current?.setSnapMarker(
      snap?.point,
      snap?.kind,
      snap && autosnap & 2
        ? `${snap.deferred ? (locale() === 'ko-KR' ? '지연 ' : 'Deferred ') : ''}${snapLabel(snap.kind, locale())}`
        : undefined,
      Boolean(autosnap & 1),
    );
    const trackpath = vars.getNumber('TRACKPATH');
    const tooltipBase = result.trackingBase ?? base;
    live.surface.current?.setTrackingOverlay({
      points: aids.current.tracking.acquired.map((item) => item.point),
      paths: result.paths
        .filter((path) => path.kind !== 'polar' || !(trackpath & 2))
        .map((path) => ({ ...path, fullScreen: path.kind === 'polar' || !(trackpath & 1) })),
      cursor: result.point,
      ...(result.trackingKind && tooltipBase && autosnap & 32
        ? {
            tooltip: trackingTooltip(
              result.point,
              tooltipBase,
              result.trackingKind,
              vars,
              locale(),
            ),
          }
        : {}),
      ...((snap && autosnap & 4) || result.gridSnapped ? { magnet: result.point } : {}),
    });
    if (result.wait !== undefined)
      timer.current = setTimeout(() => {
        if (last.current) redraw.current(last.current);
      }, result.wait + 1);
    return result;
  }
  function acquireIntersection(point: CadPoint): DraftSnap | boolean {
    const override = tempOverrides.getObjectSnap();
    if (override !== 'intersection' && override !== 'apparentIntersection') return false;
    const live = latest.current,
      tolerance =
        live.session.sysvars.getNumber('APERTURE') / (live.surface.current?.getView().scale ?? 1);
    const snap = aids.current.typed(
      prepared(),
      point,
      tolerance,
      512,
      live.session.sysvars.getNumber('OSOPTIONS'),
    );
    if (!snap) return false;
    const result = aids.current.completeIntersection(
      snap.source,
      point,
      overrideMode(override),
      live.session.sysvars.getNumber('OSOPTIONS'),
    );
    if (result) return result;
    if (!aids.current.hasIntersectionSource) aids.current.acquireIntersection(snap.source);
    live.session.print(locale() === 'ko-KR' ? '두 번째 객체 선택:' : 'Select second object:');
    return true;
  }
  return {
    resolve,
    clear,
    acquireIntersection,
    setRedraw: (callback: (point: CadPoint) => void) => {
      redraw.current = callback;
    },
    resolveTypedPoint: (point: CadPoint, override?: PointSnapOverride) => {
      const live = latest.current,
        vars = live.session.sysvars,
        base = baseContext().base;
      return aids.current.typed(
        prepared(),
        point,
        vars.getNumber('APERTURE') / (live.surface.current?.getView().scale ?? 1),
        override === undefined ? tempOverrides.number(vars, 'OSMODE') : overrideMode(override),
        vars.getNumber('OSOPTIONS'),
        base,
      );
    },
  };
}
