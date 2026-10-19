import type { CadEntity, CadPoint, CadPolyline } from '@hancad/legacy-bridge';
import { drawEntity, drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawProgram, DrawRequest, DrawValue } from './draw-program';
import {
  length,
  outlineDefault,
  outlineEditable,
  outlineMemory,
  outlineNumber,
  outlinePoint,
  outlineSourceStyle,
} from './draw-outline-common';
import { cloudEntity, cloudObjectBoundary, cloudOptions } from './draw-cloud-geometry';
import type { CloudOptions } from './draw-cloud-geometry';
import { modifyCloud } from './draw-cloud-modify';

function* reverseCloud(entity: CadPolyline): Generator<DrawRequest, CadPolyline, DrawValue> {
  while (true) {
    const answer = drawKeyword(
      yield {
        kind: 'keyword',
        ko: '방향을 반전시키시겠습니까? [예(Y)/아니오(N)] <아니오>:',
        en: 'Reverse direction [Yes/No] <No>:',
        preview: () => [entity],
      },
    );
    if (answer === 'Y' || answer === 'YES')
      return { ...entity, bulges: entity.bulges?.map((b) => -b) ?? [] };
    if (answer === '' || answer === 'N' || answer === 'NO') return entity;
  }
}
function* cloudPath(
  context: DrawContext,
  first: CadPoint,
  mode: number,
  options: CloudOptions,
): Generator<DrawRequest, CadPolyline | undefined, DrawValue> {
  const id = `draft-${crypto.randomUUID()}`;
  if (mode === 1) {
    const boundary = (point: CadPoint) => [
      first,
      { x: point.x, y: first.y },
      point,
      { x: first.x, y: point.y },
    ];
    const end = yield* outlinePoint('반대 구석점 지정:', 'Specify opposite corner:', {
      base: first,
      preview: (p) => [cloudEntity(context, boundary(p), true, options, id)],
    });
    if (Math.abs(end.x - first.x) < 1e-12 || Math.abs(end.y - first.y) < 1e-12) return undefined;
    return cloudEntity(context, boundary(end), true, options, id);
  }
  const points = [first],
    freehand = mode === 0;
  while (true) {
    const partial: CadEntity[] =
      freehand && points.length > 1 ? [cloudEntity(context, points, false, options, id)] : [];
    const value = yield {
      kind: 'point',
      ko: freehand
        ? '구름형 경로를 따라 십자선을 이동하십시오:'
        : '다음 점 지정 또는 [명령 취소(U)/닫기(C)] <닫기>:',
      en: freehand
        ? 'Guide crosshairs along cloud path:'
        : 'Specify next point or [Undo/Close] <Close>:',
      base: points.at(-1)!,
      freehand,
      partial,
      preview: (p) => [cloudEntity(context, [...points, p], false, options, id)],
    };
    const point = drawPoint(value),
      key = drawKeyword(value);
    if (point) {
      if (points.length > 2 && length(point, first) <= (freehand ? options.chord * 0.75 : 1e-9))
        return cloudEntity(context, points, true, options, id);
      if (freehand && length(point, points.at(-1)!) < options.chord * 0.8) continue;
      if (length(point, points.at(-1)!) > 1e-12) points.push(point);
      continue;
    }
    if (key === 'U' || key === 'UNDO') {
      if (points.length > 1) points.pop();
      continue;
    }
    if (key === '' || key === 'C' || key === 'CLOSE') {
      if (points.length >= (freehand ? 2 : 3))
        return cloudEntity(context, points, !freehand || key !== '', options, id);
    }
  }
}
export function* drawRevcloud(context: DrawContext): DrawProgram {
  const memory = outlineMemory(context),
    options = cloudOptions(context);
  if (outlineDefault(context, 'REVCLOUDAPPROXARCLEN', 0) <= 0) {
    const scale =
      outlineDefault(context, 'REVCLOUDSCALEMODE', 0) === 1
        ? outlineDefault(context, 'DIMSCALE', 1)
        : 1;
    context.set('REVCLOUDAPPROXARCLEN', options.chord / scale);
  }
  options.calligraphy = memory.get('REVCLOUD.style') === 'Calligraphy';
  let mode = outlineDefault(context, 'REVCLOUDCREATEMODE', 1);
  const setMode = (value: number) => {
    mode = value;
    context.set('REVCLOUDCREATEMODE', value);
  };
  while (true) {
    const value = yield {
      kind: 'point',
      ko: `${mode === 1 ? '첫 번째 구석점' : '시작점'} 지정 또는 [호 길이(A)/객체(O)/직사각형(R)/폴리곤(P)/자유형(F)/스타일(S)/수정(M)]:`,
      en: `Specify ${mode === 1 ? 'first corner point' : 'start point'} or [Arc length/Object/Rectangular/Polygonal/Freehand/Style/Modify]:`,
    };
    const key = drawKeyword(value),
      first = drawPoint(value);
    if (key === 'A' || key === 'ARC' || key === 'ARC LENGTH') {
      const scale =
        outlineDefault(context, 'REVCLOUDSCALEMODE', 0) === 1
          ? outlineDefault(context, 'DIMSCALE', 1)
          : 1;
      const chord = yield* outlineNumber(
        context,
        `대략적인 호 길이 지정 <${options.chord / scale}>:`,
        `Specify approximate arc length <${options.chord / scale}>:`,
        { min: 0, strict: true, fallback: options.chord / scale },
      );
      context.set('REVCLOUDAPPROXARCLEN', chord);
      options.chord = chord * scale;
      continue;
    }
    if (key === 'R' || key === 'RECTANGULAR') {
      setMode(1);
      continue;
    }
    if (key === 'P' || key === 'POLYGONAL') {
      setMode(2);
      continue;
    }
    if (key === 'F' || key === 'FREEHAND') {
      setMode(0);
      continue;
    }
    if (key === 'S' || key === 'STYLE') {
      while (true) {
        const style = drawKeyword(
          yield {
            kind: 'keyword',
            ko: `호 스타일 선택 [일반(N)/캘리그래피(C)] <${options.calligraphy ? '캘리그래피' : '일반'}>:`,
            en: `Select arc style [Normal/Calligraphy] <${options.calligraphy ? 'Calligraphy' : 'Normal'}>:`,
          },
        );
        if (style === '') break;
        if (style === 'N' || style === 'NORMAL') {
          options.calligraphy = false;
          break;
        }
        if (style === 'C' || style === 'CALLIGRAPHY') {
          options.calligraphy = true;
          break;
        }
      }
      memory.set('REVCLOUD.style', options.calligraphy ? 'Calligraphy' : 'Normal');
      continue;
    }
    if (key === 'M' || key === 'MODIFY') return yield* modifyCloud(context, options);
    if (key === 'O' || key === 'OBJECT') {
      let invalid = false;
      while (true) {
        const picked = yield {
          kind: 'entity',
          ko: '객체 선택:',
          en: 'Select object:',
          ...(invalid
            ? { notice: { ko: '닫힌 객체를 선택하십시오.', en: 'Select a closed object.' } }
            : {}),
        };
        const source = drawEntity(picked),
          boundary = source ? cloudObjectBoundary(source, options.chord) : undefined;
        if (!boundary || !source || !outlineEditable(context, source)) {
          invalid = true;
          continue;
        }
        const styledContext = outlineSourceStyle(context, source);
        const entity = yield* reverseCloud(cloudEntity(styledContext, boundary, true, options));
        return { entities: [entity], eraseIds: [source.id] };
      }
    }
    if (!first) continue;
    const entity = yield* cloudPath(context, first, mode, options);
    if (entity) return { entities: [yield* reverseCloud(entity)] };
  }
}
