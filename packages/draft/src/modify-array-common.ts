import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { geometryBounds } from '@hancad/geom';
import type { DrawContext, DrawRequest, DrawValue } from './draw-program';
import { drawKeyword, drawPoint } from './draw-program';
import { pointInput } from './draw-curve-helpers';
import { entityAnchor, pointDistance, transformNumber } from './modify-transform-geometry';

export interface ArrayRows {
  rows: number;
  rowSpacing: number;
  rowElevation: number;
  levels: number;
  levelSpacing: number;
}
export const arrayRows = (): ArrayRows => ({
  rows: 1,
  rowSpacing: 1,
  rowElevation: 0,
  levels: 1,
  levelSpacing: 1,
});
export function arrayBounds(entities: readonly CadEntity[]) {
  const points: CadPoint[] = [];
  for (const e of entities) {
    if (e.curve) {
      const b = geometryBounds(e.curve);
      if (b.kind === 'finite')
        points.push({ x: b.min.x, y: -b.max.y }, { x: b.max.x, y: -b.min.y });
    } else if (e.type === 'line') points.push(e.a, e.b);
    else if (e.type === 'circle' || e.type === 'arc')
      points.push(
        { x: e.center.x - e.radius, y: e.center.y - e.radius },
        { x: e.center.x + e.radius, y: e.center.y + e.radius },
      );
    else if ('points' in e) points.push(...e.points);
    else points.push(entityAnchor(e));
  }
  if (!points.length) points.push({ x: 0, y: 0 });
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    base: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: maxX - minX,
    height: maxY - minY,
  };
}
/** Numeric expressions are parsed locally; they never execute script or property access. */
export function arrayExpression(text: string): number | undefined {
  const tokens = text
    .replace(/\s/g, '')
    .match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[()+*/^\-]/gi);
  if (!tokens || tokens.join('') !== text.replace(/\s/g, '')) return;
  let at = 0;
  const atom = (): number => {
    const token = tokens[at++];
    if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * atom();
    if (token === '(') {
      const value = sum();
      if (tokens[at++] !== ')') return NaN;
      return value;
    }
    return token === undefined ? NaN : Number(token);
  };
  const power = (): number => {
    const n = atom();
    return tokens[at] === '^' ? (at++, n ** power()) : n;
  };
  const product = (): number => {
    let n = power();
    while (tokens[at] === '*' || tokens[at] === '/') {
      const op = tokens[at++],
        b = power();
      n = op === '*' ? n * b : n / b;
    }
    return n;
  };
  const sum = (): number => {
    let n = product();
    while (tokens[at] === '+' || tokens[at] === '-') {
      const op = tokens[at++],
        b = product();
      n = op === '+' ? n + b : n - b;
    }
    return n;
  };
  const value = sum();
  return at === tokens.length && Number.isFinite(value) && Math.abs(value) <= 1e12
    ? value
    : undefined;
}
export function* arrayNumber(
  context: DrawContext,
  ko: string,
  en: string,
  fallback: number,
  valid: (n: number) => boolean = () => true,
  base?: CadPoint,
): Generator<DrawRequest, number, DrawValue> {
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: `${ko} <${fallback}>:`,
      en: `${en} <${fallback}>:`,
      ...(base ? { base } : {}),
    };
    if (en.includes('Fill entire path') && ['F', 'FILLENTIREPATH'].includes(drawKeyword(value)))
      return fallback;
    if (['E', 'EXPRESSION'].includes(drawKeyword(value))) {
      const expression = yield { kind: 'text', ko: '표현식 입력:', en: 'Enter expression:' };
      const n = typeof expression === 'string' ? arrayExpression(expression) : undefined;
      if (n !== undefined && valid(n)) return n;
      continue;
    }
    const point = drawPoint(value),
      n =
        value === ''
          ? fallback
          : point && base
            ? pointDistance(base, point)
            : transformNumber(value, context);
    if (n !== undefined && Number.isFinite(n) && valid(n)) return n;
  }
}
export function* arraySpacing(
  context: DrawContext,
  ko: string,
  en: string,
  fallback: number,
  count: number,
): Generator<DrawRequest, number, DrawValue> {
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: `${ko} 또는 [전체(T)/표현식(E)] <${fallback}>:`,
      en: `${en} or [Total/Expression] <${fallback}>:`,
    };
    const key = drawKeyword(value);
    if (key === 'T' || key === 'TOTAL')
      return (
        (yield* arrayNumber(
          context,
          '전체 거리 지정',
          'Specify total distance',
          fallback * Math.max(1, count - 1),
        )) / Math.max(1, count - 1)
      );
    if (key === 'E' || key === 'EXPRESSION') {
      const expression = yield { kind: 'text', ko: '표현식 입력:', en: 'Enter expression:' };
      const n = typeof expression === 'string' ? arrayExpression(expression) : undefined;
      if (n !== undefined && n !== 0) return n;
      continue;
    }
    const point = drawPoint(value);
    if (point) {
      const second = yield* pointInput({
        ko: '두 번째 점 지정:',
        en: 'Specify second point:',
        base: point,
      });
      const n = pointDistance(point, second);
      if (n > 0) return n;
      continue;
    }
    const n = value === '' ? fallback : transformNumber(value, context);
    if (n !== undefined && n !== 0) return n;
  }
}
export function* editArrayRows(
  context: DrawContext,
  state: ArrayRows,
  levels: boolean,
  multiplier: number,
): Generator<DrawRequest, void, DrawValue> {
  const max = 100000 / Math.max(1, multiplier * (levels ? state.rows : state.levels));
  const count = yield* arrayNumber(
    context,
    levels ? '수준 수 입력' : '행 수 입력',
    levels ? 'Enter the number of levels' : 'Enter the number of rows',
    levels ? state.levels : state.rows,
    (n) => Number.isInteger(n) && n > 0 && n <= max,
  );
  const spacing = yield* arraySpacing(
    context,
    levels ? '수준 간 거리 지정' : '행 간 거리 지정',
    levels ? 'Specify the distance between levels' : 'Specify the distance between rows',
    levels ? state.levelSpacing : state.rowSpacing,
    count,
  );
  if (levels) {
    state.levels = count;
    state.levelSpacing = spacing;
  } else {
    state.rows = count;
    state.rowSpacing = spacing;
    state.rowElevation = yield* arrayNumber(
      context,
      '행 사이의 증분 표고 지정',
      'Specify incrementing elevation between rows',
      state.rowElevation,
    );
  }
}
export function* arrayAssociative(): Generator<DrawRequest, void, DrawValue> {
  for (;;) {
    const answer = yield {
      kind: 'keyword',
      ko: '연관 배열을 작성하시겠습니까? [예(Y)/아니오(N)] <아니오>:',
      en: 'Create associative array? [Yes/No] <No>:',
    };
    const key = drawKeyword(answer);
    if (answer === '' || ['N', 'NO', '아니오'].includes(key)) return;
    if (['Y', 'YES', '예'].includes(key)) {
      const response = yield {
        kind: 'keyword',
        ko: '연관 배열은 페이즈 16에서 지원됩니다. [아니오(N)] <아니오>:',
        en: 'Associative arrays are scheduled for Phase 16. [No] <No>:',
        notice: {
          ko: '연관 배열은 페이즈 16에서 지원됩니다.',
          en: 'Associative arrays are scheduled for Phase 16.',
        },
      };
      if (response === '' || ['N', 'NO', '아니오'].includes(drawKeyword(response))) return;
    }
  }
}
export const arrayCountValid = (n: number) => Number.isInteger(n) && n > 0 && n <= 100000;
export const arrayExit = (value: DrawValue) =>
  value === '' || ['X', 'EXIT'].includes(drawKeyword(value));
