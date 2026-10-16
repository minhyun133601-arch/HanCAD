import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingDatabase } from '@hancad/db';
import { normalizeCadState, readCadFile } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../../legacy-bridge/src/test-runtime';
import { LegacyDisplaySource, legacyDisplayEntity } from './legacy-source';
import { drawingStyleTables } from './style-tables';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

const line = { id: 'line', type: 'line', a: { x: 1, y: -2 }, b: { x: 3, y: -4 } };

describe('display sources and retained native attributes', () => {
  it('preserves native properties and imported patterns through normalization/recovery', () => {
    const style = {
      aci: 256,
      linetype: 'dashed',
      lineweight: 53,
      linetypeScale: 2,
      transparency: 'bylayer',
      plinegen: true,
    };
    const state = normalizeCadState({
      entities: [{ ...line, ...style }],
      settings: style,
      layers: [{ name: '0', ...style }],
      linetypes: [{ name: 'CUSTOM', description: 'custom pattern', pattern: [4, -2, 0, -2] }],
    });
    expect(state.entities[0]).toMatchObject({ ...style, linetype: 'DASHED' });
    expect(state.layers[0]).toMatchObject({ lineweight: 53, transparency: 'bylayer' });
    expect(state.settings).toMatchObject({ linetypeScale: 2, plinegen: true });
    expect(normalizeCadState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(legacyDisplayEntity(state.entities[0]!)).toMatchObject({
      color: { kind: 'bylayer' },
      geometry: { start: { x: 1, y: 2 }, end: { x: 3, y: 4 } },
    });
    expect(
      drawingStyleTables([], state)
        .linetypes.get('CUSTOM')
        ?.elements.map((entry) => entry.length),
    ).toEqual([4, -2, 0, -2]);
  });

  it('converts both legacy arc directions into WCS counterclockwise sweeps', () => {
    for (const clockwise of [false, true]) {
      const state = normalizeCadState({
        entities: [
          {
            type: 'arc',
            center: { x: 10, y: -20 },
            radius: 5,
            startAngle: 0,
            endAngle: Math.PI / 2,
            clockwise,
          },
        ],
      });
      const geometry = legacyDisplayEntity(state.entities[0]!).geometry;
      expect(geometry.type).toBe('arc');
      if (geometry.type !== 'arc') throw new Error('Expected arc.');
      expect(geometry.center).toEqual({ x: 10, y: 20 });
      expect(geometry.startAngle).toBeCloseTo(clockwise ? Math.PI * 1.5 : 0);
      expect(geometry.sweepAngle).toBeCloseTo(clockwise ? Math.PI / 2 : Math.PI * 1.5);
    }
  });

  it('converts dimension lines, arrows and centered Korean labels to display geometry', () => {
    const state = normalizeCadState({
      entities: [
        {
          type: 'dimension',
          kind: 'aligned',
          a: { x: 0, y: 0 },
          b: { x: 100, y: 0 },
          offset: -20,
          text: '한글 <>',
        },
      ],
    });
    const display = legacyDisplayEntity(state.entities[0]!);
    expect(display.geometry.type).toBe('composite');
    if (display.geometry.type !== 'composite') throw new Error('Expected dimension.');
    expect(display.geometry.triangles).toHaveLength(2);
    expect(display.geometry.parts.some((part) => part.type === 'line')).toBe(true);
    expect(display.geometry.parts.find((part) => part.type === 'text')).toMatchObject({
      text: '한글 100.00',
      align: 'center',
    });
  });

  it('keeps Korean punctuation and multiline baselines while inverting only legacy rotation and Y', () => {
    const text = '한글, CAD (A-1)\n12.50 ± Ø';
    const state = normalizeCadState({
      entities: [
        {
          type: 'text',
          point: { x: 200000000.25, y: -450000000.5 },
          text,
          textSize: 3.5,
          rotation: -0.3,
          aci: 7,
          trueColor: 0x123456,
        },
      ],
    });
    const display = legacyDisplayEntity(state.entities[0]!);
    expect(display.geometry).toEqual({
      type: 'text',
      position: { x: 200000000.25, y: 450000000.5 },
      text,
      height: 3.5,
      rotation: 0.3,
      align: 'left',
    });
    expect(display.color).toEqual({ kind: 'rgb', rgb: 0x123456 });
    expect(normalizeCadState(JSON.parse(JSON.stringify(state))).entities[0]).toEqual(
      state.entities[0],
    );
  });

  it('diffs additions, changed IDs and removals while retaining equal geometry', () => {
    const state = normalizeCadState({ entities: [line] });
    const source = new LegacyDisplaySource();
    const first = source.sync(state);
    expect(first.added).toHaveLength(1);
    const equal = source.sync(structuredClone(state));
    expect(equal.modified).toHaveLength(0);
    expect(equal.entities[0]).toBe(first.entities[0]);
    const next = source.sync(
      normalizeCadState({
        entities: [
          { ...line, aci: 1 },
          { ...line, id: 'next' },
        ],
      }),
    );
    expect(next.added).toHaveLength(1);
    expect(next.modified).toHaveLength(1);
    expect(source.sync(normalizeCadState({ entities: [] })).removed).toEqual(['line', 'next']);
  });

  it('reads native layer flags, ACI, transparency and native LTYPE elements', () => {
    const db = new DrawingDatabase();
    db.transaction('styles', (tx) => {
      tx.add({
        type: 'LAYER',
        owner: db.tables.LAYER,
        name: 'Survey',
        fields: {
          color: -7,
          flags: 4,
          lineweight: 70,
          linetype: 'CUSTOM',
          transparency: 0x02000080,
        },
      });
      tx.add({
        type: 'LTYPE',
        owner: db.tables.LTYPE,
        name: 'CUSTOM',
        fields: { description: 'dash dot', pattern: [{ length: 2 }, { length: -1 }] },
      });
    });
    const tables = drawingStyleTables(db.all());
    expect(tables.layers.get('Survey')).toMatchObject({
      color: { kind: 'aci', index: 7 },
      visible: false,
      locked: true,
      lineweight: 70,
      transparency: 50,
    });
    expect(tables.linetypes.get('CUSTOM')?.patternLength).toBe(3);
  });

  it('keeps DXF original ACI, lineweight and custom pattern rather than only their preview colors', async () => {
    const pair = (...tags: (string | number)[]): string => tags.join('\n') + '\n';
    const dxf = pair(
      0,
      'SECTION',
      2,
      'TABLES',
      0,
      'TABLE',
      2,
      'LTYPE',
      0,
      'LTYPE',
      2,
      'CUSTOM',
      3,
      'custom',
      40,
      3,
      49,
      2,
      49,
      -1,
      0,
      'ENDTAB',
      0,
      'ENDSEC',
      0,
      'SECTION',
      2,
      'ENTITIES',
      0,
      'LINE',
      8,
      '0',
      62,
      7,
      6,
      'CUSTOM',
      48,
      2,
      370,
      53,
      10,
      0,
      20,
      0,
      11,
      10,
      21,
      0,
      0,
      'ENDSEC',
      0,
      'EOF',
    );
    const result = await readCadFile(new File([dxf], 'styles.dxf'));
    expect(result.state.entities[0]).toMatchObject({
      aci: 7,
      linetype: 'CUSTOM',
      linetypeScale: 2,
      lineweight: 53,
    });
    expect(result.state.linetypes?.find((entry) => entry.name === 'CUSTOM')?.pattern).toEqual([
      2, -1,
    ]);
  });
});
