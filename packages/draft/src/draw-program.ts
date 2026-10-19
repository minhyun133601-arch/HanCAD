import type {
  CadClipboardBlock,
  CadEntity,
  CadMlineStyle,
  CadLayer,
  CadLinetype,
  CadGroup,
  CadPoint,
  CadSettings,
} from '@hancad/legacy-bridge';
import type { CoordinateSettings } from './coordinates';
import type { SelectionGesture } from './selection-session';
import type { DatabaseObject } from '@hancad/db';

export type DrawValue =
  string | CadPoint | { entity: CadEntity; point: CadPoint } | { sample: CadPoint };
export interface DrawRequest {
  kind: 'point' | 'number' | 'angle' | 'keyword' | 'entity' | 'text';
  dialog?: 'overkill';
  selectionSet?: boolean;
  selectionIds?: readonly string[];
  selectionGesture?: SelectionGesture;
  ko: string;
  en: string;
  base?: CadPoint;
  preview?: (point: CadPoint) => CadEntity[];
  previewHiddenIds?: readonly string[];
  /** Persistent provisional graphics; cancellation never commits these. */
  previewEntities?: readonly CadEntity[];
  /** Accepted geometry retained when Escape ends a multi-segment command. */
  partial?: CadEntity[];
  partialEraseIds?: string[];
  partialResult?: DrawResult;
  freehand?: boolean;
  notice?: { ko: string; en: string };
  /** Completes one iteration of MULTIPLE before the next request. */
  checkpoint?: DrawResult;
}
export interface DrawResult {
  entities: CadEntity[];
  /** Native copies retain raw entity data; the host allocates persistent graph identities. */
  nativeCopies?: { sourceHandle: string; object: DatabaseObject; eraseSource: boolean }[];
  eraseIds?: string[];
  clipboardBlocks?: CadClipboardBlock[];
  updatedClipboardBlocks?: CadClipboardBlock[];
  removedBlockNames?: string[];
  groups?: CadGroup[];
  mlineStyles?: CadMlineStyle[];
  messages?: { ko: string; en: string }[];
  previousIds?: string[];
  /** Complete display order, applied atomically with replacements. */
  orderIds?: string[];
}
export interface DrawContext {
  settings: CadSettings;
  coordinates: () => Partial<CoordinateSettings>;
  get: (name: string) => unknown;
  set: (name: string, value: number | string | readonly number[]) => void;
  entities: readonly CadEntity[];
  nativeObjects?: readonly DatabaseObject[];
  /** Stable host editor identities keyed by raw database handle. */
  nativeSelectionIds?: ReadonlyMap<string, string>;
  layers?: readonly CadLayer[];
  linetypes?: readonly CadLinetype[];
  selectedIds?: readonly string[];
  selectionWindows?: readonly {
    points: readonly CadPoint[];
    crossing: boolean;
    ids?: readonly string[];
  }[];
  individuallySelectedIds?: readonly string[];
  isShiftPressed?: () => boolean;
  /** View-indexed hit test supplied by the interactive host. */
  pickEntity?: (point: CadPoint) => CadEntity | undefined;
  editableIds?: ReadonlySet<string>;
  blocks?: readonly CadClipboardBlock[];
  groups?: readonly CadGroup[];
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
