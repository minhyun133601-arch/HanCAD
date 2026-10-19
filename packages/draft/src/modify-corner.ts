import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import {
  drawEntity,
  drawKeyword,
  drawPoint,
  type DrawContext,
  type DrawFactory,
  type DrawProgram,
} from './draw-program';
import { modifyId } from './modify-common';
import { filletSolution, chamferSolution, support } from './modify-corner-math';
import {
  polylineCorners,
  polylineCornerSolutions,
  type CornerSettings,
} from './modify-corner-polyline';
import { cornerOption } from './modify-corner-options';
import { blendProgram } from './modify-blend';
import { cornerPick, applyCornerPicks } from './modify-corner-pick';
import { draftEntityBase } from './entities';

function* cornerProgram(context: DrawContext, fillet: boolean): DrawProgram {
  let multiple = false,
    trim = Number(context.get('TRIMMODE')) !== 0,
    settings: CornerSettings = {
      fillet,
      radius: Number(context.get('FILLETRAD')) || 0,
      distance1:
        Number(context.get(Number(context.get('CHAMMODE')) === 1 ? 'CHAMFERC' : 'CHAMFERA')) || 0,
      distance2: Number(context.get('CHAMFERB')) || 0,
      ...(Number(context.get('CHAMMODE')) === 1
        ? { angle: Number(context.get('CHAMFERD')) || 0 }
        : {}),
    };
  const changed = new Map<string, CadEntity>(),
    removed = new Set<string>(),
    added: CadEntity[] = [],
    history: { changed: Map<string, CadEntity>; removed: Set<string>; added: CadEntity[] }[] = [];
  const result = () => ({
    entities: [...changed.values(), ...added.filter((e) => !changed.has(e.id))].filter(
      (e) => !removed.has(e.id),
    ),
    eraseIds: [...new Set([...changed.keys(), ...removed])],
  });
  const save = () =>
    history.push({ changed: new Map(changed), removed: new Set(removed), added: [...added] });
  const resolve = (entity: CadEntity | undefined): CadEntity | undefined =>
    !entity || removed.has(entity.id)
      ? undefined
      : context.editableIds &&
          !context.editableIds.has(entity.id) &&
          !added.some((e) => e.id === entity.id)
        ? undefined
        : (changed.get(entity.id) ??
          added.find((e) => e.id === entity.id) ??
          context.entities.find((e) => e.id === entity.id));
  let notice: { ko: string; en: string } | undefined;
  for (;;) {
    const partial = result(),
      value = yield {
        kind: 'entity',
        ko: fillet
          ? '첫 번째 객체 선택 또는 [명령 취소(U)/폴리선(P)/반지름(R)/자르기(T)/다중(M)]:'
          : '첫 번째 선 선택 또는 [명령 취소(U)/폴리선(P)/거리(D)/각도(A)/자르기(T)/방법(E)/다중(M)]:',
        en: fillet
          ? 'Select first object or [Undo/Polyline/Radius/Trim/Multiple]:'
          : 'Select first line or [Undo/Polyline/Distance/Angle/Trim/mEthod/Multiple]:',
        partial: partial.entities,
        partialEraseIds: partial.eraseIds,
        ...(notice ? { notice } : {}),
      };
    notice = undefined;
    const key = drawKeyword(value);
    if (value === '') return partial;
    if (['M', 'MULTIPLE'].includes(key)) {
      multiple = true;
      continue;
    }
    if (['U', 'UNDO'].includes(key)) {
      const last = history.pop();
      if (last) {
        changed.clear();
        last.changed.forEach((e, id) => changed.set(id, e));
        removed.clear();
        last.removed.forEach((id) => removed.add(id));
        added.splice(0, added.length, ...last.added);
      }
      continue;
    }
    const option = yield* cornerOption(context, key, settings, trim);
    settings = option.settings;
    trim = option.trim;
    if (option.handled) continue;
    if (['P', 'POLYLINE'].includes(key)) {
      const selected = resolve(
        drawEntity(
          yield {
            kind: 'entity',
            ko: '2D 폴리선 선택:',
            en: 'Select 2D polyline:',
            partial: partial.entities,
            partialEraseIds: partial.eraseIds,
          },
        ),
      );
      if (selected?.type !== 'polyline' && selected?.type !== 'rect') {
        notice = { ko: '2D 폴리선이 아닙니다.', en: 'Object is not a 2D polyline.' };
        continue;
      }
      try {
        const next = trim ? polylineCorners(selected, settings) : undefined;
        save();
        if (next) changed.set(selected.id, next);
        else
          for (const solution of polylineCornerSolutions(selected, settings).values())
            if (solution.connector) added.push({ ...solution.connector, id: modifyId() });
        if (!multiple) return result();
      } catch {
        notice = {
          ko: '모깎기 반지름 또는 모따기 거리가 너무 큽니다.',
          en: 'Fillet radius or chamfer distance is too large.',
        };
      }
      continue;
    }
    const first = resolve(drawEntity(value)),
      pickA = drawPoint(value);
    const firstPick = first && pickA ? cornerPick(first, pickA) : undefined;
    if (!first || !pickA || !firstPick) continue;
    const shiftFirst = context.isShiftPressed?.() ?? false;
    const build = (
      second: CadEntity,
      pickB: CadPoint,
      shift: boolean,
    ): { entities: CadEntity[]; replacements: CadEntity[]; eraseIds: string[] } | undefined => {
      const secondPick = cornerPick(second, pickB);
      if (!secondPick) return;
      if (firstPick.owner.id === secondPick.owner.id && firstPick.index === secondPick.index)
        return;
      const solution = fillet
        ? filletSolution(firstPick.part, secondPick.part, pickA, pickB, shift ? 0 : settings.radius)
        : chamferSolution(
            firstPick.part,
            secondPick.part,
            pickA,
            pickB,
            shift ? 0 : settings.distance1,
            shift ? 0 : settings.distance2,
            shift ? undefined : settings.angle,
          );
      if (!solution) return;
      const edits = applyCornerPicks(firstPick, secondPick, pickA, pickB, solution, trim);
      if (!edits) return;
      const replacements = edits.replacements;
      const connector = edits.connector
        ? {
            ...edits.connector,
            ...(first.layer !== second.layer ? draftEntityBase(context.settings) : {}),
            id: modifyId(),
            layer: first.layer === second.layer ? first.layer : context.settings.layer,
          }
        : undefined;
      return {
        entities: [...replacements, ...(connector ? [connector] : [])],
        replacements,
        eraseIds: edits.eraseIds,
      };
    };
    const answer = yield {
      kind: 'entity',
      ko: fillet
        ? '두 번째 객체 선택 또는 Shift 키를 누른 채 선택하여 구석 적용:'
        : '두 번째 선 선택 또는 Shift 키를 누른 채 선택하여 구석 적용:',
      en: 'Select second object or shift-select to apply corner:',
      partial: partial.entities,
      partialEraseIds: partial.eraseIds,
      preview: (p) => {
        if (Number(context.get('COMMANDPREVIEW')) === 0) return [];
        const candidates = [...context.entities, ...added].filter(
          (e) =>
            (e.id !== first.id || firstPick.index !== undefined) &&
            (support(e) || cornerPick(e, p)),
        );
        let nearest: CadEntity | undefined,
          min = Infinity;
        for (const candidate of candidates) {
          const s = support(cornerPick(candidate, p)?.part ?? candidate);
          if (!s) continue;
          const d =
            s.kind === 'line'
              ? Math.abs((p.x - s.a.x) * s.direction.y - (p.y - s.a.y) * s.direction.x)
              : Math.abs(Math.hypot(p.x - s.center.x, p.y - s.center.y) - s.radius);
          if (d < min) {
            min = d;
            nearest = resolve(candidate);
          }
        }
        return nearest
          ? (build(nearest, p, shiftFirst || (context.isShiftPressed?.() ?? false))?.entities ?? [])
          : [];
      },
    };
    const second = resolve(drawEntity(answer)),
      pickB = drawPoint(answer);
    if (answer === '') return result();
    if (!second || !pickB) continue;
    const next = build(second, pickB, shiftFirst || (context.isShiftPressed?.() ?? false));
    if (!next) {
      notice = {
        ko: '이 객체들을 모깎기 또는 모따기할 수 없습니다.',
        en: 'Cannot fillet or chamfer these objects.',
      };
      continue;
    }
    save();
    next.replacements.forEach((e) => changed.set(e.id, e));
    next.eraseIds
      .filter((id) => !next.replacements.some((e) => e.id === id))
      .forEach((id) => removed.add(id));
    added.push(...next.entities.filter((e) => !next.replacements.includes(e)));
    if (!multiple) return result();
  }
}
export const cornerFactories: Record<string, DrawFactory> = {
  FILLET: (c) => cornerProgram(c, true),
  CHAMFER: (c) => cornerProgram(c, false),
  BLEND: blendProgram,
};
