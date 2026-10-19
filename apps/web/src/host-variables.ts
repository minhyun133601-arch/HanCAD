import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { drawingBounds } from '@hancad/legacy-bridge';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import type { DrawingDocument, SysvarValue } from '@hancad/sysvars';
import type { Locale } from '@hancad/ui';
import type { CanvasSurface } from './canvas-surface';
import type { LayoutId } from './DrawingSurface';
import { viewVariableValues } from './view-history';

export interface HostFacts {
  locale: Locale;
  layout: LayoutId;
  state: LegacyCadState;
  surface: CanvasSurface | null;
  layerManagerOpen?: boolean;
}

const sources = new Map<string, () => HostFacts>();
const layoutNames: Record<LayoutId, string> = {
  model: 'Model',
  layoutOne: 'Layout1',
  layoutTwo: 'Layout2',
};
export function layoutName(layout: LayoutId): string {
  return layoutNames[layout];
}
export function layoutFromName(value: string): LayoutId | undefined {
  const name = value.includes('*') ? value.slice(0, value.lastIndexOf('*')) : value;
  return (Object.keys(layoutNames) as LayoutId[]).find(
    (layout) => layoutNames[layout].toUpperCase() === name.toUpperCase(),
  );
}
/** Palettes HanCAD does not provide are reported closed, which is their actual state. */
const closedPalettes = [
  'ADCSTATE',
  'COUNTPALETTESTATE',
  'DRSTATE',
  'ERSTATE',
  'MSMSTATE',
  'SSMSTATE',
  'TPSTATE',
];

/** DocumentManager hook: resolves only the requested fact, so costly extents stay lazy. */
export function hostValue(document: DrawingDocument, name: string): SysvarValue | undefined {
  const facts = sources.get(document.id)?.();
  if (closedPalettes.includes(name)) return 0;
  if (['PERSPECTIVE', 'VIEWBACKSTATUS', 'VIEWFWDSTATUS'].includes(name)) return 0;
  if (!facts) return undefined;
  switch (name) {
    case 'LAYERMANAGERSTATE':
      return facts.layerManagerOpen ? 1 : 0;
    case 'LOCALE':
      return facts.locale === 'ko-KR' ? 'KOR' : 'ENU';
    case 'CLAYOUT': {
      const layout = document.database.find('LAYOUT', layoutNames[facts.layout]);
      return layout ? `${layoutNames[facts.layout]}*${layout.handle}` : undefined;
    }
    case 'EXTMIN':
    case 'EXTMAX':
      return extents(facts.state)[name === 'EXTMIN' ? 0 : 1];
    case 'SCREENSIZE': {
      const size = facts.surface?.getViewportSize();
      return size ? [size.width, size.height] : undefined;
    }
    case 'VIEWCTR':
    case 'VIEWSIZE': {
      const view = facts.surface?.getWorldView();
      if (!view) return undefined;
      const values = viewVariableValues(view);
      return name === 'VIEWSIZE'
        ? values.VIEWSIZE
        : [values.VIEWCTR[0] ?? 0, values.VIEWCTR[1] ?? 0, 0];
    }
    default:
      return undefined;
  }
}

/** An empty drawing reports AutoCAD's inverted 1E+20 extents. */
export function extents(
  state: LegacyCadState,
): [[number, number, number], [number, number, number]] {
  if (!state.entities.length)
    return [
      [1e20, 1e20, 1e20],
      [-1e20, -1e20, -1e20],
    ];
  const bounds = drawingBounds(state);
  // Session coordinates store Y downward.
  return [
    [bounds.minX, bounds.maxY === 0 ? 0 : -bounds.maxY, 0],
    [bounds.maxX, bounds.minY === 0 ? 0 : -bounds.minY, 0],
  ];
}

export function useHostVariables(
  documentId: string,
  facts: Omit<HostFacts, 'surface'>,
  surface: RefObject<CanvasSurface | null>,
): void {
  const latest = useRef(facts);
  latest.current = facts;
  useEffect(() => {
    sources.set(documentId, () => ({ ...latest.current, surface: surface.current }));
    return () => {
      sources.delete(documentId);
    };
  }, [documentId, surface]);
}
