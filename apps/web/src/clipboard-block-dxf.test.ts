import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyCadState,
  drawingToDxf,
  getLegacyRuntime,
  normalizeCadState,
} from '@hancad/legacy-bridge';
import { draftCircle, draftLine, draftPolyline } from '@hancad/draft';
import { createTestRuntime } from '../../../packages/legacy-bridge/src/test-runtime';
import { copyDrawingSelection, pasteDrawingClipboard } from './drawing-clipboard';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());
describe('supported clipboard BLOCK/INSERT DXF persistence', () => {
  it('writes real block records and restores all supported members, groups and base points without duplicate model geometry', () => {
    const source = createEmptyCadState();
    const base = { ...source.settings, id: 'style', layer: '0', color: '#ffffff', lineWidth: 1 };
    source.entities = [
      draftLine(
        source.settings,
        { x: 200000000.125, y: -100.25, z: 5 },
        { x: 200000020.125, y: -80.25, z: 9 },
        'line',
      ),
      draftCircle(source.settings, { x: 200000010.125, y: -90.25, z: 5 }, 2, 'circle'),
      {
        ...base,
        id: 'arc',
        type: 'arc',
        center: { x: 200000010.125, y: -90.25, z: 5 },
        radius: 5,
        startAngle: 0,
        endAngle: Math.PI / 2,
        clockwise: true,
      },
      {
        ...draftPolyline(
          source.settings,
          [
            { x: 200000000.125, y: -60.25 },
            { x: 200000020.125, y: -60.25 },
            { x: 200000030.125, y: -80.25 },
          ],
          true,
          false,
          'poly',
        ),
        type: 'polyline',
        points: [
          { x: 200000000.125, y: -60.25 },
          { x: 200000020.125, y: -60.25 },
          { x: 200000030.125, y: -80.25 },
        ],
        closed: true,
        bulges: [0.5, 0, 0],
      },
      {
        ...base,
        id: 'text',
        type: 'text',
        point: { x: 200000000.125, y: -40.25, z: 5 },
        text: '한글 블록',
        textSize: 3.5,
        rotation: 0,
      },
      {
        ...base,
        id: 'dimension',
        type: 'dimension',
        kind: 'aligned',
        a: { x: 200000000.125, y: -100.25 },
        b: { x: 200000020.125, y: -100.25 },
        offset: 10,
        precision: 2,
        dimScale: 1,
        textSize: 3.5,
        arrowSize: 2.5,
        extensionGap: 1,
        extensionOvershoot: 2,
        unit: 'mm',
      },
    ];
    const payload = copyDrawingSelection(
      source,
      source.entities.map((entity) => entity.id),
      { x: 200000000.125, y: -100.25, z: 5 },
    )!;
    const pasted = pasteDrawingClipboard(
      createEmptyCadState(),
      payload,
      { x: 150, y: -50, z: 10 },
      true,
    );
    const outside = draftLine(source.settings, { x: -10, y: 0 }, { x: 10, y: 0 }, 'outside');
    const state = normalizeCadState({
      ...pasted.state,
      entities: [...pasted.state.entities, outside],
      groups: [
        {
          id: 'group',
          name: '블록 그룹',
          description: 'Members plus outside object',
          selectable: true,
          ids: [...pasted.ids, 'outside'],
        },
      ],
    });
    const dxf = drawingToDxf(state);
    expect(dxf.match(/\r\nINSERT\r\n/g)).toHaveLength(1);
    const model = dxf.split('2\r\nENTITIES\r\n')[1]!.split('0\r\nENDSEC')[0]!;
    expect(model.match(/\r\nLINE\r\n/g)).toHaveLength(1);
    expect(model).not.toMatch(/\r\n(?:CIRCLE|ARC|TEXT|DIMENSION|LWPOLYLINE)\r\n/);
    const imported = getLegacyRuntime().core.cadImporters.parseDxf(dxf);
    expect(imported.report.skipped).toBe(0);
    expect(imported.state.entities).toHaveLength(7);
    expect(imported.state.clipboardBlocks).toHaveLength(1);
    const block = imported.state.clipboardBlocks![0]!;
    expect(block.name).toBe(state.clipboardBlocks![0]!.name);
    expect(block.basePoint).toEqual({ x: 150, y: -50, z: 10 });
    expect(block.entityIds).toHaveLength(6);
    expect(imported.state.entities[0]).toMatchObject({
      type: 'line',
      a: { x: 150, y: -50, z: 10 },
      b: { x: 170, y: -30, z: 14 },
    });
    const polyline = imported.state.entities.find((entity) => entity.type === 'polyline');
    expect(polyline?.type === 'polyline' && polyline.bulges?.map((value) => value || 0)).toEqual([
      0.5, 0, 0,
    ]);
    expect(imported.state.entities.find((entity) => entity.type === 'text')).toMatchObject({
      text: '한글 블록',
      point: { x: 150, y: 10, z: 10 },
    });
    expect(imported.state.entities.find((entity) => entity.type === 'dimension')).toMatchObject({
      kind: 'aligned',
      a: { x: 150, y: -50, z: 5 },
      b: { x: 170, y: -50, z: 5 },
    });
    expect(imported.state.groups?.[0]?.ids).toHaveLength(7);
    const second = getLegacyRuntime().core.cadImporters.parseDxf(drawingToDxf(imported.state));
    expect(second.state.clipboardBlocks?.[0]?.entityIds).toHaveLength(6);
    expect(second.state.entities).toHaveLength(7);
  });
  it('retains top-level rotated/scaled/nested/array INSERT membership and applies Z transforms', () => {
    const record = (type: string, tags: (string | number)[] = []) =>
      [0, type, ...tags].join('\n') + '\n';
    const text =
      record('SECTION', [2, 'HEADER', 9, '$INSUNITS', 70, 4]) +
      record('ENDSEC') +
      record('SECTION', [2, 'BLOCKS']) +
      record('BLOCK', [2, 'CHILD', 10, 0, 20, 0, 30, 1]) +
      record('LINE', [10, 0, 20, 0, 30, 2, 11, 10, 21, 0, 31, 3]) +
      record('ENDBLK') +
      record('BLOCK', [2, 'PARENT', 10, 0, 20, 0, 30, 0]) +
      record('INSERT', [2, 'CHILD', 10, 5, 20, 0, 30, 10, 41, 1, 42, 1, 43, 2]) +
      record('ENDBLK') +
      record('ENDSEC') +
      record('SECTION', [2, 'ENTITIES']) +
      record('INSERT', [
        2,
        'PARENT',
        10,
        100,
        20,
        200,
        30,
        100,
        41,
        2,
        42,
        2,
        43,
        3,
        50,
        90,
        70,
        2,
        71,
        1,
        44,
        20,
      ]) +
      record('ENDSEC') +
      record('EOF');
    const imported = getLegacyRuntime().core.cadImporters.parseDxf(text);
    expect(imported.state.clipboardBlocks).toHaveLength(2);
    expect(imported.state.entities[0]).toMatchObject({
      a: { x: 100, y: -210, z: 136 },
      b: { x: 100, y: -230, z: 142 },
    });
    expect(imported.state.clipboardBlocks?.[0]?.basePoint).toEqual({ x: 100, y: -200, z: 100 });
    expect(imported.state.clipboardBlocks?.[1]?.basePoint).toEqual({ x: 100, y: -220, z: 100 });
    const restored = getLegacyRuntime().core.cadImporters.parseDxf(drawingToDxf(imported.state));
    expect(restored.state.clipboardBlocks).toHaveLength(2);
    expect(restored.state.entities[0]).toMatchObject({
      a: { x: 100, y: -210, z: 136 },
      b: { x: 100, y: -230, z: 142 },
    });
  });
});
