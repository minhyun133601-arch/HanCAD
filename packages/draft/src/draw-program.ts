import type {
  CadClipboardBlock,
  CadEntity,
  CadMlineStyle,
  CadPoint,
  CadSettings,
} from '@hancad/legacy-bridge';
import type { CoordinateSettings } from './coordinates';

export type DrawValue =
  string | CadPoint | { entity: CadEntity; point: CadPoint } | { sample: CadPoint };
export interface DrawRequest {
  kind: 'point' | 'number' | 'angle' | 'keyword' | 'entity' | 'text';
  ko: string;
  en: string;
  base?: CadPoint;
  preview?: (point: CadPoint) => CadEntity[];
  /** Accepted geometry retained when Escape ends a multi-segment command. */
  partial?: CadEntity[];
  partialEraseIds?: string[];
  freehand?: boolean;
  notice?: { ko: string; en: string };
  /** Completes one iteration of MULTIPLE before the next request. */
  checkpoint?: DrawResult;
}
export interface DrawResult {
  entities: CadEntity[];
  eraseIds?: string[];
  clipboardBlocks?: CadClipboardBlock[];
  mlineStyles?: CadMlineStyle[];
  messages?: { ko: string; en: string }[];
  previousIds?: string[];
}
export interface DrawContext {
  settings: CadSettings;
  coordinates: () => Partial<CoordinateSettings>;
  get: (name: string) => unknown;
  set: (name: string, value: number | string | readonly number[]) => void;
  entities: readonly CadEntity[];
  editableIds?: ReadonlySet<string>;
  blocks?: readonly CadClipboardBlock[];
  mlineStyles?: readonly CadMlineStyle[];
  continuation?: { point: CadPoint; tangent?: CadPoint };
  memory?: Map<string, number | string>;
  viewDiagonal?: number;
  isControlPressed?: () => boolean;
}
export type DrawProgram = Generator<DrawRequest, DrawResult, DrawValue>;
export type DrawFactory = (context: DrawContext) => DrawProgram;

export function drawPoint(value: DrawValue): CadPoint | undefined {
  return typeof value === 'string'
    ? undefined
    : 'entity' in value
      ? value.point
      : 'sample' in value
        ? value.sample
        : value;
}
export function drawEntity(value: DrawValue): CadEntity | undefined {
  return typeof value !== 'string' && 'entity' in value ? value.entity : undefined;
}
export function drawKeyword(value: DrawValue): string {
  return typeof value === 'string' ? value.trim().replace(/^_+/, '').toUpperCase() : '';
}
export function drawNumber(value: DrawValue): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
