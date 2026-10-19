import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import { pointInput } from './draw-curve-helpers';
import { drawKeyword, drawPoint, type DrawContext, type DrawProgram } from './draw-program';
import { gripProvider } from './grip-providers';
import { modifyResult, modifySelection } from './modify-common';
import { selectionPolygonContains } from './selection-path';
import { transformGripPoint } from './grip-transform';
import { transformMetadata } from './modify-transform-metadata';
import { deltaPoint, origin, pointDistance, transformEntities } from './modify-transform-geometry';
import { peditFit, peditSpline } from './modify-poly-geometry';
import { mirrorNativeHatch } from './native-hatch-mirror';
import { nativeObjectSelectionId } from './native-object-identity';

export function* mirrorProgram(context: DrawContext): DrawProgram {
  const originals = modifySelection(context);
  const wanted = new Set(context.selectedIds ?? []),
    reserved = new Set(context.entities.map((entity) => entity.id)),
    native = (context.nativeObjects ?? []).filter((object) =>
      wanted.has(
        context.nativeSelectionIds?.get(object.handle) ??
          nativeObjectSelectionId(object.handle, reserved),
      ),
    );
  if (!originals.length && !native.length) return { entities: [] };
  try {
    for (const object of native) mirrorNativeHatch(object, { x: 0, y: 0 }, { x: 1, y: 0 }, false);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const detail = reason.includes('Associative')
      ? '연관 HATCH의 경계 참조 대칭은 아직 지원하지 않습니다.'
      : reason.includes('Gradient')
        ? '그라데이션 HATCH 대칭은 아직 지원하지 않습니다.'
        : '지원하지 않거나 유효하지 않은 HATCH 경계 또는 패턴 데이터입니다.';
    return {
      entities: [],
      messages: [
        {
          ko: `HATCH 대칭을 수행할 수 없습니다. ${detail}`,
          en: `Cannot mirror HATCH: ${reason}`,
        },
      ],
    };
  }
  const base = yield* pointInput({
    ko: '대칭선의 첫 번째 점 지정:',
    en: 'Specify first point of mirror line:',
  });
  const mirroredText = Number(context.get('MIRRTEXT') ?? 0) !== 0;
  let end: CadPoint | undefined;
  const preview = (p: CadPoint) =>
    transformEntities(
      originals,
      'MIRROR',
      base,
      Math.atan2(p.y - base.y, p.x - base.x),
      true,
      mirroredText,
    );
  while (!end) {
    const point = drawPoint(
      yield {
        kind: 'point',
        ko: '대칭선의 두 번째 점 지정:',
        en: 'Specify second point of mirror line:',
        base,
        preview,
      },
    );
    if (point && pointDistance(base, point) > 1e-12) end = point;
  }
  const entities = preview(end);
  for (;;) {
    const value = yield {
      kind: 'keyword',
      ko: '원본 객체를 지우시겠습니까? [예(Y)/아니오(N)] <아니오>:',
      en: 'Erase source objects? [Yes/No] <No>:',
      previewEntities: entities,
      preview: () => entities,
    };
    const key = drawKeyword(value);
    const map = (_batch: number, p: CadPoint) =>
      transformGripPoint(p, 'MIRROR', base, Math.atan2(end.y - base.y, end.x - base.x));
    const erase = ['Y', 'YES', '예'].includes(key);
    if (erase || value === '' || ['N', 'NO', '아니오'].includes(key)) {
      const result = transformMetadata(
        context,
        originals,
        erase ? modifyResult(originals, entities) : { entities },
        map,
      );
      if (native.length) {
        result.nativeCopies = native.map((object) => ({
          sourceHandle: object.handle,
          object: mirrorNativeHatch(object, base, end, Number(context.get('MIRRHATCH') ?? 0) !== 0),
          eraseSource: erase,
        }));
        result.messages = [
          {
            ko: '원시 HATCH 경계와 패턴 정의를 대칭했습니다. HATCH 패턴 화면 표시는 아직 지원하지 않습니다.',
            en: 'Mirrored native HATCH boundary and pattern definitions. HATCH pattern display is not supported yet.',
          },
        ];
      }
      return result;
    }
  }
}
/** STRETCH uses crossing masks on definition points rather than selection bounds. */
export function stretchEntities(
  context: DrawContext,
  originals: readonly CadEntity[],
  delta: CadPoint,
): CadEntity[] {
  const windows = (context.selectionWindows ?? []).filter((w) => w.crossing);
  if (!windows.length) return transformEntities(originals, 'MOVE', origin, delta);
  const blocks = context.blocks ?? [];
  const individual = new Set(context.individuallySelectedIds ?? []);
  return originals.map((entity) => {
    const contains = (p: CadPoint) =>
      windows.some(
        (w) => (!w.ids || w.ids.includes(entity.id)) && selectionPolygonContains(w.points, p),
      );
    if (individual.has(entity.id)) return transformEntities([entity], 'MOVE', origin, delta)[0]!;
    const block = blocks.find((b) => b.entityIds.includes(entity.id));
    if (block)
      return contains(block.basePoint)
        ? transformEntities([entity], 'MOVE', origin, delta)[0]!
        : structuredClone(entity);
    if (
      (entity.type === 'polyline' || entity.type === 'rect') &&
      /^POLYLINE_(FIT|SPLINE)/.test(entity.sourceType ?? '')
    ) {
      const points = entity.points.map((p) =>
          contains(p) ? transformGripPoint(p, 'MOVE', origin, delta) : { ...p },
        ),
        frame = { ...entity, points };
      if (entity.sourceType === 'POLYLINE_FIT')
        return peditFit(
          frame,
          new Map(Object.entries(entity.peditTangents ?? {}).map(([i, a]) => [Number(i), a])),
        );
      const degree = entity.sourceType === 'POLYLINE_SPLINE_QUADRATIC' ? 2 : 3,
        count = Math.max(
          1,
          Math.round(
            ((entity.drawPaths?.[0]?.length ?? 9) - (entity.closed ? 0 : 1)) /
              Math.max(1, entity.points.length - degree),
          ),
        );
      const arcs =
        (entity.curve?.type === 'POLYLINE' || entity.curve?.type === 'LWPOLYLINE') &&
        entity.curve.vertices.some((v) => v.bulge !== 0);
      return peditSpline(frame, degree === 2 ? 5 : 6, arcs ? -count : count);
    }
    const provider = gripProvider(entity);
    const rigid =
      entity.type === 'circle' ||
      entity.type === 'text' ||
      entity.curve?.type === 'ELLIPSE' ||
      entity.regionLoops;
    if (rigid) {
      const anchor =
        entity.type === 'circle'
          ? entity.center
          : entity.type === 'text'
            ? entity.point
            : entity.curve?.type === 'ELLIPSE'
              ? { x: entity.curve.center.x, y: -entity.curve.center.y }
              : provider.grips(entity, false)[0]?.point;
      return anchor && contains(anchor)
        ? transformEntities([entity], 'MOVE', origin, delta)[0]!
        : structuredClone(entity);
    }
    const keys = provider
      .grips(entity, false)
      .filter((g) => (g.kind === 'vertex' || g.kind === 'insertion') && contains(g.point))
      .map((g) => g.key);
    return keys.length ? provider.stretch(entity, keys, delta) : structuredClone(entity);
  });
}
export function* stretchProgram(context: DrawContext): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  let base: CadPoint | undefined;
  for (;;) {
    const value = yield {
      kind: 'point',
      ko: '기준점 지정 또는 [변위(D)] <변위>:',
      en: 'Specify base point or [Displacement] <Displacement>:',
    };
    const key = drawKeyword(value);
    if (value === '' || key === 'D' || key === 'DISPLACEMENT') {
      const delta = yield* pointInput({
        ko: '변위 지정 <0,0,0>:',
        en: 'Specify displacement <0,0,0>:',
        base: origin,
        preview: (p) => stretchEntities(context, originals, p),
      });
      return stretchResult(context, originals, delta);
    }
    base = drawPoint(value);
    if (base) break;
  }
  for (;;) {
    const value = yield {
      kind: 'point',
      ko: '두 번째 점 지정 또는 <첫 번째 점을 변위로 사용>:',
      en: 'Specify second point or <use first point as displacement>:',
      base,
      preview: (p: CadPoint) => stretchEntities(context, originals, deltaPoint(p, base)),
    };
    const p = drawPoint(value),
      delta = value === '' ? base : p ? deltaPoint(p, base) : undefined;
    if (delta) return stretchResult(context, originals, delta);
  }
}
function stretchResult(context: DrawContext, originals: CadEntity[], delta: CadPoint) {
  const windows = (context.selectionWindows ?? []).filter((w) => w.crossing);
  const individual = new Set(context.individuallySelectedIds ?? []),
    individualBlockBases = new Set(
      (context.blocks ?? [])
        .filter((b) => b.entityIds.some((id) => individual.has(id)))
        .map((b) => b.basePoint),
    );
  return transformMetadata(
    context,
    originals,
    modifyResult(originals, stretchEntities(context, originals, delta)),
    (_batch, p) =>
      !windows.length ||
      individualBlockBases.has(p) ||
      windows.some(
        (w) =>
          selectionPolygonContains(w.points, p) &&
          (!w.ids ||
            (context.blocks ?? []).some(
              (b) => b.basePoint === p && b.entityIds.some((id) => w.ids!.includes(id)),
            )),
      )
        ? transformGripPoint(p, 'MOVE', origin, delta)
        : p,
  );
}
