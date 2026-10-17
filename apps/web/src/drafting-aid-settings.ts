import {
  coordinateSettings,
  formatDraftAngle,
  formatDraftNumber,
  heading,
  parseDraftAngle,
  parseDraftNumber,
  type DraftingConstraintSettings,
} from '@hancad/draft';
import type { SystemVariables } from '@hancad/sysvars';
import type { CadPoint } from '@hancad/legacy-bridge';
import type { Locale } from '@hancad/ui';
import type { DynamicConstraints } from './dynamic-input-state';
import { tempOverrides } from './temp-overrides';

export function draftingAidSettings(vars: SystemVariables): DraftingConstraintSettings {
  const number = (name: string): number => tempOverrides.number(vars, name);
  const pair = (name: string): CadPoint => {
    const value = vars.get(name);
    return Array.isArray(value)
      ? { x: Number(value[0] ?? 0), y: Number(value[1] ?? 0) }
      : { x: 0, y: 0 };
  };
  const base = pair('SNAPBASE');
  return {
    ortho: number('ORTHOMODE') === 1,
    snap: number('SNAPMODE') === 1,
    grid: {
      spacing: pair('SNAPUNIT'),
      base: { x: base.x, y: -base.y },
      angle: number('SNAPANG'),
      isometric: number('SNAPSTYL') === 1,
      isoplane: number('SNAPISOPAIR'),
    },
    polar: Boolean(number('AUTOSNAP') & 8),
    polarIncrement: number('POLARANG'),
    polarAdditional: String(vars.get('POLARADDANG'))
      .split(/[;,]/)
      .filter((part) => part.trim())
      .map(Number)
      .filter(Number.isFinite),
    polarMode: number('POLARMODE'),
    angleBase: number('ANGBASE'),
    clockwise: number('ANGDIR') === 1,
    polarSnap: number('SNAPTYPE') === 1,
    polarDistance: number('POLARDIST'),
  };
}

export function constrainDynamicPoint(
  point: CadPoint,
  base: CadPoint | undefined,
  constraints: DynamicConstraints | undefined,
  vars: SystemVariables,
): CadPoint {
  if (!constraints) return point;
  if (constraints.project) return constraints.project(point);
  const settings = coordinateSettings((name) => vars.get(name));
  const origin = constraints.relative ? (base ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
  const parse = (value: string | undefined): number | undefined =>
    value === undefined ? undefined : parseDraftNumber(value, settings);
  const x = parse(constraints.x),
    y = parse(constraints.y),
    z = parse(constraints.z);
  if (x !== undefined || y !== undefined || z !== undefined)
    return {
      ...point,
      x: x === undefined ? point.x : origin.x + x,
      y: y === undefined ? point.y : origin.y - y,
      ...(z === undefined ? {} : { z: (origin.z ?? 0) + z }),
    };
  if (!base) return point;
  const length = parse(constraints.distance) ?? Math.hypot(point.x - base.x, point.y - base.y);
  const angle =
    constraints.angle === undefined
      ? heading(base, point)
      : parseDraftAngle(constraints.angle, settings);
  return angle === undefined
    ? point
    : { x: base.x + length * Math.cos(angle), y: base.y - length * Math.sin(angle) };
}

export function trackingTooltip(
  point: CadPoint,
  base: CadPoint,
  kind: 'polar' | 'object' | 'ortho' | 'extension' | 'parallel',
  vars: SystemVariables,
  locale: Locale,
): string {
  const settings = coordinateSettings((name) => vars.get(name));
  const length = formatDraftNumber(Math.hypot(point.x - base.x, point.y - base.y), settings);
  const angle = formatDraftAngle(heading(base, point), settings);
  const labels =
    locale === 'ko-KR'
      ? { polar: '극좌표', object: '추적', ortho: '직교', extension: '연장선', parallel: '평행' }
      : {
          polar: 'Polar',
          object: 'Tracking',
          ortho: 'Ortho',
          extension: 'Extension',
          parallel: 'Parallel',
        };
  return `${labels[kind]}: ${length} < ${angle}`;
}

export const snapLabel = (kind: string, locale: Locale): string => {
  const labels: Readonly<Record<string, readonly [string, string]>> = {
    endpoint: ['끝점', 'Endpoint'],
    midpoint: ['중간점', 'Midpoint'],
    center: ['중심점', 'Center'],
    geometricCenter: ['기하학적 중심', 'Geometric Center'],
    node: ['노드', 'Node'],
    quadrant: ['사분점', 'Quadrant'],
    intersection: ['교차점', 'Intersection'],
    extension: ['연장선', 'Extension'],
    insertion: ['삽입점', 'Insertion'],
    perpendicular: ['수직', 'Perpendicular'],
    tangent: ['접점', 'Tangent'],
    nearest: ['근처점', 'Nearest'],
    apparentIntersection: ['가상 교차점', 'Apparent Intersection'],
    parallel: ['평행', 'Parallel'],
  };
  return labels[kind]?.[locale === 'ko-KR' ? 0 : 1] ?? kind;
};
