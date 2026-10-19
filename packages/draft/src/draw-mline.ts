import type { CadEntity, CadMlineStyle, CadPoint } from '@hancad/legacy-bridge';
import { draftPolyline } from './entities';
import { parseDraftNumber } from './coordinates';
import { drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawProgram } from './draw-program';

export const standardMlineStyle: CadMlineStyle = {
  name: 'Standard',
  description: '',
  offsets: [0.5, -0.5],
};
function rail(vertices: readonly CadPoint[], offset: number, closed: boolean): CadPoint[] {
  const normal = (a: CadPoint, b: CadPoint) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return length > 1e-12 ? { x: (b.y - a.y) / length, y: (a.x - b.x) / length } : { x: 0, y: 0 };
  };
  return vertices.map((point, i) => {
    const before = vertices[(i - 1 + vertices.length) % vertices.length]!,
      after = vertices[(i + 1) % vertices.length]!;
    const a = !closed && i === 0 ? normal(point, after) : normal(before, point);
    const b = !closed && i === vertices.length - 1 ? a : normal(point, after);
    const denominator = 1 + a.x * b.x + a.y * b.y;
    const factor = Math.abs(denominator) > 1e-12 ? offset / denominator : offset / 2;
    return { ...point, x: point.x + (a.x + b.x) * factor, y: point.y + (a.y + b.y) * factor };
  });
}
export function multilinePaths(
  vertices: readonly CadPoint[],
  offsets: readonly number[],
  scale: number,
  justification: number,
  closed: boolean,
): CadPoint[][] {
  const shift =
    justification === 0 ? Math.max(...offsets) : justification === 2 ? Math.min(...offsets) : 0;
  return offsets.map((offset) => {
    const result = rail(vertices, (offset - shift) * scale, closed);
    return closed && result[0] ? [...result, result[0]] : result;
  });
}
export function drawMultiline(
  context: DrawContext,
  vertices: CadPoint[],
  closed: boolean,
  offsets: number[],
  scale: number,
  justification: number,
  style: string,
): CadEntity {
  return {
    ...draftPolyline(context.settings, vertices, closed),
    sourceType: 'MLINE',
    drawPaths: multilinePaths(vertices, offsets, scale, justification, closed),
    mline: {
      vertices: structuredClone(vertices),
      offsets: [...offsets],
      scale,
      justification,
      style,
      closed,
    },
  };
}
export function* mlineProgram(context: DrawContext): DrawProgram {
  const styles = context.mlineStyles?.some((style) => style.name.toUpperCase() === 'STANDARD')
    ? [...context.mlineStyles]
    : [standardMlineStyle, ...(context.mlineStyles ?? [])];
  let style = String(context.get('CMLSTYLE')),
    scale = Number(context.get('CMLSCALE')),
    justification = Number(context.get('CMLJUST'));
  const vertices: CadPoint[] = [];
  const build = (points: CadPoint[], closed = false) =>
    drawMultiline(
      context,
      points,
      closed,
      styles.find((item) => item.name.toUpperCase() === style.toUpperCase())?.offsets ??
        standardMlineStyle.offsets,
      scale,
      justification,
      style,
    );
  for (;;) {
    const base = vertices.at(-1),
      partial = vertices.length > 1 ? [build(vertices)] : [];
    const value = yield {
      kind: 'point',
      ko: base
        ? '다음 점 지정 또는 [명령 취소(U)/닫기(C)]:'
        : '시작점 지정 또는 [자리맞추기(J)/축척(S)/스타일(ST)]:',
      en: base
        ? 'Specify next point or [Undo/Close]:'
        : 'Specify start point or [Justification/Scale/STyle]:',
      ...(base ? { base } : {}),
      partial,
      preview: (point: CadPoint) => (base ? [build([...vertices, point])] : []),
    };
    const key = drawKeyword(value),
      point = drawPoint(value);
    if (base && (key === 'U' || key === 'UNDO')) {
      vertices.pop();
      continue;
    }
    if (base && (key === 'C' || key === 'CLOSE') && vertices.length > 2)
      return { entities: [build(vertices, true)] };
    if (base && typeof value === 'string' && !value.trim() && vertices.length > 1)
      return { entities: partial };
    if (!base && (key === 'J' || key === 'JUSTIFICATION')) {
      for (;;) {
        const answer = yield {
          kind: 'keyword',
          ko: '자리맞추기 유형 입력 [맨 위(T)/0(Z)/맨 아래(B)] <맨 위>:',
          en: 'Enter justification type [Top/Zero/Bottom] <Top>:',
        };
        const selected = drawKeyword(answer),
          index = ['T', 'TOP'].includes(selected)
            ? 0
            : ['Z', 'ZERO'].includes(selected)
              ? 1
              : ['B', 'BOTTOM'].includes(selected)
                ? 2
                : selected === ''
                  ? justification
                  : -1;
        if (index >= 0) {
          justification = index;
          context.set('CMLJUST', index);
          break;
        }
      }
    } else if (!base && (key === 'S' || key === 'SCALE')) {
      const answer = yield {
        kind: 'number',
        ko: `여러 줄 축척 설정 <${scale}>:`,
        en: `Enter mline scale <${scale}>:`,
      };
      const n =
        typeof answer === 'string' && answer.trim()
          ? parseDraftNumber(answer, context.coordinates())
          : scale;
      if (n !== undefined) {
        scale = n;
        context.set('CMLSCALE', n);
      }
    } else if (!base && (key === 'ST' || key === 'STYLE')) {
      for (;;) {
        const answer = yield {
          kind: 'text',
          ko: `여러 줄 스타일 이름 입력 또는 [?] <${style}>:`,
          en: `Enter mline style name or [?] <${style}>:`,
        };
        if (typeof answer !== 'string') continue;
        if (answer.trim() === '?') {
          yield {
            kind: 'keyword',
            ko: `여러 줄 스타일: ${styles.map((item) => item.name).join(', ')}. 계속하려면 Enter:`,
            en: `Multiline styles: ${styles.map((item) => item.name).join(', ')}. Press Enter:`,
          };
          continue;
        }
        const selected = styles.find(
          (item) => item.name.toUpperCase() === (answer.trim() || style).toUpperCase(),
        );
        if (selected) {
          style = selected.name;
          context.set('CMLSTYLE', style);
          break;
        }
      }
    } else if (point && (!base || Math.hypot(point.x - base.x, point.y - base.y) > 1e-12))
      vertices.push(point);
  }
}
