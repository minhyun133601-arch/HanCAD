import { useEffect, useRef } from 'react';
import { drawingStyleTables, type DrawingStyleTables } from '@hancad/render';
import type { CanvasInteractionOptions } from './useCanvasInteraction';

/** Live display variables and cached layer tables shared by the drawing surface. */
export function useCanvasSettings(options: CanvasInteractionOptions, needsPoint: () => boolean) {
  const latest = useRef(options);
  latest.current = options;
  const styleCache = useRef<{
    state: ReturnType<CanvasInteractionOptions['files']['getState']>;
    tables: DrawingStyleTables;
  } | null>(null);
  useEffect(
    () =>
      options.session.database.events.subscribe(() => {
        styleCache.current = null;
      }),
    [options.session.database],
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
