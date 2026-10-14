import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCadState } from '@hancad/legacy-bridge';
import type { CadEntity } from '@hancad/legacy-bridge';
import { createTestRuntime } from '../../legacy-bridge/src/test-runtime';
import { appendCadEntities } from './entities';
import { TextSession } from './text-session';

beforeEach(() => vi.stubGlobal('HeechangTool', createTestRuntime()));
afterEach(() => vi.unstubAllGlobals());

function setup(textSize = 2.5) {
  const drawing = createEmptyCadState();
  const commits: CadEntity[][] = [];
  const session = new TextSession(drawing.settings, {
    textSize,
    onCommit: (entities) => commits.push(entities),
  });
  return { drawing, session, commits };
}

function prepare(session: TextSession, height = '', rotation = ''): void {
  expect(session.acceptText('10,20').status).toBe('continue');
  expect(session.acceptText(height).status).toBe('continue');
  expect(session.acceptText(rotation).status).toBe('continue');
}

describe('single-line TEXT creation', () => {
  it('rejects text beyond the available drawing capacity before mutating accepted lines', () => {
    const commits: CadEntity[][] = [];
    const session = new TextSession(createEmptyCadState().settings, {
      textSize: 2.5,
      availableEntities: 1,
      onCommit: (entities) => commits.push(entities),
    });
    prepare(session);
    session.acceptText('남은 한 행');
    session.updateText('초과 행');
    const before = session.getSnapshot();
    expect(session.acceptText('초과 행')).toEqual({ status: 'error', error: 'entityLimit' });
    expect(session.getSnapshot()).toEqual(before);
    expect(commits).toHaveLength(0);
    session.finish();
    expect(commits).toHaveLength(1);
    expect(commits[0]).toHaveLength(1);
    expect(commits[0]?.[0]).toMatchObject({ type: 'text', text: '남은 한 행' });
  });

  it('requests placement, remembered height and rotation before accepting Korean free text', () => {
    const { drawing, session, commits } = setup();
    expect(session.getSnapshot()).toMatchObject({ prompt: 'textStart', inputMode: 'point' });
    session.acceptText('10,20');
    expect(session.getSnapshot()).toMatchObject({
      prompt: 'textHeight',
      inputMode: 'number',
      point: { x: 10, y: -20 },
      textSize: 2.5,
    });
    session.acceptText('');
    expect(session.getSnapshot()).toMatchObject({ prompt: 'textRotation', inputMode: 'number' });
    session.acceptText('');
    expect(session.getSnapshot()).toMatchObject({ prompt: 'textContent', inputMode: 'text' });
    session.updateText('한글 치수 기준');
    expect(session.getSnapshot().text).toBe('한글 치수 기준');
    expect(session.getSnapshot().preview).toHaveLength(0);
    session.acceptText('  한글 치수 기준  ');
    expect(commits).toHaveLength(0);
    expect(session.getSnapshot().preview[0]).toMatchObject({
      type: 'text',
      point: { x: 10, y: -20 },
      textSize: 2.5,
      rotation: -0,
      text: '  한글 치수 기준  ',
      layer: drawing.settings.layer,
      color: drawing.settings.color,
    });
    expect(session.acceptText('')).toEqual({ status: 'committed' });
    expect(commits).toHaveLength(1);
    const state = appendCadEntities(drawing, commits[0] ?? []);
    expect(state.entities[0]).toMatchObject({ text: '  한글 치수 기준  ', textSize: 2.5 });
    expect(drawing.entities).toHaveLength(0);
    expect(session.getSnapshot().preview).toEqual([]);
    expect(session.acceptText('orphan')).toEqual({ status: 'error', error: 'closedSession' });
    expect(session.cancel()).toEqual({ status: 'error', error: 'closedSession' });
    expect(commits).toHaveLength(1);
  });

  it('accepts each line independently and commits a complete command batch after blank input', () => {
    const { session, commits } = setup();
    prepare(session, '4', '90');
    session.acceptText('첫째');
    session.acceptText('둘째');
    expect(session.getSnapshot().point?.x).toBeCloseTo(20);
    expect(session.getSnapshot().point?.y).toBeCloseTo(-20);
    expect(session.getSnapshot().preview).toHaveLength(2);
    expect(commits).toHaveLength(0);
    session.finish();
    expect(commits).toHaveLength(1);
    expect(commits[0]).toHaveLength(2);
    const [first, second] = commits[0] ?? [];
    expect(first).toMatchObject({
      type: 'text',
      text: '첫째',
      point: { x: 10, y: -20 },
      textSize: 4,
    });
    expect(second).toMatchObject({ type: 'text', text: '둘째' });
    if (first?.type !== 'text' || second?.type !== 'text') throw new Error('Expected TEXT lines.');
    expect(first.rotation).toBeCloseTo(-Math.PI / 2);
    expect(second.point.x).toBeCloseTo(15);
    expect(second.point.y).toBeCloseTo(-20);
    expect(first.id).not.toBe(second.id);
  });

  it('keeps accepted lines on Escape and discards the current unaccepted composition', () => {
    const { session, commits } = setup();
    prepare(session);
    session.acceptText('확정된 문자');
    session.updateText('입력 중인 문자');
    expect(session.cancel()).toEqual({ status: 'cancelled' });
    expect(commits).toHaveLength(1);
    expect(commits[0]).toHaveLength(1);
    expect(commits[0]?.[0]).toMatchObject({ text: '확정된 문자' });
    expect(session.getSnapshot()).toMatchObject({ status: 'cancelled', text: '', preview: [] });
    const empty = setup();
    prepare(empty.session);
    empty.session.updateText('미확정');
    empty.session.acceptText('\u001b');
    expect(empty.commits).toEqual([]);
  });

  it('derives height and rotation from exact mouse picks without changing input points', () => {
    const { session, commits } = setup();
    const start = { x: 200000000, y: -450000000 };
    session.acceptPoint(start);
    start.x = 0;
    session.moveCursor({ x: 200000003, y: -450000004 });
    expect(session.getSnapshot().preview[0]).toMatchObject({
      type: 'line',
      a: { x: 200000000, y: -450000000 },
      b: { x: 200000003, y: -450000004 },
    });
    session.acceptPoint({ x: 200000003, y: -450000004 });
    expect(session.getSnapshot()).toMatchObject({ textSize: 5, prompt: 'textRotation' });
    session.acceptPoint({ x: 200000000, y: -450000020 });
    session.acceptText('측량 좌표');
    session.acceptText('');
    const entity = commits[0]?.[0];
    expect(entity).toMatchObject({
      type: 'text',
      point: { x: 200000000, y: -450000000 },
      textSize: 5,
    });
    if (entity?.type !== 'text') throw new Error('Expected TEXT.');
    expect(entity.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('rejects unsupported options and invalid or model-truncated input visibly', () => {
    const { session, commits } = setup();
    for (const option of ['J', 'Justify', 'S', 'Style', 'MC', 'Fit'])
      expect(session.acceptText(option)).toEqual({ status: 'error', error: 'unsupportedOption' });
    expect(session.getSnapshot().prompt).toBe('textStart');
    expect(session.acceptText('')).toMatchObject({ error: 'needPoints' });
    expect(session.acceptPoint({ x: NaN, y: 0 })).toMatchObject({ error: 'point' });
    session.acceptText('0,0');
    for (const height of ['0', '-5', '1e-10', '1001', 'Infinity', 'NaN', 'abc'])
      expect(session.acceptText(height)).toMatchObject({ error: 'positiveHeight' });
    session.acceptText('3');
    expect(session.acceptPoint({ x: 0, y: 0 })).toMatchObject({ error: 'invalidAngle' });
    expect(session.acceptText('abc')).toMatchObject({ error: 'invalidAngle' });
    session.acceptText('450');
    expect(session.getSnapshot().rotation).toBeCloseTo(-Math.PI / 2);
    for (const line of ['x'.repeat(2001), 'first\nsecond', 'first\rsecond'])
      expect(session.acceptText(line)).toMatchObject({ error: 'textContent' });
    expect(session.getSnapshot().preview).toEqual([]);
    session.acceptText(' ');
    expect(commits).toHaveLength(0);
  });

  it('can start another line group by clicking and snapshots cannot mutate accepted text', () => {
    const { session, commits } = setup();
    prepare(session);
    session.updateText('첫 그룹');
    session.acceptPoint({ x: 90, y: -70 });
    const snapshot = session.getSnapshot();
    expect(snapshot.preview).toHaveLength(1);
    const preview = snapshot.preview[0];
    if (preview?.type !== 'text' || !snapshot.point) throw new Error('Expected text preview.');
    preview.text = 'mutated';
    preview.point.x = -999;
    snapshot.point.x = -999;
    expect(session.getSnapshot().point).toEqual({ x: 90, y: -70 });
    expect(session.getSnapshot().preview[0]).toMatchObject({
      text: '첫 그룹',
      point: { x: 10, y: -20 },
    });
    session.acceptText('새 그룹');
    session.finish();
    expect(commits[0]?.[1]).toMatchObject({ text: '새 그룹', point: { x: 90, y: -70 } });
  });
});
