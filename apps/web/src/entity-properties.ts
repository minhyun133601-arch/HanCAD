import { normalizeCadState } from '@hancad/legacy-bridge';
import type { CadEntity, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { geometryLength } from '@hancad/geom';
import { cornerExpression, syncSimpleDrawCurve } from '@hancad/draft';
import {
  editablePropertyCurve,
  entityCurveProperties,
  propertyCurveIndex,
} from './entity-curve-properties';
import { changePropertyCurve } from './entity-curve-edit';

export interface EntityProperty {
  key: string;
  ko: string;
  en: string;
  kind: 'text' | 'number' | 'boolean';
  readOnly?: boolean;
  value: string;
  category: 'general' | 'visualization' | 'geometry' | 'other';
}
export function propertyTypeLabel(type: string, korean: boolean): string {
  if (!korean) return type.toUpperCase();
  return (
    (
      {
        LINE: '선',
        CIRCLE: '원',
        ARC: '호',
        POLYLINE: '폴리선',
        RECT: '폴리선',
        LWPOLYLINE: '폴리선',
        TEXT: '문자',
        MTEXT: '여러 줄 문자',
        DIMENSION: '치수',
        POINT: '점',
        SPLINE: '스플라인',
        ELLIPSE: '타원',
        XLINE: '구성선',
        RAY: '광선',
        REGION: '영역',
        HATCH: '해치',
        MLINE: '다중선',
      } as Record<string, string>
    )[type.toUpperCase()] ?? type
  );
}
export const propertyLineweights = [
  -3, -2, -1, 0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140,
  158, 200, 211,
] as const;
function point(entity: CadEntity, name: string): CadPoint | undefined {
  if (name === 'a' && (entity.type === 'line' || entity.type === 'dimension')) return entity.a;
  if (name === 'b' && (entity.type === 'line' || entity.type === 'dimension')) return entity.b;
  if (
    name === 'center' &&
    (entity.type === 'circle' || entity.type === 'arc' || entity.type === 'dimension')
  )
    return entity.center;
  if (name === 'point' && entity.type === 'text') return entity.point;
  if (name === 'placement' && entity.type === 'dimension') return entity.placement;
  return undefined;
}
function value(entity: CadEntity, key: string): string {
  if (
    editablePropertyCurve(entity) &&
    (key.startsWith('curve.') || /^(center\.|radius$|diameter$|startAngle$|endAngle$)/.test(key))
  ) {
    const property = entityCurveProperties(entity, propertyCurveIndex(key)).find(
      (field) => field.key === key,
    );
    if (property) return property.value;
  }
  if (key === 'type') return (entity.sourceType ?? entity.type).toUpperCase();
  if (key === 'length' && entity.curve) return String(geometryLength(entity.curve));
  if (key === 'length' && entity.regionLoops)
    return String(entity.regionLoops.flat().reduce((sum, curve) => sum + geometryLength(curve), 0));
  if (entity.type === 'circle') {
    if (key === 'diameter') return String(entity.radius * 2);
    if (key === 'circumference') return String(2 * Math.PI * entity.radius);
    if (key === 'area') return String(Math.PI * entity.radius ** 2);
  }
  if (key === 'color' && entity.trueColor === undefined && entity.aci === 256) return 'ByLayer';
  if (key === 'color' && entity.trueColor === undefined && entity.aci === 0) return 'ByBlock';
  if (key === 'color' && entity.trueColor === undefined && entity.aci !== undefined)
    return String(entity.aci);
  if (key.includes('.')) {
    const [name = '', axis = ''] = key.split('.'),
      position = point(entity, name);
    return String((position?.[axis as keyof CadPoint] ?? 0) * (axis === 'y' ? -1 : 1));
  }
  if (key === 'length' && entity.type === 'line')
    return String(
      Math.hypot(
        entity.b.x - entity.a.x,
        entity.b.y - entity.a.y,
        (entity.b.z ?? 0) - (entity.a.z ?? 0),
      ),
    );
  if (key === 'vertices' && (entity.type === 'polyline' || entity.type === 'rect'))
    return String(entity.points.length);
  if (key === 'rotation' && entity.type === 'text')
    return String((-entity.rotation * 180) / Math.PI);
  if (key === 'startAngle' && entity.type === 'arc')
    return String((-entity.startAngle * 180) / Math.PI);
  if (key === 'endAngle' && entity.type === 'arc')
    return String((-entity.endAngle * 180) / Math.PI);
  const stored = (entity as unknown as Record<string, unknown>)[key];
  if (stored !== undefined) return String(stored);
  return (
    (
      {
        linetype: 'ByLayer',
        linetypeScale: '1',
        lineweight: '-1',
        transparency: 'bylayer',
        thickness: '0',
        material: 'ByLayer',
        plotStyle: 'ByLayer',
      } as Record<string, string>
    )[key] ?? ''
  );
}
type Descriptor = [
  key: string,
  ko: string,
  en: string,
  kind: EntityProperty['kind'],
  readOnly?: boolean,
];
const common: Descriptor[] = [
  ['type', '객체 유형', 'Object type', 'text', true],
  ['layer', '도면층', 'Layer', 'text'],
  ['color', '색상', 'Color', 'text'],
  ['linetype', '선종류', 'Linetype', 'text'],
  ['linetypeScale', '선종류 축척', 'Linetype scale', 'number'],
  ['lineweight', '선가중치', 'Lineweight', 'number'],
  ['transparency', '투명도', 'Transparency', 'text'],
  ['thickness', '두께', 'Thickness', 'number'],
  ['material', '재료', 'Material', 'text'],
  ['plotStyle', '플롯 스타일', 'Plot style', 'text'],
];
function coordinates(name: string, ko: string, en: string): Descriptor[] {
  return (['x', 'y', 'z'] as const).map((axis) => [
    `${name}.${axis}`,
    `${ko} ${axis.toUpperCase()}`,
    `${en} ${axis.toUpperCase()}`,
    'number',
  ]);
}
function descriptors(entity: CadEntity): Descriptor[] {
  if (
    (entity.type === 'polyline' || entity.type === 'rect') &&
    !entity.points.length &&
    !entity.curve
  )
    return [];
  if (
    (entity.curve && !['line', 'circle', 'arc'].includes(entity.type)) ||
    entity.regionLoops ||
    entity.mline
  )
    return [
      ...(entity.curve || entity.regionLoops
        ? [['length', '길이', 'Length', 'number', true] as Descriptor]
        : []),
      ...(entity.regionArea !== undefined
        ? [['regionArea', '면적', 'Area', 'number', true] as Descriptor]
        : []),
    ];
  switch (entity.type) {
    case 'line':
      return [
        ...coordinates('a', '시작', 'Start'),
        ...coordinates('b', '끝', 'End'),
        ['length', '길이', 'Length', 'number', true],
      ];
    case 'circle':
      return [
        ...coordinates('center', '중심', 'Center'),
        ['radius', '반지름', 'Radius', 'number'],
        ['diameter', '지름', 'Diameter', 'number'],
        ['circumference', '원주', 'Circumference', 'number', true],
        ['area', '면적', 'Area', 'number', true],
      ];
    case 'arc':
      return [
        ...coordinates('center', '중심', 'Center'),
        ['radius', '반지름', 'Radius', 'number'],
        ['startAngle', '시작 각도', 'Start angle', 'number'],
        ['endAngle', '끝 각도', 'End angle', 'number'],
      ];
    case 'polyline':
    case 'rect':
      return [
        ['vertices', '정점 수', 'Vertices', 'number', true],
        ['closed', '닫힘', 'Closed', 'boolean'],
      ];
    case 'text':
      return [
        ...coordinates('point', '위치', 'Position'),
        ['text', '내용', 'Contents', 'text'],
        ['textSize', '높이', 'Height', 'number'],
        ['rotation', '회전', 'Rotation', 'number'],
      ];
    case 'dimension':
      return [
        ...(entity.a ? coordinates('a', '정의점 1', 'Definition point 1') : []),
        ...(entity.b ? coordinates('b', '정의점 2', 'Definition point 2') : []),
        ...(entity.center ? coordinates('center', '중심', 'Center') : []),
        ...(entity.placement
          ? coordinates('placement', '치수선 위치', 'Dimension line position')
          : []),
        ['kind', '치수 유형', 'Dimension type', 'text', true],
        ['text', '문자 재지정', 'Text override', 'text'],
        ['textSize', '문자 높이', 'Text height', 'number'],
        ['dimScale', '전체 축척', 'Overall scale', 'number'],
        ['precision', '정밀도', 'Precision', 'number'],
      ];
  }
}

export function entityProperties(
  entities: readonly CadEntity[],
  geometryIndex = 0,
): EntityProperty[] {
  if (!entities.length) return [];
  const first = entities[0]!,
    sameType = entities.every(
      (entity) =>
        (entity.sourceType ?? entity.type).toUpperCase() ===
        (first.sourceType ?? first.type).toUpperCase(),
    );
  const fields: EntityProperty[] = [
    ...common,
    ...(sameType && !editablePropertyCurve(first) ? descriptors(first) : []),
  ].map(([key, ko, en, kind, readOnly]) => {
    const firstValue = value(first, key);
    return {
      key,
      ko,
      en,
      kind,
      category:
        key === 'material'
          ? 'visualization'
          : key === 'plotStyle'
            ? 'other'
            : common.some((descriptor) => descriptor[0] === key)
              ? 'general'
              : 'geometry',
      ...(readOnly ? { readOnly } : {}),
      value: entities.every((entity) => value(entity, key) === firstValue)
        ? firstValue
        : '*VARIES*',
    };
  });
  if (sameType && editablePropertyCurve(first)) {
    const others = entities
      .slice(1)
      .map(
        (entity) =>
          new Map(
            entityCurveProperties(entity, geometryIndex).map((field) => [field.key, field.value]),
          ),
      );
    fields.push(
      ...entityCurveProperties(first, geometryIndex).map((field) => ({
        ...field,
        value: others.every((values) => values.get(field.key) === field.value)
          ? field.value
          : '*VARIES*',
      })),
    );
  }
  return fields;
}

/** Validate the entire edit before creating a journal replacement snapshot. */
export function changeEntityProperty(
  state: LegacyCadState,
  ids: readonly string[],
  key: string,
  input: string,
): LegacyCadState {
  const wanted = new Set(ids),
    selected = state.entities.filter((entity) => wanted.has(entity.id));
  if (!selected.length) throw new Error('No objects selected.');
  if (
    selected.some((entity) =>
      state.layers.some((layer) => layer.name === entity.layer && layer.locked),
    )
  )
    throw new Error('Objects on locked layers cannot be modified.');
  const property = entityProperties(selected, propertyCurveIndex(key)).find(
    (item) => item.key === key,
  );
  if (!property || property.readOnly) throw new Error('Property is not editable.');
  const numeric = property.kind === 'number' ? (cornerExpression(input) ?? NaN) : Number(input);
  if (
    property.kind === 'number' &&
    (!input.trim() || !Number.isFinite(numeric) || Math.abs(numeric) > 1e12)
  )
    throw new Error('A finite numeric value is required.');
  if (property.kind === 'boolean' && !['true', 'false'].includes(input))
    throw new Error('Invalid boolean value.');
  if (['radius', 'diameter', 'textSize', 'dimScale', 'linetypeScale'].includes(key) && numeric <= 0)
    throw new Error('Value must be greater than zero.');
  if ((key === 'textSize' && numeric > 1000) || (key === 'dimScale' && numeric > 10000))
    throw new Error('Value exceeds the supported property range.');
  if (key === 'precision' && (!Number.isInteger(numeric) || numeric < 0 || numeric > 8))
    throw new Error('Precision must be an integer from 0 through 8.');
  if (key === 'layer' && !state.layers.some((layer) => layer.name === input && !layer.locked))
    throw new Error('Choose an existing unlocked layer.');
  if (
    key === 'color' &&
    !/^(#[0-9a-f]{6}|bylayer|byblock)$/i.test(input) &&
    (!/^\d+$/.test(input) || Number(input) > 256)
  )
    throw new Error('Invalid color.');
  if (
    key === 'linetype' &&
    !['BYLAYER', 'BYBLOCK', 'CONTINUOUS', 'DASHED', 'HIDDEN', 'CENTER', 'DOT'].includes(
      input.toUpperCase(),
    ) &&
    !state.linetypes?.some((line) => line.name.toUpperCase() === input.toUpperCase())
  )
    throw new Error('Unknown linetype.');
  if (key === 'lineweight' && !(propertyLineweights as readonly number[]).includes(numeric))
    throw new Error('Invalid lineweight.');
  if (
    key === 'transparency' &&
    !['bylayer', 'byblock'].includes(input.toLowerCase()) &&
    (!input.trim() || !Number.isInteger(numeric) || numeric < 0 || numeric > 90)
  )
    throw new Error('Invalid transparency.');
  const entities = state.entities.map((entity) => {
    if (!wanted.has(entity.id)) return entity;
    const changed = structuredClone(entity);
    if (
      changed.curve &&
      editablePropertyCurve(changed) &&
      entityCurveProperties(changed, propertyCurveIndex(key)).some((field) => field.key === key)
    ) {
      changed.curve = changePropertyCurve(
        changed.curve,
        key,
        property.kind === 'boolean' ? input === 'true' : numeric,
      );
      return changed;
    }
    if (key.includes('.')) {
      const [name = '', axis = ''] = key.split('.'),
        position = point(changed, name);
      if (!position) throw new Error('Missing geometry point.');
      position[axis as keyof CadPoint] = numeric * (axis === 'y' ? -1 : 1);
    } else if (key === 'rotation' && changed.type === 'text')
      changed.rotation = (-numeric * Math.PI) / 180;
    else if (key === 'startAngle' && changed.type === 'arc')
      changed.startAngle = (-numeric * Math.PI) / 180;
    else if (key === 'endAngle' && changed.type === 'arc')
      changed.endAngle = (-numeric * Math.PI) / 180;
    else if (key === 'diameter' && changed.type === 'circle') changed.radius = numeric / 2;
    else if (key === 'color') {
      changed.color = input.startsWith('#') ? input : changed.color;
      if (input.toLowerCase() === 'bylayer') changed.aci = 256;
      else if (input.toLowerCase() === 'byblock') changed.aci = 0;
      else if (/^\d+$/.test(input)) changed.aci = Number(input);
      else {
        delete changed.aci;
        changed.trueColor = parseInt(input.slice(1), 16);
      }
      if (!input.startsWith('#')) delete changed.trueColor;
    } else
      Object.assign(changed, {
        [key]:
          property.kind === 'number'
            ? numeric
            : property.kind === 'boolean'
              ? input === 'true'
              : key === 'transparency'
                ? ['bylayer', 'byblock'].includes(input.toLowerCase())
                  ? input.toLowerCase()
                  : numeric
                : input,
      });
    return syncSimpleDrawCurve(changed);
  });
  const inquiries = new Set(
    entities
      .filter((entity) => entity.sourceType && entity.id.startsWith('native:ENTITY:'))
      .map((entity) => entity.id),
  );
  if (!inquiries.size) return normalizeCadState({ ...state, entities });
  const normalized = normalizeCadState({
    ...state,
    entities: entities.filter((entity) => !inquiries.has(entity.id)),
  });
  const byId = new Map(normalized.entities.map((entity) => [entity.id, entity]));
  return { ...normalized, entities: entities.map((entity) => byId.get(entity.id) ?? entity) };
}
