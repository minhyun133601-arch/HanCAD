import { useEffect, useRef } from 'react';
import { drawingStyleTables, type DrawingStyleTables } from '@hancad/render';
import type { CanvasInteractionOptions } from './useCanvasInteraction';
import { nativeDisplayEntities } from './native-display-entities';
import type { DisplayEntity } from '@hancad/render';
import { readLineweightDisplayScale } from './styles08/lineweight-scale';

/** Live display variables and cached layer tables shared by the drawing surface. */
export function useCanvasSettings(options: CanvasInteractionOptions, needsPoint: () => boolean) {
  const latest = useRef(options);
  latest.current = options;
  const styleCache = useRef<{
    state: ReturnType<CanvasInteractionOptions['files']['getState']>;
    tables: DrawingStyleTables;
  } | null>(null);
  const nativeCache = useRef<readonly DisplayEntity[] | null>(null);
  const displayScale = useRef(readLineweightDisplayScale());
  useEffect(() => {
    let disposed = false,
      queued = false;
    const refresh = () => {
      styleCache.current = null;
      nativeCache.current = null;
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (disposed) return;
        const live = latest.current;
        live.surface.current?.setDrawing(live.files.getState(), false);
        live.surface.current?.setSelection(live.draft.getSelectedIds());
        live.surface.current?.redraw();
      });
    };
    const unsubscribe = options.session.database.events.subscribe((event) => {
      if (
        event.type === 'object-added' ||
        event.type === 'object-modified' ||
        event.type === 'object-erased' ||
        event.type === 'object-unerased'
      )
        refresh();
      else latest.current.surface.current?.redraw();
    });
    const unsubscribeVariables = options.session.sysvars.events.subscribe((event) => {
      if (event.name === 'LWDEFAULT') refresh();
      else latest.current.surface.current?.redraw();
    });
    const scaleChanged = (event: Event) => {
      const value = event instanceof CustomEvent ? Number(event.detail) : NaN;
      displayScale.current =
        Number.isFinite(value) && value >= 0.1 && value <= 10
          ? value
          : readLineweightDisplayScale();
      refresh();
    };
    window.addEventListener('hancad-lineweight-scale-change', scaleChanged);
    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeVariables();
      window.removeEventListener('hancad-lineweight-scale-change', scaleChanged);
    };
  }, [options.session.database]);
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
  return {
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
    getLineweightDisplayScale: () => displayScale.current,
    getNativeDisplayEntities: () => {
      const live = latest.current;
      nativeCache.current ??= nativeDisplayEntities(
        live.session.database,
        live.files.getState(),
        live.session.sysvars.getNumber('LWDEFAULT'),
      );
      return nativeCache.current;
    },
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
        snapAngle: vars.getNumber('SNAPANG'),
        snapBase: { x: pair('SNAPBASE').x, y: -pair('SNAPBASE').y },
        snapStyle: vars.getNumber('SNAPSTYL'),
        isoplane: vars.getNumber('SNAPISOPAIR'),
        aperture: vars.getNumber('APERTURE'),
        apertureBox: vars.getNumber('APBOX') === 1 && needsPoint(),
        tooltipSize: vars.getNumber('DYNTOOLTIPS') ? vars.getNumber('TOOLTIPSIZE') : 0,
        tooltipOpacity: vars.getNumber('DYNTOOLTIPS')
          ? 1 - vars.getNumber('TOOLTIPTRANSPARENCY') / 100
          : 1,
      };
    },
  };
}
