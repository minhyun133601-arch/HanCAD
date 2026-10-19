import type { CadEntity, CadPoint, CadPolyline, LegacyCadState } from '@hancad/legacy-bridge';
import {
  drawEntity,
  drawPoint,
  type DrawContext,
  type DrawRequest,
  type DrawValue,
} from './draw-program';
import { modifySelection } from './modify-common';
import { SelectionSession } from './selection-session';

export function* editSelection(
  context: DrawContext,
  prompt = '객체 선택:',
  english = 'Select objects:',
  preselect = true,
  onKeyword?: (keyword: string) => boolean,
): Generator<DrawRequest, CadEntity[], DrawValue> {
  const initial = preselect ? modifySelection(context) : [];
  if (initial.length) return initial;
  let ids: string[] = [],
    complete = false,
    korean = true;
  let notice: { ko: string; en: string } | undefined;
  const eligible = context.entities.filter(
    (e) => !context.editableIds || context.editableIds.has(e.id),
  );
  const eligibleIds = new Set(eligible.map((e) => e.id));
  const state: LegacyCadState = {
    version: 1,
    name: '',
    entities: eligible,
    selectedIds: [],
    settings: context.settings,
    layers: [
      ...(context.layers ??
        [...new Set(eligible.map((e) => e.layer))].map((name) => ({
          name,
          color: '#ffffff',
          visible: true,
          locked: false,
        }))),
    ],
    groups: [...(context.groups ?? [])],
  };
  const selection = new SelectionSession({
    getState: () => state,
    getIds: () => ids,
    replace: (next) => {
      ids = next.filter((id) => eligibleIds.has(id));
    },
    select: (next, remove) => {
      const selected = new Set(ids);
      for (const id of next)
        if (eligibleIds.has(id)) {
          if (remove) selected.delete(id);
          else selected.add(id);
        }
      ids = [...selected];
    },
    print: (message) => {
      notice = { ko: message, en: message };
    },
    changed: () => {},
    finish: () => {
      complete = true;
    },
    korean: () => korean,
  });
  selection.remember(context.selectedIds ?? []);
  const preview = (point?: CadPoint): CadEntity[] => {
    const selected = eligible
      .filter((e) => ids.includes(e.id))
      .map((e) => ({ ...e, color: '#3b82f6', trueColor: 0x3b82f6 }));
    const gesture = selection.gesture;
    if (!point || !gesture?.points.length) return selected;
    const first = gesture.points[0]!;
    const points =
      gesture.kind === 'polygon' || gesture.kind === 'fence'
        ? [...gesture.points, point]
        : [first, { x: point.x, y: first.y }, point, { x: first.x, y: point.y }];
    const crossing =
      gesture.crossing ||
      gesture.kind === 'crossing' ||
      (gesture.kind === 'box' && point.x < first.x);
    const boundary: CadPolyline = {
      id: 'modify-selection-preview',
      type: 'polyline',
      layer: context.settings.layer,
      color: crossing ? '#22aa66' : '#3b82f6',
      trueColor: crossing ? 0x22aa66 : 0x3b82f6,
      lineWidth: 1,
      points,
      closed: gesture.kind !== 'fence',
    };
    return [...selected, boundary];
  };
  while (!complete) {
    korean = true;
    const ko = selection.gesture || selection.expectsGroupName ? selection.prompt : prompt;
    korean = false;
    const en = selection.gesture || selection.expectsGroupName ? selection.prompt : english;
    korean = true;
    const value = yield {
      kind: selection.expectsGroupName ? 'text' : selection.gesture ? 'point' : 'entity',
      ko,
      en,
      ...(selection.gesture?.points.at(-1) ? { base: selection.gesture.points.at(-1)! } : {}),
      ...(notice ? { notice } : {}),
      selectionSet: true,
      selectionIds: ids,
      ...(selection.gesture ? { selectionGesture: selection.gesture } : {}),
      preview,
      previewEntities: preview(),
    };
    notice = undefined;
    if (typeof value === 'string') {
      if (onKeyword?.(value.trim().replace(/^_+/, '').toUpperCase())) break;
      if (!selection.submit(value) && value === '') break;
    } else if (selection.gesture) {
      const point = drawPoint(value);
      if (point) selection.point(point);
    } else {
      const entity = drawEntity(value);
      if (entity) selection.apply([entity.id]);
      else {
        const point = drawPoint(value);
        if (point) selection.gesture = { kind: 'box', points: [point] };
      }
    }
  }
  const selected = new Set(ids);
  return eligible.filter((e) => selected.has(e.id));
}
