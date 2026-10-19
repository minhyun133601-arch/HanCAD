import type { CadEntity } from '@hancad/legacy-bridge';
import { drawEntity, drawKeyword } from './draw-program';
import type { DrawContext, DrawProgram } from './draw-program';
import { outlineDefault, outlineEditable, outlinePolyline } from './draw-outline-common';
import { regionLoops } from './draw-region-geometry';

export function* drawRegion(context: DrawContext): DrawProgram {
  const selected: CadEntity[] = [];
  let ignored = false;
  while (true) {
    const value = yield {
      kind: 'entity',
      ko: '객체 선택:',
      en: 'Select objects:',
      ...(ignored
        ? {
            notice: {
              ko: '잠긴 도면층이나 숨겨진 도면층의 객체는 무시됩니다.',
              en: 'Objects on locked or hidden layers are ignored.',
            },
          }
        : {}),
    };
    ignored = false;
    const entity = drawEntity(value);
    if (entity) {
      if (!outlineEditable(context, entity)) {
        ignored = true;
        continue;
      }
      if (!selected.some((e) => e.id === entity.id)) selected.push(entity);
      continue;
    }
    if (drawKeyword(value) === 'ALL') {
      selected.push(
        ...context.entities.filter(
          (e) => outlineEditable(context, e) && !selected.some((s) => s.id === e.id),
        ),
      );
      continue;
    }
    if (drawKeyword(value) !== '') continue;
    const loops = regionLoops(selected),
      eraseIds = new Set<string>();
    const entities = loops.map((loop) => {
      loop.edges.forEach((edge) => eraseIds.add(edge.sourceId));
      return {
        ...outlinePolyline(context, loop.points, true),
        sourceType: 'REGION',
        regionLoops: [loop.edges.map((edge) => edge.curve)],
        regionArea: loop.area,
      };
    });
    return {
      entities,
      ...(outlineDefault(context, 'DELOBJ', 1) !== 0 ? { eraseIds: [...eraseIds] } : {}),
      messages: [
        {
          ko: `${entities.length}개의 영역이 작성되었습니다.${selected.length && !entities.length ? ' 닫힌 평면 루프를 형성할 수 없습니다.' : ''}`,
          en: `${entities.length} regions created.${selected.length && !entities.length ? ' Could not form a closed planar loop.' : ''}`,
        },
      ],
    };
  }
}
