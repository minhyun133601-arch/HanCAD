import { useEffect, useRef, useState } from 'react';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import type { CadPointerPick, CadSelectionDrag } from '@hancad/render';
import { selectCadArea, selectCadPath } from '@hancad/draft';
import type { SystemVariables } from '@hancad/sysvars';
import type { CanvasSurface } from './canvas-surface';
import './selection-preview.css';

interface Options {
  surface: { current: CanvasSurface | null };
  sysvars: SystemVariables;
  getState: () => LegacyCadState;
  enabled: () => boolean;
  selectionActive: () => boolean;
  pick: (event: CadPointerPick) => void;
  korean: boolean;
}
interface Choice {
  event: CadPointerPick;
  ids: string[];
  x: number;
  y: number;
}
/** Hover and overlap cycling query the renderer's retained spatial index. */
export function useSelectionPreview(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const last = useRef<CadPoint | undefined>(undefined);
  const candidates = useRef<string[]>([]);
  const index = useRef(0);
  const highlight = useRef('');
  const areaActive = useRef(false);
  const cached = useRef<{
    state: LegacyCadState;
    entities: Map<string, LegacyCadState['entities'][number]>;
    grouped: Set<string>;
  } | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [badge, setBadge] = useState<{ x: number; y: number } | null>(null);
  function setHighlight(ids: readonly string[]): void {
    const key = ids.join('|');
    if (key === highlight.current) return;
    highlight.current = key;
    latest.current.surface.current?.setHighlight(ids);
  }
  function prepare(state: LegacyCadState) {
    if (cached.current?.state !== state)
      cached.current = {
        state,
        entities: new Map(state.entities.map((entity) => [entity.id, entity])),
        grouped: new Set(state.groups?.flatMap((group) => group.ids) ?? []),
      };
    return cached.current;
  }
  function previewable(id: string): boolean {
    const live = latest.current,
      state = live.getState(),
      prepared = prepare(state);
    const entity = prepared.entities.get(id);
    if (!entity) return false;
    const filter = live.sysvars.getNumber('PREVIEWFILTER');
    if (filter & 1 && state.layers.some((layer) => layer.name === entity.layer && layer.locked))
      return false;
    if (filter & 32 && prepared.grouped.has(id)) return false;
    return true;
  }
  function area(event: CadSelectionDrag): void {
    const live = latest.current;
    const bit = live.selectionActive() ? 2 : 1;
    areaActive.current = event.phase !== 'end' && event.phase !== 'cancel';
    if (!areaActive.current || !(live.sysvars.getNumber('SELECTIONPREVIEW') & bit)) {
      setHighlight([]);
      return;
    }
    const points = event.points ?? [event.start, event.end];
    const bounds = points.reduce(
      (box, p) => ({
        minX: Math.min(box.minX, p.x),
        minY: Math.min(box.minY, p.y),
        maxX: Math.max(box.maxX, p.x),
        maxY: Math.max(box.maxY, p.y),
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const candidates = new Set(live.surface.current?.query(bounds) ?? []);
    const state = live.getState();
    const prepared = prepare(state);
    const scoped = {
      ...state,
      entities: [...candidates].flatMap((id) => {
        const entity = prepared.entities.get(id);
        return entity ? [entity] : [];
      }),
    };
    const crossing =
      event.mode === 'crossing' || (event.mode !== 'window' && event.end.x < event.start.x);
    const ids =
      event.gesture === 'lasso' || event.gesture === 'fence'
        ? selectCadPath(
            scoped,
            points,
            event.gesture === 'fence' ? 'fence' : crossing ? 'crossing' : 'window',
            true,
          )
        : selectCadArea(
            scoped,
            event.start,
            event.end,
            event.gesture === 'window' || event.gesture === 'crossing' ? event.gesture : 'box',
            true,
          );
    setHighlight(
      ids.length > live.sysvars.getNumber('SELECTIONPREVIEWLIMIT') ? [] : ids.filter(previewable),
    );
  }
  function hover(point: CadPoint): void {
    const live = latest.current;
    last.current = point;
    if (areaActive.current) return;
    if (!live.enabled()) {
      setHighlight([]);
      setBadge(null);
      return;
    }
    const ids = live.surface.current?.pickAll(point, true) ?? [];
    if (ids.join('|') !== candidates.current.join('|')) {
      candidates.current = ids;
      index.current = 0;
    }
    const bit = live.selectionActive() ? 2 : 1;
    const id = ids[index.current];
    setHighlight(
      live.sysvars.getNumber('SELECTIONPREVIEW') & bit && id && previewable(id) ? [id] : [],
    );
    if (ids.length > 1 && live.sysvars.getNumber('SELECTIONCYCLING') > 0) {
      const surface = live.surface.current!,
        p = surface.worldToScreen(point),
        rect = surface.canvas.getBoundingClientRect();
      setBadge({ x: p.x + rect.left + 12, y: p.y + rect.top + 12 });
    } else setBadge(null);
  }
  function cycle(): void {
    if (candidates.current.length < 2) return;
    index.current = (index.current + 1) % candidates.current.length;
    const id = candidates.current[index.current]!;
    setHighlight(previewable(id) ? [id] : []);
  }
  function pick(event: CadPointerPick): CadPointerPick | undefined {
    const live = latest.current,
      ids = live.surface.current?.pickAll(event.point, true) ?? [];
    const surface = live.surface.current;
    if (ids.length > 1 && live.sysvars.getNumber('SELECTIONCYCLING') === 2 && surface) {
      const p = surface.worldToScreen(event.point),
        rect = surface.canvas.getBoundingClientRect();
      setChoice({ event, ids, x: p.x + rect.left + 8, y: p.y + rect.top + 8 });
      return;
    }
    const entityId = ids[index.current] ?? ids[0];
    return {
      point: event.point,
      shiftKey: event.shiftKey,
      ...(event.ctrlKey ? { ctrlKey: true } : {}),
      ...(entityId ? { entityId } : {}),
    };
  }
  useEffect(
    () =>
      latest.current.sysvars.events.subscribe(() => {
        if (last.current) hover(last.current);
      }),
    [],
  );
  useEffect(() => {
    if (choice) list.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !list.current?.contains(event.target)) setChoice(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [choice]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        setChoice(null);
        setHighlight([]);
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  const overlay = (
    <>
      {badge && (
        <span
          aria-hidden="true"
          className="selection-cycle-badge"
          style={{ left: badge.x, top: badge.y }}
        >
          ▱▱
        </span>
      )}
      {choice && (
        <div
          ref={list}
          className="selection-cycle-list"
          role="listbox"
          aria-label={options.korean ? '선택 순환' : 'Selection cycling'}
          style={{ left: choice.x, top: choice.y }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.code === 'Escape') {
              event.preventDefault();
              setChoice(null);
              latest.current.surface.current?.canvas.focus();
            }
            if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
              event.preventDefault();
              const buttons = [
                ...(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []),
              ];
              const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
              buttons[
                (current + (event.code === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
              ]?.focus();
            }
          }}
        >
          <strong>{options.korean ? '선택' : 'Selection'}</strong>
          {choice.ids.map((id, i) => (
            <button
              key={id}
              role="option"
              aria-selected={index.current === i}
              onMouseEnter={() => setHighlight(previewable(id) ? [id] : [])}
              onClick={() => {
                latest.current.pick({ ...choice.event, entityId: id });
                setChoice(null);
                setHighlight([]);
              }}
            >
              {i + 1}.{' '}
              {options
                .getState()
                .entities.find((entity) => entity.id === id)
                ?.type.toUpperCase()}{' '}
              ({id})
            </button>
          ))}
          <button onClick={() => setChoice(null)}>{options.korean ? '취소' : 'Cancel'}</button>
        </div>
      )}
    </>
  );
  return { hover, pick, cycle, area, overlay };
}
