import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { parseDraftPoint } from './coordinates';
import { selectCadArea } from './selection';
import { selectCadPath } from './selection-path';
import { cadWildcardMatch } from './selection-filter';

export interface SelectionGesture {
  kind: 'window' | 'crossing' | 'box' | 'polygon' | 'fence';
  points: CadPoint[];
  crossing?: boolean;
}
interface Acquisition {
  ids: string[];
  area?: { points: readonly CadPoint[]; crossing: boolean };
}
export const selectionKeywords = [
  'Window',
  'Crossing',
  'BOX',
  'ALL',
  'Fence',
  'WPolygon',
  'CPolygon',
  'Group',
  'Add',
  'Remove',
  'Multiple',
  'Previous',
  'Undo',
  'AUto',
  'SIngle',
  'SUbobject',
  'Object',
  'Last',
] as const;
export function selectionKeywordLabels(korean = true): string[] {
  const labels = [
    ['윈도우', 'Window', 'W'],
    ['걸침', 'Crossing', 'C'],
    ['상자', 'Box', 'BOX'],
    ['전체', 'All', 'ALL'],
    ['울타리', 'Fence', 'F'],
    ['윈도우 다각형', 'WPolygon', 'WP'],
    ['걸침 다각형', 'CPolygon', 'CP'],
    ['그룹', 'Group', 'G'],
    ['추가', 'Add', 'A'],
    ['제거', 'Remove', 'R'],
    ['다중', 'Multiple', 'M'],
    ['이전', 'Previous', 'P'],
    ['명령 취소', 'Undo', 'U'],
    ['자동', 'Auto', 'AU'],
    ['단일', 'Single', 'SI'],
    ['하위 객체', 'Subobject', 'SU'],
    ['객체', 'Object', 'O'],
    ['최종', 'Last', 'L'],
  ];
  return labels.map(([ko, en, keyword]) => `${korean ? ko : en}(${keyword})`);
}
const aliases: Record<string, string> = {
  W: 'WINDOW',
  C: 'CROSSING',
  F: 'FENCE',
  WP: 'WPOLYGON',
  CP: 'CPOLYGON',
  G: 'GROUP',
  A: 'ADD',
  R: 'REMOVE',
  M: 'MULTIPLE',
  P: 'PREVIOUS',
  U: 'UNDO',
  AU: 'AUTO',
  SI: 'SINGLE',
  SU: 'SUBOBJECT',
  O: 'OBJECT',
  L: 'LAST',
};
interface Options {
  getState: () => LegacyCadState;
  getIds: () => readonly string[];
  select: (ids: readonly string[], remove?: boolean, forceAdd?: boolean) => void;
  replace: (ids: string[]) => void;
  print: (message: string) => void;
  changed: () => void;
  finish: () => void;
  korean: () => boolean;
}
/** Shared selection-prompt state, usable by SELECT and every command-then-select tool. */
export class SelectionSession {
  gesture: SelectionGesture | undefined;
  remove = false;
  multiple = false;
  single = false;
  subobject = false;
  automatic = true;
  previous: string[] = [];
  private undo: string[][] = [];
  private acquisitions: Acquisition[] = [];
  private acquisitionUndo: Acquisition[][] = [];
  private groupName = false;
  get expectsGroupName(): boolean {
    return this.groupName;
  }
  constructor(private readonly options: Options) {}
  reset(): void {
    this.gesture = undefined;
    this.remove = this.multiple = this.single = this.subobject = this.groupName = false;
    this.automatic = true;
    this.undo = [];
    this.acquisitionUndo = [];
    this.options.changed();
  }
  remember(ids: readonly string[] = this.options.getIds()): void {
    this.previous = [...ids];
  }
  get prompt(): string {
    const ko = this.options.korean();
    if (this.groupName) return ko ? '그룹 이름 입력:' : 'Enter group name:';
    if (this.gesture) {
      if (!this.gesture.points.length) return ko ? '첫 번째 점 지정:' : 'Specify first point:';
      return this.gesture.kind === 'polygon' || this.gesture.kind === 'fence'
        ? ko
          ? '다음 점 지정 또는 [명령 취소(U)]:'
          : 'Specify next point or [Undo]:'
        : ko
          ? '반대 구석 지정:'
          : 'Specify opposite corner:';
    }
    return ko ? '객체 선택:' : 'Select objects:';
  }
  clearAcquisitions(): void {
    this.acquisitions = [];
  }
  getSelectionWindows(): {
    points: readonly CadPoint[];
    crossing: boolean;
    ids: readonly string[];
  }[] {
    const selected = new Set(this.options.getIds());
    return this.acquisitions.flatMap((item) =>
      item.area ? [{ ...item.area, ids: item.ids.filter((id) => selected.has(id)) }] : [],
    );
  }
  getIndividuallySelectedIds(): string[] {
    const selected = new Set(this.options.getIds());
    return [
      ...new Set(this.acquisitions.filter((item) => !item.area).flatMap((item) => item.ids)),
    ].filter((id) => selected.has(id));
  }
  apply(
    ids: readonly string[],
    shift = false,
    area?: { points: readonly CadPoint[]; crossing: boolean },
  ): void {
    const before = new Set(this.options.getIds());
    this.undo.push([...before]);
    this.acquisitionUndo.push(structuredClone(this.acquisitions));
    this.options.select(ids, this.remove || shift, this.remove);
    const selected = new Set(this.options.getIds());
    this.acquisitions = this.acquisitions
      .map((item) => ({ ...item, ids: item.ids.filter((id) => selected.has(id)) }))
      .filter((item) => item.ids.length);
    const picked = new Set(ids);
    if (!this.remove && !shift)
      this.acquisitions.push({
        ids: [...selected].filter((id) => picked.has(id) || !before.has(id)),
        ...(area ? { area: structuredClone(area) } : {}),
      });
    if (this.single) this.options.finish();
    this.options.changed();
  }
  point(point: CadPoint): boolean {
    const gesture = this.gesture;
    if (!gesture) return false;
    gesture.points.push({ ...point });
    if (gesture.kind !== 'polygon' && gesture.kind !== 'fence' && gesture.points.length === 2) {
      const [a, b] = gesture.points;
      this.apply(selectCadArea(this.options.getState(), a!, b!, gesture.kind, true), false, {
        points: [a!, { x: b!.x, y: a!.y }, b!, { x: a!.x, y: b!.y }],
        crossing: gesture.kind === 'crossing' || (gesture.kind === 'box' && b!.x < a!.x),
      });
      this.gesture = undefined;
    }
    this.options.changed();
    return true;
  }
  submit(input: string): boolean {
    const value = input.trim().replace(/^_/, '').toUpperCase();
    const ko = this.options.korean();
    if (this.groupName) {
      this.groupName = false;
      const groups = (this.options.getState().groups ?? []).filter((group) =>
        cadWildcardMatch(group.name, input.trim()),
      );
      if (!groups.length) this.options.print(ko ? '그룹을 찾을 수 없습니다.' : 'Group not found.');
      else this.apply(groups.flatMap((group) => group.ids));
      this.options.changed();
      return true;
    }
    if (this.gesture) {
      if (!value && (this.gesture.kind === 'polygon' || this.gesture.kind === 'fence')) {
        this.apply(
          selectCadPath(
            this.options.getState(),
            this.gesture.points,
            this.gesture.kind === 'fence' ? 'fence' : this.gesture.crossing ? 'crossing' : 'window',
            true,
          ),
          false,
          this.gesture.kind === 'polygon'
            ? { points: this.gesture.points, crossing: !!this.gesture.crossing }
            : undefined,
        );
        this.gesture = undefined;
      } else if (value === 'U' || value === 'UNDO') this.gesture.points.pop();
      else {
        const point = parseDraftPoint(input, this.gesture.points.at(-1));
        if (point) this.point(point);
        else this.options.print(ko ? '점이 필요합니다.' : 'Point required.');
      }
      this.options.changed();
      return true;
    }
    if (!value) return false;
    const keyword = aliases[value] ?? value;
    const state = this.options.getState();
    if (['WINDOW', 'CROSSING', 'BOX'].includes(keyword))
      this.gesture = { kind: keyword.toLowerCase() as 'window' | 'crossing' | 'box', points: [] };
    else if (['FENCE', 'WPOLYGON', 'CPOLYGON'].includes(keyword))
      this.gesture = {
        kind: keyword === 'FENCE' ? 'fence' : 'polygon',
        crossing: keyword === 'CPOLYGON',
        points: [],
      };
    else if (keyword === 'ALL') this.apply(state.entities.map((entity) => entity.id));
    else if (keyword === 'LAST') {
      const visible = new Set(
        state.layers.filter((layer) => layer.visible).map((layer) => layer.name),
      );
      const last = [...state.entities].reverse().find((entity) => visible.has(entity.layer));
      this.apply(last ? [last.id] : []);
    } else if (keyword === 'PREVIOUS') this.apply(this.previous);
    else if (keyword === 'UNDO') {
      this.options.replace(this.undo.pop() ?? [...this.options.getIds()]);
      this.acquisitions = this.acquisitionUndo.pop() ?? this.acquisitions;
    } else if (keyword === 'ADD') this.remove = false;
    else if (keyword === 'REMOVE') this.remove = true;
    else if (keyword === 'MULTIPLE') this.multiple = true;
    else if (keyword === 'SINGLE') this.single = true;
    else if (keyword === 'AUTO') {
      this.automatic = true;
      this.single = false;
    } else if (keyword === 'SUBOBJECT') {
      this.subobject = true;
      this.options.print(
        ko
          ? '폴리선 세그먼트를 Ctrl 키와 함께 선택합니다.'
          : 'Select a polyline segment with Ctrl.',
      );
    } else if (keyword === 'OBJECT') this.subobject = false;
    else if (keyword === 'GROUP') this.groupName = true;
    else if (keyword === '?') this.options.print(selectionKeywords.join('/'));
    else return false;
    this.options.changed();
    return true;
  }
}
