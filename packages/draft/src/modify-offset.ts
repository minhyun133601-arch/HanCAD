import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import {
  drawEntity,
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawFactory,
  type DrawProgram,
} from './draw-program';
import { distance } from './draw-curve-helpers';
import { numeric } from './draw-curve-helpers';
import { modifyId } from './modify-common';
import { offsetModifyEntity } from './modify-offset-curves';
import { closestGeometryPoint, geometryEvaluation } from '@hancad/geom';
import { wcs } from './draw-curve-helpers';

interface OffsetStep {
  created: CadEntity[];
  source: CadEntity;
  erased: boolean;
}
export function* offsetProgram(context: DrawContext): DrawProgram {
  let offset = Number(context.get('OFFSETDIST')) || -1,
    erase = false,
    currentLayer = false,
    multiple = false;
  const steps: OffsetStep[] = [];
  const curveCache = new Map<string, CadEntity[]>();
  const result = () => ({
    entities: steps
      .flatMap((s) => s.created)
      .filter((e) => !steps.some((s) => s.erased && s.source.id === e.id)),
    eraseIds: steps
      .filter((s) => s.erased && context.entities.some((e) => e.id === s.source.id))
      .map((s) => s.source.id),
  });
  for (;;) {
    const value = yield {
      kind: 'number',
      ko: `간격띄우기 거리 지정 또는 [통과(T)/지우기(E)/도면층(L)] <${offset < 0 ? '통과' : offset}>:`,
      en: `Specify offset distance or [Through/Erase/Layer] <${offset < 0 ? 'Through' : offset}>:`,
    };
    const key = drawKeyword(value);
    if (['E', 'ERASE'].includes(key)) {
      for (;;) {
        const answer = drawKeyword(
          yield {
            kind: 'keyword',
            ko: `원본 객체를 지우시겠습니까? [예(Y)/아니오(N)] <${erase ? '예' : '아니오'}>:`,
            en: `Erase source object? [Yes/No] <${erase ? 'Yes' : 'No'}>:`,
          },
        );
        if (!answer || ['Y', 'YES', 'N', 'NO'].includes(answer)) {
          if (answer) erase = answer.startsWith('Y');
          break;
        }
      }
      continue;
    }
    if (['L', 'LAYER'].includes(key)) {
      for (;;) {
        const answer = drawKeyword(
          yield {
            kind: 'keyword',
            ko: `간격띄우기 객체 도면층 입력 [현재(C)/원본(S)] <${currentLayer ? '현재' : '원본'}>:`,
            en: `Enter layer option for offset objects [Current/Source] <${currentLayer ? 'Current' : 'Source'}>:`,
          },
        );
        if (!answer || ['C', 'CURRENT', 'S', 'SOURCE'].includes(answer)) {
          if (answer) currentLayer = answer.startsWith('C');
          break;
        }
      }
      continue;
    }
    if (['T', 'THROUGH'].includes(key)) {
      offset = -1;
      break;
    }
    if (value === '') break;
    const n = numeric(value, context),
      p = drawPoint(value);
    if (n !== undefined && n > 0) {
      offset = n;
      break;
    }
    if (p) {
      const second = yield {
        kind: 'point',
        ko: '두 번째 점 지정:',
        en: 'Specify second point:',
        base: p,
      };
      const q = drawPoint(second);
      if (q && distance(p, q) > 0) {
        offset = distance(p, q);
        break;
      }
    }
  }
  context.set('OFFSETDIST', offset);
  let source: CadEntity | undefined;
  let notice: { ko: string; en: string } | undefined;
  for (;;) {
    const partial = result();
    if (!source) {
      const value = yield {
        kind: 'entity',
        ko: '간격띄우기할 객체 선택 또는 [종료(E)/명령 취소(U)] <종료>:',
        en: 'Select object to offset or [Exit/Undo] <exit>:',
        partial: partial.entities,
        partialEraseIds: partial.eraseIds,
        ...(notice ? { notice } : {}),
      };
      notice = undefined;
      const key = drawKeyword(value);
      if (value === '' || ['E', 'EXIT'].includes(key)) return partial;
      if (['U', 'UNDO'].includes(key)) {
        steps.pop();
        continue;
      }
      const pick = drawEntity(value);
      source =
        pick && !(partial.eraseIds ?? []).includes(pick.id)
          ? (partial.entities.find((e) => e.id === pick.id) ??
            context.entities.find((e) => e.id === pick.id))
          : undefined;
      if (
        source &&
        context.editableIds &&
        !context.editableIds.has(source.id) &&
        !partial.entities.some((e) => e.id === source!.id)
      ) {
        source = undefined;
        notice = { ko: '잠긴 도면층의 객체입니다.', en: 'Object is on a locked layer.' };
      }
      if (!source) continue;
    }
    const selected = source;
    const build = (point: CadPoint): CadEntity[] => {
      let key: string | undefined;
      if (offset > 0 && (selected.curve?.type === 'ELLIPSE' || selected.curve?.type === 'SPLINE')) {
        const pick = wcs(point),
          near = closestGeometryPoint(selected.curve, pick),
          d = geometryEvaluation(selected.curve, near.parameter).derivative,
          side = Math.sign(-d.y * (pick.x - near.point.x) + d.x * (pick.y - near.point.y));
        key = `${selected.id}:${offset}:${side}`;
        const cached = curveCache.get(key);
        if (cached) return cached.map((e, i) => ({ ...e, id: `${modifyId()}-${i}` }));
      }
      const output = offsetModifyEntity(selected, {
        point,
        distance: offset,
        gapType: Number(context.get('OFFSETGAPTYPE')) || 0,
        id: modifyId(),
        ...(currentLayer ? { layer: context.settings.layer } : {}),
      });
      if (key) {
        if (curveCache.size >= 8) curveCache.delete(curveCache.keys().next().value!);
        curveCache.set(key, output);
      }
      return output;
    };
    const value = yield {
      kind: 'point',
      ko:
        offset < 0
          ? '통과점 지정 또는 [종료(E)/다중(M)/명령 취소(U)] <종료>:'
          : '간격띄우기할 면의 점 지정 또는 [종료(E)/다중(M)/명령 취소(U)] <종료>:',
      en:
        offset < 0
          ? 'Specify through point or [Exit/Multiple/Undo] <exit>:'
          : 'Specify point on side to offset or [Exit/Multiple/Undo] <exit>:',
      partial: partial.entities,
      partialEraseIds: partial.eraseIds,
      previewHiddenIds: erase ? [selected.id] : [],
      preview: (p) => {
        if (Number(context.get('COMMANDPREVIEW')) === 0) return [];
        try {
          return build(p);
        } catch {
          return [];
        }
      },
    };
    const key = drawKeyword(value);
    if (value === '' || ['E', 'EXIT'].includes(key)) {
      if (multiple) {
        source = undefined;
        multiple = false;
        continue;
      }
      return partial;
    }
    if (['U', 'UNDO'].includes(key)) {
      const previous = steps.pop();
      source = multiple ? previous?.source : undefined;
      continue;
    }
    if (['M', 'MULTIPLE'].includes(key)) {
      multiple = true;
      continue;
    }
    const point = drawPoint(value);
    if (!point) continue;
    try {
      const created = build(point);
      if (!created.length) throw new Error('Collapsed offset.');
      steps.push({ created, source: selected, erased: erase });
      source = multiple ? created[0] : undefined;
    } catch {
      source = undefined;
      notice = { ko: '해당 객체를 간격띄우기할 수 없습니다.', en: 'Cannot offset that object.' };
    }
  }
}
export const offsetFactories: Record<string, DrawFactory> = { OFFSET: offsetProgram };
