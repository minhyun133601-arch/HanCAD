import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyCadState,
  drawingToDxf,
  getLegacyRuntime,
  normalizeCadState,
} from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import {
  draftCircle,
  draftLine,
  draftPolyline,
  filterCadSelection,
  GroupSession,
  matchesCadFilter,
  SelectionSession,
  selectCadPath,
  selectSimilarCadEntities,
  updateCadSelection,
  upsertCadGroup,
  closestCadPolylineSegment,
  transformCadSelection,
} from './index';
import type { CadFilterExpression } from '@hancad/legacy-bridge';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const state = createEmptyCadState();
  state.layers.push({ name: 'locked', color: '#ffffff', visible: true, locked: true });
  state.entities = [
    draftLine(state.settings, { x: -10, y: 5 }, { x: 20, y: 5 }, 'long'),
    draftLine(state.settings, { x: 2, y: 2 }, { x: 8, y: 8 }, 'inside'),
    draftCircle(state.settings, { x: 20, y: 20 }, 3, 'circle'),
    { ...draftLine(state.settings, { x: 1, y: 1 }, { x: 4, y: 4 }, 'locked'), layer: 'locked' },
  ];
  return state;
}
const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
describe('Phase 05 selection rules and path geometry', () => {
  it('handles PICKADD replacement, Shift toggling/removal, duplicates and locked objects', () => {
    const state = fixture();
    expect(
      updateCadSelection(state, ['long'], ['inside'], { pickadd: 0, pickstyle: 0 }).ids,
    ).toEqual(['inside']);
    expect(
      updateCadSelection(state, ['long'], ['inside'], { pickadd: 0, pickstyle: 0, remove: true })
        .ids,
    ).toEqual(['long', 'inside']);
    expect(
      updateCadSelection(state, ['long'], ['long'], { pickadd: 0, pickstyle: 0, remove: true }).ids,
    ).toEqual([]);
    expect(
      updateCadSelection(state, ['long', 'inside'], ['long'], {
        pickadd: 2,
        pickstyle: 0,
        remove: true,
      }).ids,
    ).toEqual(['inside']);
    expect(
      updateCadSelection(state, ['inside'], ['inside', 'locked'], { pickadd: 2, pickstyle: 0 }),
    ).toMatchObject({ ids: ['inside'], found: 1, duplicates: 1, locked: 1 });
  });
  it('handles concave windows, crossing, fences, circle enclosure and exact tangencies', () => {
    const state = fixture();
    expect(selectCadPath(state, square, 'window')).toEqual(['inside']);
    expect(selectCadPath(state, square, 'crossing')).toEqual(['long', 'inside']);
    expect(
      selectCadPath(
        state,
        [
          { x: 4, y: 0 },
          { x: 4, y: 10 },
        ],
        'fence',
      ),
    ).toEqual(['long', 'inside']);
    state.entities = [
      draftCircle(state.settings, { x: 5, y: 5 }, 20, 'surround'),
      draftLine(state.settings, { x: 0, y: 0 }, { x: 10, y: 0 }, 'boundary'),
    ];
    expect(selectCadPath(state, square, 'window')).toEqual(['boundary']);
    expect(selectCadPath(state, square, 'crossing')).toEqual(['boundary']);
    state.entities = [draftCircle(state.settings, { x: 5, y: 5 }, 5, 'tangent')];
    expect(
      selectCadPath(
        state,
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        'fence',
      ),
    ).toEqual(['tangent']);
    expect(selectCadPath(state, square, 'window')).toEqual(['tangent']);
  });
  it('uses the legacy clockwise arc direction and exact bulge intersections', () => {
    const state = fixture();
    state.entities = [
      {
        ...draftCircle(state.settings, { x: 0, y: 0 }, 10, 'arc'),
        type: 'arc',
        center: { x: 0, y: 0 },
        radius: 10,
        startAngle: 0,
        endAngle: Math.PI,
        clockwise: true,
      },
    ];
    expect(
      selectCadPath(
        state,
        [
          { x: -11, y: -1 },
          { x: 11, y: -1 },
          { x: 11, y: 11 },
          { x: -11, y: 11 },
        ],
        'window',
      ),
    ).toEqual(['arc']);
    const poly = draftPolyline(
      state.settings,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      false,
      false,
      'bulge',
    );
    state.entities = [
      {
        ...poly,
        type: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        closed: false,
        bulges: [1, 0],
      },
    ];
    expect(
      selectCadPath(
        state,
        [
          { x: 5, y: -6 },
          { x: 5, y: -4 },
        ],
        'fence',
      ),
    ).toEqual(['bulge']);
    expect(
      selectCadPath(
        state,
        [
          { x: 5, y: 1 },
          { x: 5, y: -1 },
        ],
        'fence',
      ),
    ).toEqual([]);
    expect(
      closestCadPolylineSegment(
        {
          ...state.entities[0]!,
          type: 'polyline',
          closed: false,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: -4 },
          ],
          bulges: [1, 0, 0],
        },
        { x: 5, y: -5 },
      ),
    ).toBe(0);
  });
});
describe('filter, group and selection prompt workflows', () => {
  it('evaluates nested FILTER operators, current/excluded QSELECT and similarity mode', () => {
    const state = fixture();
    const expression: CadFilterExpression = {
      operator: 'and',
      children: [
        { property: 'type', operator: '=', value: 'line' },
        { operator: 'not', children: [{ property: 'length', operator: '<', value: 10 }] },
      ],
    };
    expect(filterCadSelection(state, expression)).toEqual(['long']);
    expect(filterCadSelection(state, expression, ['long', 'inside'], true)).toEqual(['inside']);
    expect(
      matchesCadFilter(state.entities[1]!, { property: 'layer', operator: 'wildcard', value: '*' }),
    ).toBe(true);
    expect(selectSimilarCadEntities(state, ['inside'])).toEqual(['long', 'inside']);
    state.entities[0]!.color = '#ff0000';
    expect(selectSimilarCadEntities(state, ['inside'], 1)).toEqual(['inside']);
    state.clipboardBlocks = [
      { name: 'BLOCK_A', basePoint: { x: 0, y: 0 }, entityIds: ['inside', 'circle'] },
    ];
    expect(filterCadSelection(state, { property: 'type', operator: '=', value: 'insert' })).toEqual(
      ['inside', 'circle'],
    );
    expect(
      filterCadSelection(state, { property: 'name', operator: 'wildcard', value: 'BLOCK_*' }),
    ).toEqual(['inside', 'circle']);
    expect(selectSimilarCadEntities(state, ['inside'])).toEqual(['inside', 'circle']);
  });
  it('persists groups and named filter expressions through normalization and DXF', () => {
    let state = upsertCadGroup(fixture(), {
      name: '구조',
      description: '기둥 / 벽',
      selectable: true,
      ids: ['long', 'inside', 'missing'],
    });
    state.selectionFilters = [
      { name: '선 필터', expression: { property: 'type', operator: '=', value: 'line' } },
    ];
    state = normalizeCadState(JSON.parse(JSON.stringify(state)));
    expect(state.groups?.[0]?.ids).toEqual(['long', 'inside']);
    expect(updateCadSelection(state, [], ['inside'], { pickadd: 2, pickstyle: 1 }).ids).toEqual([
      'long',
      'inside',
    ]);
    expect(updateCadSelection(state, [], ['inside'], { pickadd: 2, pickstyle: 0 }).ids).toEqual([
      'inside',
    ]);
    const dxf = drawingToDxf(state);
    expect(dxf).toContain('AcDbGroup');
    const imported = getLegacyRuntime().core.cadImporters.parseDxf(dxf).state;
    expect(imported.groups?.[0]).toMatchObject({
      name: '구조',
      description: '기둥 / 벽',
      selectable: true,
      ids: ['import-1', 'import-2'],
    });
    expect(imported.selectionFilters).toEqual(state.selectionFilters);
  });
  it('copies complete selected groups independently and respects disabled group selection', () => {
    const state = upsertCadGroup(fixture(), {
      name: 'SOURCE',
      description: '외벽',
      selectable: true,
      ids: ['long', 'inside'],
    });
    const copied = transformCadSelection(state, ['long', 'inside'], { x: 100, y: 0 }, true, true);
    expect(copied.state.groups).toHaveLength(2);
    expect(copied.state.groups?.[1]).toMatchObject({
      name: '*A1',
      description: '외벽',
      ids: copied.ids,
    });
    expect(copied.state.groups?.[1]?.id).not.toBe(state.groups?.[0]?.id);
    expect(
      transformCadSelection(state, ['long', 'inside'], { x: 100, y: 0 }, true, false).state.groups,
    ).toHaveLength(1);
    expect(
      transformCadSelection(state, ['inside'], { x: 100, y: 0 }, true, true).state.groups,
    ).toHaveLength(1);
  });
  it('supports every selection keyword, grouped previous/undo, polygon and single selection', () => {
    const state = fixture();
    let ids: string[] = [],
      finished = false;
    state.groups = [{ name: 'TEST', description: '', selectable: true, ids: ['inside'] }];
    const session = new SelectionSession({
      getState: () => state,
      getIds: () => ids,
      select: (picked, remove) => {
        ids = updateCadSelection(state, ids, picked, {
          pickadd: 2,
          pickstyle: 0,
          remove: !!remove,
        }).ids;
      },
      replace: (next) => {
        ids = next;
      },
      print: vi.fn(),
      changed: vi.fn(),
      finish: () => {
        finished = true;
      },
      korean: () => true,
    });
    for (const keyword of ['A', 'R', 'M', 'AU', 'SU', 'O', '?'])
      expect(session.submit(keyword)).toBe(true);
    session.submit('A');
    session.submit('ALL');
    expect(ids).toEqual(['long', 'inside', 'circle']);
    session.submit('U');
    expect(ids).toEqual([]);
    session.submit('G');
    session.submit('TEST');
    expect(ids).toEqual(['inside']);
    session.remember();
    session.submit('R');
    session.submit('P');
    expect(ids).toEqual([]);
    session.submit('A');
    session.submit('P');
    expect(ids).toEqual(['inside']);
    session.submit('WP');
    for (const point of square) session.point(point);
    session.submit('');
    expect(ids).toEqual(['inside']);
    for (const keyword of ['W', 'C', 'BOX', 'F', 'CP']) {
      session.submit(keyword);
      expect(session.gesture).toBeDefined();
      session.reset();
    }
    session.submit('L');
    expect(ids).toEqual(['inside']);
    session.submit('SI');
    session.apply(['long']);
    expect(finished).toBe(true);
  });
  it('creates, names, describes, adds, removes, renames and ungroups without changing entity handles', () => {
    let state = fixture(),
      ids = ['inside'];
    const finish = vi.fn();
    const options = {
      state: () => state,
      ids: () => ids,
      clear: () => {
        ids = [];
      },
      commit: (next: typeof state) => {
        state = next;
      },
      print: vi.fn(),
      finish,
      korean: () => true,
    };
    const create = new GroupSession('GROUP', options);
    create.submit('N');
    create.submit('Walls');
    create.submit('D');
    create.submit('외벽');
    create.submit('');
    expect(state.groups?.[0]).toMatchObject({
      name: 'Walls',
      description: '외벽',
      ids: ['inside'],
    });
    const add = new GroupSession('GROUPEDIT', options);
    add.pick('inside');
    add.submit('A');
    ids = ['long'];
    add.submit('');
    expect(state.groups?.[0]?.ids).toEqual(['inside', 'long']);
    const remove = new GroupSession('GROUPEDIT', options);
    remove.submit('Walls');
    remove.submit('R');
    ids = ['long'];
    remove.submit('');
    expect(state.groups?.[0]?.ids).toEqual(['inside']);
    const rename = new GroupSession('GROUPEDIT', options);
    rename.submit('Walls');
    rename.submit('REN');
    rename.submit('외벽');
    expect(state.groups?.[0]?.name).toBe('외벽');
    const ungroup = new GroupSession('UNGROUP', options);
    ungroup.submit('외벽');
    expect(state.groups).toEqual([]);
    expect(state.entities.map((entity) => entity.id)).toEqual([
      'long',
      'inside',
      'circle',
      'locked',
    ]);
  });
});
