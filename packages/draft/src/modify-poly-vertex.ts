import type { CadEntity, CadPolyline } from '@hancad/legacy-bridge';
import { heading, pointInput, scalarInput } from './draw-curve-helpers';
import { drawKeyword, type DrawContext, type DrawRequest, type DrawValue } from './draw-program';
import { modifyId } from './modify-common';
import { peditFit, peditSpline } from './modify-poly-geometry';

export interface VertexEditResult {
  entity: CadPolyline;
  extras: CadEntity[];
  tangents: Map<number, number>;
}
export function* polylineVertexProgram(
  context: DrawContext,
  initial: CadPolyline,
  tangents: Map<number, number>,
): Generator<DrawRequest, VertexEditResult, DrawValue> {
  const entity = structuredClone(initial),
    extras: CadEntity[] = [];
  let index = 0;
  const mark = () => ({
    ...entity,
    id: 'pedit-vertex-marker',
    type: 'polyline' as const,
    points: [entity.points[index]!],
    sourceType: 'POINT',
    curve: {
      type: 'POINT' as const,
      position: {
        x: entity.points[index]!.x,
        y: -entity.points[index]!.y,
        z: entity.points[index]!.z ?? 0,
      },
    },
  });
  const clearSource = () => {
    delete entity.curve;
    delete entity.drawPaths;
  };
  for (;;) {
    const value = yield {
      kind: 'keyword',
      ko: '정점 편집 옵션 입력 [다음(N)/이전(P)/끊기(B)/삽입(I)/이동(M)/재생성(R)/직선화(S)/접선(T)/폭(W)/나가기(X)] <다음>:',
      en: 'Enter a vertex editing option [Next/Previous/Break/Insert/Move/Regen/Straighten/Tangent/Width/eXit] <Next>:',
      preview: () => [entity, mark()],
    };
    const option = drawKeyword(value);
    if (option === 'X' || option === 'EXIT') return { entity, extras, tangents };
    if (option === '' || option === 'N' || option === 'NEXT')
      index = Math.min(entity.points.length - 1, index + 1);
    else if (option === 'P' || option === 'PREVIOUS') index = Math.max(0, index - 1);
    else if (option === 'R' || option === 'REGEN') {
      if (entity.sourceType === 'POLYLINE_FIT') Object.assign(entity, peditFit(entity, tangents));
      else if (entity.sourceType?.startsWith('POLYLINE_SPLINE'))
        Object.assign(
          entity,
          peditSpline(
            entity,
            Number(context.get('SPLINETYPE')) || 6,
            Number(context.get('SPLINESEGS')) || 8,
          ),
        );
    } else if (option === 'M' || option === 'MOVE') {
      entity.points[index] = yield* pointInput({
        ko: '정점의 새 위치 지정:',
        en: 'Specify new location for vertex:',
        base: entity.points[index]!,
      });
      clearSource();
    } else if (option === 'I' || option === 'INSERT') {
      const point = yield* pointInput({
        ko: '새 정점 위치 지정:',
        en: 'Specify location for new vertex:',
        base: entity.points[index]!,
      });
      entity.points.splice(index + 1, 0, point);
      const remapped = new Map([...tangents].map(([i, angle]) => [i > index ? i + 1 : i, angle]));
      tangents.clear();
      for (const [i, angle] of remapped) tangents.set(i, angle);
      entity.bulges?.splice(index + 1, 0, 0);
      entity.startWidths?.splice(index + 1, 0, entity.startWidths[index] ?? 0);
      entity.endWidths?.splice(index + 1, 0, entity.endWidths[index] ?? 0);
      index++;
      clearSource();
    } else if (option === 'W' || option === 'WIDTH') {
      const start = yield* scalarInput(
        context,
        {
          ko: `시작 폭 지정 <${entity.startWidths?.[index] ?? entity.constantWidth ?? 0}>:`,
          en: 'Specify starting width:',
        },
        (n) => n >= 0,
        entity.startWidths?.[index] ?? entity.constantWidth ?? 0,
      );
      const end = yield* scalarInput(
        context,
        { ko: `끝 폭 지정 <${start}>:`, en: `Specify ending width <${start}>:` },
        (n) => n >= 0,
        start,
      );
      entity.startWidths ??= entity.points.map(() => entity.constantWidth ?? 0);
      entity.endWidths ??= entity.points.map(() => entity.constantWidth ?? 0);
      entity.startWidths[index] = start;
      entity.endWidths[index] = end;
      entity.constantWidth = 0;
      clearSource();
    } else if (option === 'T' || option === 'TANGENT') {
      for (;;) {
        const input = yield {
          kind: 'angle',
          ko: '정점의 접선 방향 지정:',
          en: 'Specify direction of vertex tangent:',
          base: entity.points[index]!,
        };
        const angle = heading(input, context, entity.points[index]);
        if (angle !== undefined) {
          tangents.set(index, angle);
          break;
        }
      }
    } else if (option === 'B' || option === 'BREAK' || option === 'S' || option === 'STRAIGHTEN') {
      const first = index;
      for (;;) {
        const sub = drawKeyword(
          yield {
            kind: 'keyword',
            ko: '옵션 입력 [다음(N)/이전(P)/실행(G)/나가기(X)] <다음>:',
            en: 'Enter an option [Next/Previous/Go/eXit] <Next>:',
            preview: () => [entity, mark()],
          },
        );
        if (sub === '' || sub === 'N' || sub === 'NEXT')
          index = Math.min(entity.points.length - 1, index + 1);
        else if (sub === 'P' || sub === 'PREVIOUS') index = Math.max(0, index - 1);
        else if (sub === 'X' || sub === 'EXIT') break;
        else if (sub === 'G' || sub === 'GO') {
          const lo = Math.min(first, index),
            hi = Math.max(first, index);
          if (option === 'S' || option === 'STRAIGHTEN') {
            if (hi > lo) {
              entity.points.splice(lo + 1, hi - lo - 1);
              entity.bulges?.splice(lo + 1, hi - lo - 1);
              entity.startWidths?.splice(lo + 1, hi - lo - 1);
              entity.endWidths?.splice(lo + 1, hi - lo - 1);
              const remapped = new Map(
                [...tangents]
                  .filter(([i]) => i <= lo || i >= hi)
                  .map(([i, angle]) => [i >= hi ? i - (hi - lo - 1) : i, angle]),
              );
              tangents.clear();
              for (const [i, angle] of remapped) tangents.set(i, angle);
            }
            entity.bulges ??= entity.points.map(() => 0);
            entity.bulges[lo] = 0;
            index = lo;
            clearSource();
          } else if (entity.closed) {
            const count = entity.points.length;
            entity.points = [...entity.points.slice(hi), ...entity.points.slice(0, lo + 1)];
            if (entity.bulges)
              entity.bulges = [...entity.bulges.slice(hi), ...entity.bulges.slice(0, lo + 1)];
            if (entity.startWidths)
              entity.startWidths = [
                ...entity.startWidths.slice(hi),
                ...entity.startWidths.slice(0, lo + 1),
              ];
            if (entity.endWidths)
              entity.endWidths = [
                ...entity.endWidths.slice(hi),
                ...entity.endWidths.slice(0, lo + 1),
              ];
            const remapped = [...tangents]
              .filter(([i]) => i >= hi || i <= lo)
              .map(([i, angle]) => [i >= hi ? i - hi : count - hi + i, angle] as const);
            tangents.clear();
            for (const [i, angle] of remapped) tangents.set(i, angle);
            entity.closed = false;
            entity.sourceType = 'LWPOLYLINE';
            index = 0;
            clearSource();
          } else if (
            !(lo === 0 && hi === entity.points.length - 1) &&
            (hi > lo || (lo > 0 && lo < entity.points.length - 1))
          ) {
            if (hi < entity.points.length - 1) {
              const remainder = {
                ...structuredClone(entity),
                id: modifyId(),
                points: entity.points.slice(hi),
                closed: false,
              };
              delete remainder.curve;
              delete remainder.drawPaths;
              if (entity.bulges) remainder.bulges = entity.bulges.slice(hi);
              if (entity.startWidths) remainder.startWidths = entity.startWidths.slice(hi);
              if (entity.endWidths) remainder.endWidths = entity.endWidths.slice(hi);
              extras.push(remainder);
              remainder.sourceType = 'LWPOLYLINE';
              remainder.peditTangents = Object.fromEntries(
                [...tangents].filter(([i]) => i >= hi).map(([i, angle]) => [i - hi, angle]),
              );
            }
            if (lo > 0) {
              entity.points = entity.points.slice(0, lo + 1);
              if (entity.bulges) entity.bulges = entity.bulges.slice(0, lo + 1);
              if (entity.startWidths) entity.startWidths = entity.startWidths.slice(0, lo + 1);
              if (entity.endWidths) entity.endWidths = entity.endWidths.slice(0, lo + 1);
            } else if (extras.length) {
              const remainder = extras.pop();
              if (remainder?.type === 'polyline') {
                Object.assign(entity, remainder, { id: initial.id });
                tangents.clear();
                for (const [i, angle] of Object.entries(remainder.peditTangents ?? {}))
                  tangents.set(Number(i), angle);
              }
            }
            entity.closed = false;
            entity.sourceType = 'LWPOLYLINE';
            const retained = [...tangents].filter(([i]) => i < entity.points.length);
            tangents.clear();
            for (const [i, angle] of retained) tangents.set(i, angle);
            index = Math.min(lo, entity.points.length - 1);
            clearSource();
          }
          break;
        }
      }
    }
  }
}
