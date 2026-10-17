import type { JsonValue } from './types';
import { entityDxfTypes, objectDxfTypes, tableDxfTypes } from './dxf-inventory';
import { getDocumentedDxfGroups, getDxfTypeDocumentation } from './dxf-reference';
import type { DxfDocumentedGroup } from './dxf-reference';

export type DxfFieldKind =
  'scalar' | 'point2' | 'point3' | 'values' | 'points3' | 'visible' | 'vertices' | 'entries';
export interface DxfFieldSchema {
  name: string;
  codes: readonly number[];
  kind: DxfFieldKind;
  subclass?: string | readonly string[];
  default?: JsonValue;
}
export interface DxfObjectSchema {
  type: string;
  section: 'entity' | 'object' | 'table' | 'block';
  status: 'mapped' | 'opaque';
  fields: readonly DxfFieldSchema[];
  source: string;
  documentedGroups: readonly DxfDocumentedGroup[];
  documentationStatus: 'type-specific' | 'common-only';
}

const root = 'https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/';
const entityIndex = `${root}GUID-7D07C886-FD1D-4A0C-A7AB-B4D21F18E484.htm`;
const objectIndex = `${root}GUID-2D71EE99-A6BE-4060-9B43-808CF1E201C6.htm`;
const tableIndex = `${root}GUID-A9FD9590-C97B-4E41-9F26-BD82C34A4F9F.htm`;
const field = (
  name: string,
  codes: number | readonly number[],
  kind: DxfFieldKind = 'scalar',
  subclass?: string | readonly string[],
  fallback?: JsonValue,
): DxfFieldSchema => ({
  name,
  codes: typeof codes === 'number' ? [codes] : codes,
  kind,
  ...(subclass ? { subclass } : {}),
  ...(fallback === undefined ? {} : { default: fallback }),
});
const point = (
  name: string,
  code: number,
  subclass?: string | readonly string[],
  fallback?: JsonValue,
): DxfFieldSchema => field(name, [code, code + 10, code + 20], 'point3', subclass, fallback);

/** Common values are scoped to AcDbEntity; repeated codes in another subclass stay opaque. */
export const commonEntityDxfFields: readonly DxfFieldSchema[] = [
  field('layer', 8, 'scalar', 'AcDbEntity', '0'),
  field('color', 62, 'scalar', 'AcDbEntity', 256),
  field('trueColor', 420, 'scalar', 'AcDbEntity'),
  field('colorBook', 430, 'scalar', 'AcDbEntity'),
  field('linetype', 6, 'scalar', 'AcDbEntity', 'BYLAYER'),
  field('linetypeScale', 48, 'scalar', 'AcDbEntity', 1),
  field('lineweight', 370, 'scalar', 'AcDbEntity', -1),
  field('transparency', 440, 'scalar', 'AcDbEntity'),
  field('plotStyle', 390, 'scalar', 'AcDbEntity'),
  field('visible', 60, 'visible', 'AcDbEntity', true),
  field('material', 347, 'scalar', 'AcDbEntity'),
  field('shadowFlags', 284, 'scalar', 'AcDbEntity', 0),
  field('paperSpace', 67, 'scalar', 'AcDbEntity', 0),
  field('layoutName', 410, 'scalar', 'AcDbEntity'),
];
const planar = (subclass: string | readonly string[]): DxfFieldSchema[] => [
  field('thickness', 39, 'scalar', subclass, 0),
  point('extrusion', 210, subclass, [0, 0, 1]),
];
const mapped: DxfObjectSchema[] = [];
function schema(
  type: string,
  subclass: string | readonly string[],
  fields: readonly DxfFieldSchema[],
  guid: string,
  section: DxfObjectSchema['section'] = 'entity',
): void {
  mapped.push({
    type,
    section,
    status: 'mapped',
    fields: [
      ...(section === 'entity' || section === 'block' ? commonEntityDxfFields : []),
      ...fields.map((item) => (item.subclass ? item : { ...item, subclass })),
    ],
    source: `${root}${guid}.htm`,
    documentedGroups: getDocumentedDxfGroups(type, section),
    documentationStatus: 'type-specific',
  });
}
schema(
  'LINE',
  'AcDbLine',
  [point('start', 10), point('end', 11), ...planar('AcDbLine')],
  'GUID-FCEF5726-53AE-4C43-B4EA-C84EB8686A66',
);
schema(
  'POINT',
  'AcDbPoint',
  [point('position', 10), field('ucsAngle', 50), ...planar('AcDbPoint')],
  'GUID-9C6AD32D-769D-4213-85A4-CA9CCB5C5317',
);
schema(
  'CIRCLE',
  'AcDbCircle',
  [point('center', 10), field('radius', 40), ...planar('AcDbCircle')],
  'GUID-8663262B-222C-414D-B133-4A8506A27C18',
);
schema(
  'ARC',
  'AcDbArc',
  [
    point('center', 10, 'AcDbCircle'),
    field('radius', 40, 'scalar', 'AcDbCircle'),
    field('thickness', 39, 'scalar', 'AcDbCircle', 0),
    field('startAngle', 50),
    field('endAngle', 51),
    point('extrusion', 210, ['AcDbCircle', 'AcDbArc'], [0, 0, 1]),
  ],
  'GUID-0B14D8F1-0EBA-44BF-9108-57D8CE614BC8',
);
schema(
  'ELLIPSE',
  'AcDbEllipse',
  [
    point('center', 10),
    point('majorAxis', 11),
    field('ratio', 40),
    field('startParameter', 41),
    field('endParameter', 42),
    point('extrusion', 210, undefined, [0, 0, 1]),
  ],
  'GUID-107CB04F-AD4D-4D2F-8EC9-AC90888063AB',
);
schema(
  'LWPOLYLINE',
  'AcDbPolyline',
  [
    field('vertexCount', 90),
    field('flags', 70, 'scalar', undefined, 0),
    field('constantWidth', 43, 'scalar', undefined, 0),
    field('elevation', 38, 'scalar', undefined, 0),
    field('vertices', [10, 20, 40, 41, 42, 91], 'vertices'),
    ...planar('AcDbPolyline'),
  ],
  'GUID-748FC305-F3F2-4F74-825A-61F04D757A50',
);
const polylineClasses = ['AcDb2dPolyline', 'AcDb3dPolyline', 'AcDbPolygonMesh', 'AcDbPolyFaceMesh'];
schema(
  'POLYLINE',
  polylineClasses,
  [
    point('position', 10),
    field('flags', 70, 'scalar', undefined, 0),
    field('startWidth', 40, 'scalar', undefined, 0),
    field('endWidth', 41, 'scalar', undefined, 0),
    field('mCount', 71),
    field('nCount', 72),
    field('mDensity', 73),
    field('nDensity', 74),
    field('surfaceType', 75),
    ...planar(polylineClasses),
  ],
  'GUID-ABF6B778-BE20-4B49-9B58-A94E64CEFFF3',
);
schema(
  'VERTEX',
  [
    'AcDb2dVertex',
    'AcDb3dPolylineVertex',
    'AcDbPolygonMeshVertex',
    'AcDbPolyFaceMeshVertex',
    'AcDbFaceRecord',
  ],
  [
    point('position', 10),
    // Omitted widths inherit POLYLINE header values, while explicit zero is an override.
    field('startWidth', 40),
    field('endWidth', 41),
    field('bulge', 42, 'scalar', undefined, 0),
    field('flags', 70, 'scalar', undefined, 0),
    field('tangent', 50),
    field('faceIndex1', 71),
    field('faceIndex2', 72),
    field('faceIndex3', 73),
    field('faceIndex4', 74),
    field('id', 91),
  ],
  'GUID-0741E831-599E-4CBF-91E1-8ADBCFD6556D',
);
schema(
  'SPLINE',
  'AcDbSpline',
  [
    field('flags', 70),
    field('degree', 71),
    field('knotCount', 72),
    field('controlPointCount', 73),
    field('fitPointCount', 74),
    field('knotTolerance', 42, 'scalar', undefined, 1e-7),
    field('controlPointTolerance', 43, 'scalar', undefined, 1e-7),
    field('fitTolerance', 44, 'scalar', undefined, 1e-10),
    field('knots', 40, 'values'),
    field('weights', 41, 'values'),
    field('controlPoints', [10, 20, 30], 'points3'),
    field('fitPoints', [11, 21, 31], 'points3'),
    point('startTangent', 12),
    point('endTangent', 13),
    point('extrusion', 210),
  ],
  'GUID-E1F884F8-AA90-4864-A215-3182D47A9C74',
);
schema(
  'XLINE',
  'AcDbXline',
  [point('basePoint', 10), point('direction', 11)],
  'GUID-55080553-34B6-40AA-9EE2-3F3A3A2A5C0A',
);
schema(
  'RAY',
  'AcDbRay',
  [point('basePoint', 10), point('direction', 11)],
  'GUID-638B9F01-5D86-408E-A2DE-FA5D6ADBD415',
);
schema(
  'DICTIONARY',
  'AcDbDictionary',
  [field('hardOwner', 280), field('cloning', 281), field('entries', [3, 350, 360], 'entries')],
  'GUID-40B92C63-26F0-485B-A9C2-B349099B26D0',
  'object',
);
schema(
  'GROUP',
  'AcDbGroup',
  [
    field('description', 300),
    field('unnamed', 70),
    field('selectable', 71),
    field('entities', 340, 'values'),
  ],
  'GUID-5F1372C4-37C8-4056-9303-EE1715F58E67',
  'object',
);
schema(
  'LAYOUT',
  'AcDbLayout',
  [
    field('name', 1),
    field('flags', 70),
    field('tabOrder', 71),
    field('limitMinimum', [10, 20], 'point2'),
    field('limitMaximum', [11, 21], 'point2'),
    point('basePoint', 12),
    point('extentMinimum', 14),
    point('extentMaximum', 15),
    field('elevation', 146),
    point('ucsOrigin', 13),
    point('ucsXAxis', 16),
    point('ucsYAxis', 17),
    field('ucsType', 76),
    field('blockRecord', 330),
    field('lastViewport', 331),
    field('ucs', 345),
    field('baseUcs', 346),
    field('shadePlot', 333),
  ],
  'GUID-433D25BF-655D-4697-834E-C666EDFD956D',
  'object',
);
schema(
  'BLOCK_RECORD',
  'AcDbBlockTableRecord',
  [
    field('name', 2),
    field('layout', 340),
    field('units', 70),
    field('explodable', 280),
    field('scalable', 281),
  ],
  'GUID-A1FD1934-7EF5-4D35-A4B0-F8AE54A9A20A',
  'table',
);
schema(
  'BLOCK',
  'AcDbBlockBegin',
  [
    field('name', 2),
    field('flags', 70),
    point('basePoint', 10),
    field('alternateName', 3),
    field('xrefPath', 1),
    field('description', 4),
  ],
  'GUID-66D32572-005A-4E23-8B8B-8726E8C14302',
  'block',
);
schema('ENDBLK', 'AcDbBlockEnd', [], 'GUID-27F7CC8A-E340-4C7F-A77F-5AF139AD502D', 'block');

/** Indexed standard types without a field codec remain explicitly opaque, never a fabricated model. */
const mappedByType = new Map(mapped.map((item) => [item.type, item]));
export const dxfObjectSchemas: readonly DxfObjectSchema[] = Object.freeze([
  ...mapped,
  ...[
    ...entityDxfTypes.map((type) => ({ type, section: 'entity' as const, source: entityIndex })),
    ...objectDxfTypes.map((type) => ({ type, section: 'object' as const, source: objectIndex })),
    ...tableDxfTypes.map((type) => ({ type, section: 'table' as const, source: tableIndex })),
  ]
    .filter((item) => !mappedByType.has(item.type))
    .map((item) => ({
      ...item,
      source: getDxfTypeDocumentation(item.type, item.section).at(-1)?.source ?? item.source,
      status: 'opaque' as const,
      fields: item.section === 'entity' ? commonEntityDxfFields : [],
      documentedGroups: getDocumentedDxfGroups(item.type, item.section),
      documentationStatus:
        getDxfTypeDocumentation(item.type, item.section).length > 1
          ? ('type-specific' as const)
          : ('common-only' as const),
    })),
]);
const byType = new Map(dxfObjectSchemas.map((item) => [item.type, item]));
export function getDxfObjectSchema(type: string): DxfObjectSchema | undefined {
  return byType.get(type.toUpperCase());
}
