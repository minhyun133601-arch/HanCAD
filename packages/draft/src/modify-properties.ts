import type { CadEntity } from '@hancad/legacy-bridge';
import { drawKeyword, drawPoint } from './draw-program';
import type { DrawContext, DrawFactory, DrawProgram, DrawRequest } from './draw-program';
import { modifyResult, modifySelection } from './modify-common';
import { heading, numeric } from './draw-curve-helpers';
import { syncSimpleDrawCurve } from './draw-simple-grips';
import { transformGripEntity } from './grip-transform';
import { propertyValuePrompt } from './modify-property-prompts';
import { changeBlocksProgram } from './modify-change-blocks';
import { editSelection } from './modify-selection';

const weights = [
  0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200,
  211,
];
const aliases: Record<string, string> = {
  C: 'COLOR',
  LA: 'LAYER',
  LT: 'LTYPE',
  S: 'LTSCALE',
  LW: 'LWEIGHT',
  T: 'THICKNESS',
  TR: 'TRANSPARENCY',
  E: 'ELEV',
  A: 'ANNOTATIVE',
  M: 'MATERIAL',
  P: 'PLOTSTYLE',
};
const namedColors = ['BYBLOCK', 'RED', 'YELLOW', 'GREEN', 'CYAN', 'BLUE', 'MAGENTA', 'WHITE'];

export function modifyProperty(
  context: DrawContext,
  entities: readonly CadEntity[],
  property: string,
  input: string,
): CadEntity[] | undefined {
  const text = input.trim(),
    key = text.toUpperCase(),
    number = Number(text);
  const result = structuredClone([...entities]);
  if (property === 'COLOR') {
    const aci =
      key === 'BYLAYER' ? 256 : namedColors.includes(key) ? namedColors.indexOf(key) : number;
    const rgb = /^#[\da-f]{6}$/i.test(text)
      ? parseInt(text.slice(1), 16)
      : /^\d{1,3},\d{1,3},\d{1,3}$/.test(text) && text.split(',').every((n) => Number(n) <= 255)
        ? text.split(',').reduce((v, n) => v * 256 + Number(n), 0)
        : undefined;
    if (rgb === undefined && (!text || !Number.isInteger(aci) || aci < 0 || aci > 256)) return;
    for (const entity of result) {
      if (rgb !== undefined) {
        entity.trueColor = rgb;
        entity.color = `#${rgb.toString(16).padStart(6, '0')}`;
        delete entity.aci;
      } else {
        entity.aci = aci;
        delete entity.trueColor;
      }
    }
  } else if (property === 'LAYER') {
    const layer = context.layers?.find((layer) => layer.name.toUpperCase() === key);
    if (!layer) return;
    for (const entity of result) entity.layer = layer.name;
  } else if (property === 'LTYPE') {
    const builtin = ['BYLAYER', 'BYBLOCK', 'CONTINUOUS', 'DASHED', 'HIDDEN', 'CENTER', 'DOT'];
    const ltype = builtin.includes(key)
      ? key
      : context.linetypes?.find((line) => line.name.toUpperCase() === key)?.name;
    if (!ltype) return;
    for (const entity of result) entity.linetype = ltype;
  } else if (property === 'LTSCALE') {
    if (!text || !Number.isFinite(number) || number <= 0) return;
    for (const entity of result) entity.linetypeScale = number;
  } else if (property === 'LWEIGHT') {
    const value =
      key === 'BYLAYER' ? -1 : key === 'BYBLOCK' ? -2 : key === 'DEFAULT' ? -3 : number * 100;
    if (!text || !Number.isFinite(value) || (value < 0 && ![-1, -2, -3].includes(value))) return;
    const weight =
      value < 0
        ? value
        : weights.reduce((a, b) => (Math.abs(a - value) <= Math.abs(b - value) ? a : b));
    for (const entity of result) entity.lineweight = weight;
  } else if (property === 'TRANSPARENCY') {
    if (
      !['BYLAYER', 'BYBLOCK'].includes(key) &&
      (!text || !Number.isInteger(number) || number < 0 || number > 90)
    )
      return;
    for (const entity of result)
      entity.transparency = key === 'BYLAYER' ? 'bylayer' : key === 'BYBLOCK' ? 'byblock' : number;
  } else if (property === 'THICKNESS') {
    if (!text || !Number.isFinite(number)) return;
    for (const entity of result)
      if (entity.type !== 'dimension' && !(entity.curve?.type === 'POLYLINE' && entity.curve.is3D))
        entity.thickness = number;
  } else if (property === 'ELEV') {
    if (!text || !Number.isFinite(number)) return;
    return result.map((entity) => {
      const at =
        entity.type === 'line'
          ? entity.a
          : entity.type === 'text'
            ? entity.point
            : entity.type === 'circle' || entity.type === 'arc'
              ? entity.center
              : entity.type === 'polyline' || entity.type === 'rect'
                ? entity.points[0]
                : undefined;
      return at
        ? transformGripEntity(
            entity,
            'MOVE',
            { x: 0, y: 0 },
            { x: 0, y: 0, z: number - (at.z ?? 0) },
          )
        : entity;
    });
  } else if (property === 'MATERIAL' || property === 'PLOTSTYLE') {
    if (!text) return;
    for (const entity of result)
      if (property === 'MATERIAL') entity.material = text;
      else entity.plotStyle = text;
  } else if (property === 'ANNOTATIVE') {
    if (!['Y', 'YES', 'N', 'NO'].includes(key)) return;
    for (const entity of result) entity.annotative = key === 'Y' || key === 'YES';
  } else return;
  return result;
}

function* properties(context: DrawContext, initial: CadEntity[], change: boolean): DrawProgram {
  const originals = [...initial];
  let entities = structuredClone(initial),
    changed = false;
  const request: DrawRequest = {
    kind: 'keyword',
    ko: `변경할 특성 입력 [색상(C)/도면층(LA)/선종류(LT)/선종류 축척(S)/선가중치(LW)/두께(T)/투명도(TR)${change ? '/고도(E)' : ''}/재료(M)/주석(A)/플롯스타일(P)] 또는 <종료>:`,
    en: `Enter property to change [Color/LAyer/LType/ltScale/LWeight/Thickness/TRansparency${change ? '/Elev' : ''}/Material/Annotative/Plotstyle] or <exit>:`,
  };
  for (;;) {
    const value = yield {
      ...request,
      ...(changed
        ? { partial: entities, partialEraseIds: originals.map((entity) => entity.id) }
        : {}),
    };
    const keyword = drawKeyword(value);
    if (!keyword) return changed ? modifyResult(originals, entities) : { entities: [] };
    const property = aliases[keyword] ?? keyword;
    if (
      ![
        'COLOR',
        'LAYER',
        'LTYPE',
        'LTSCALE',
        'LWEIGHT',
        'THICKNESS',
        'TRANSPARENCY',
        'MATERIAL',
        'ANNOTATIVE',
        'PLOTSTYLE',
        ...(change ? ['ELEV'] : []),
      ].includes(property)
    )
      continue;
    let invalid = false;
    for (;;) {
      const input = yield {
        kind: ['LAYER', 'MATERIAL', 'PLOTSTYLE'].includes(property) ? 'text' : 'keyword',
        ...propertyValuePrompt(entities, property),
        ...(invalid
          ? {
              notice: { ko: '유효한 특성 값을 입력하십시오.', en: 'Enter a valid property value.' },
            }
          : {}),
      };
      if (typeof input !== 'string') continue;
      if (!input.trim()) break;
      let text = input;
      if (property === 'COLOR' && /^(CO|COLORBOOK)$/i.test(input)) {
        yield { kind: 'text', ko: '색상표 이름 입력:', en: 'Enter color book name:' };
        invalid = true;
        continue;
      }
      if (property === 'COLOR' && /^(T|TRUECOLOR)$/i.test(input)) {
        const rgb = yield {
          kind: 'keyword',
          ko: '빨강,초록,파랑 값 입력:',
          en: 'Enter red,green,blue values:',
        };
        if (typeof rgb !== 'string') continue;
        text = rgb;
      }
      const next = modifyProperty(context, entities, property, text);
      if (!next) {
        invalid = true;
        continue;
      }
      entities = next;
      changed = true;
      break;
    }
  }
}

function* changeProgram(context: DrawContext): DrawProgram {
  const originals = modifySelection(context);
  if (!originals.length) return { entities: [] };
  const value = yield {
    kind: 'point',
    ko: '변경 점 지정 또는 [특성(P)]:',
    en: 'Specify change point or [Properties]:',
  };
  if (['P', 'PROPERTIES'].includes(drawKeyword(value)))
    return yield* properties(context, originals, true);
  const point = drawPoint(value);
  const selected = new Set(originals.map((entity) => entity.id));
  const blockIds = new Set(
    (context.blocks ?? [])
      .filter((block) => block.entityIds.every((id) => selected.has(id)))
      .flatMap((block) => block.entityIds),
  );
  const blockResult = blockIds.size ? yield* changeBlocksProgram(context, point) : { entities: [] };
  if (!point && !blockIds.size && !originals.every((entity) => entity.type === 'circle'))
    return { entities: [] };
  const changed: CadEntity[] = [];
  const accepted = () => ({
    partial: [...blockResult.entities, ...changed],
    partialEraseIds: [...(blockResult.eraseIds ?? []), ...changed.map((entity) => entity.id)],
    partialResult: blockResult,
  });
  for (const source of originals.filter((entity) => !blockIds.has(entity.id))) {
    const entity = structuredClone(source);
    if (entity.type === 'line') {
      if (!point) continue;
      const a = Math.hypot(entity.a.x - point.x, entity.a.y - point.y),
        b = Math.hypot(entity.b.x - point.x, entity.b.y - point.y);
      const target = { ...point },
        anchor = a < b ? entity.b : entity.a;
      if (Number(context.get('ORTHOMODE')) === 1) {
        if (Math.abs(target.x - anchor.x) >= Math.abs(target.y - anchor.y)) target.y = anchor.y;
        else target.x = anchor.x;
      }
      if (a < b) entity.a = target;
      else entity.b = target;
      changed.push(syncSimpleDrawCurve(entity));
    } else if (entity.type === 'circle') {
      let radius = numeric(value, context, entity.center);
      if (changed.length) {
        const next = yield {
          kind: 'number',
          ko: `원의 새 반지름 지정 <${entity.radius}>:`,
          en: `Specify new circle radius <${entity.radius}>:`,
          base: entity.center,
          ...accepted(),
        };
        radius = next === '' ? entity.radius : numeric(next, context, entity.center);
      }
      entity.radius = radius ?? entity.radius;
      if (entity.radius > 0) changed.push(syncSimpleDrawCurve(entity));
    } else if (entity.type === 'text') {
      if (!point) continue;
      entity.point = point;
      const size = yield {
        kind: 'number',
        ko: `새 문자 높이 지정 <${entity.textSize}>:`,
        en: `Specify new text height <${entity.textSize}>:`,
        ...accepted(),
      };
      const height = numeric(size, context);
      if (height !== undefined && height > 0) entity.textSize = height;
      const angle = yield {
        kind: 'angle',
        ko: '새 회전 각도 지정 <현재>:',
        en: 'Specify new rotation angle <current>:',
        ...accepted(),
      };
      const rotation = heading(angle, context, point);
      if (rotation !== undefined) entity.rotation = -rotation;
      const text = yield {
        kind: 'text',
        ko: `새 문자 입력 <${entity.text}>:`,
        en: `Enter new text <${entity.text}>:`,
        ...accepted(),
      };
      if (typeof text === 'string' && text) entity.text = text;
      changed.push(entity);
    }
  }
  return {
    ...blockResult,
    entities: [...blockResult.entities, ...changed],
    eraseIds: [...(blockResult.eraseIds ?? []), ...changed.map((entity) => entity.id)],
  };
}

function* drawOrderProgram(context: DrawContext): DrawProgram {
  const selected = new Set(modifySelection(context).map((entity) => entity.id));
  const value = yield {
    kind: 'keyword',
    ko: '객체 순서 옵션 입력 [객체 위로(A)/객체 아래로(U)/맨 앞으로(F)/맨 뒤로(B)] <맨 뒤로>:',
    en: 'Enter object ordering option [Above objects/Under objects/Front/Back] <Back>:',
  };
  const option = drawKeyword(value) || 'B';
  const moving = context.entities
      .filter((entity) => selected.has(entity.id))
      .map((entity) => entity.id),
    fixed = context.entities
      .filter((entity) => !selected.has(entity.id))
      .map((entity) => entity.id);
  if (['F', 'FRONT'].includes(option)) return { entities: [], orderIds: [...fixed, ...moving] };
  if (['B', 'BACK'].includes(option)) return { entities: [], orderIds: [...moving, ...fixed] };
  if (!['A', 'ABOVE', 'ABOVE OBJECTS', 'U', 'UNDER', 'UNDER OBJECTS'].includes(option))
    return { entities: [] };
  const references = yield* editSelection(
    {
      ...context,
      entities: context.entities.filter((entity) => !selected.has(entity.id)),
      selectedIds: [],
      editableIds: new Set(fixed),
    },
    '참조 객체 선택:',
    'Select reference objects:',
    false,
  );
  const ranks = references
    .map((reference) => fixed.indexOf(reference.id))
    .filter((index) => index >= 0);
  if (!ranks.length) return { entities: [] };
  const index = option.startsWith('A') ? Math.max(...ranks) : Math.min(...ranks);
  const at = index + (option.startsWith('A') ? 1 : 0);
  return { entities: [], orderIds: [...fixed.slice(0, at), ...moving, ...fixed.slice(at)] };
}

export const propertyFactories: Record<string, DrawFactory> = {
  CHANGE: changeProgram,
  CHPROP: function* (context) {
    return yield* properties(context, modifySelection(context), false);
  },
  DRAWORDER: drawOrderProgram,
};
