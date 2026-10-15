import { HANCAD_ISO_LIN } from './hancad-iso-lin';

export interface ComplexLinetypeElement {
  kind: 'shape' | 'text';
  /** Shape name or the quoted text string. */
  value: string;
  /** Shape file for shapes, text style for text. */
  source: string;
  scale: number;
  rotation: number;
  absoluteRotation: boolean;
  uprightRotation: boolean;
  x: number;
  y: number;
}
export interface LinetypeElement {
  /** Dash (> 0), dot (0) or gap (< 0) in drawing units at scale 1. */
  length: number;
  /** A shape or text placed at the start of this element (displayed after Phase 10). */
  complex?: ComplexLinetypeElement;
}
export interface LinetypeDefinition {
  name: string;
  description: string;
  elements: readonly LinetypeElement[];
  patternLength: number;
}
export class LinetypeParseError extends Error {
  constructor(
    readonly code: 'header' | 'alignment' | 'element' | 'pattern',
    readonly line: number,
  ) {
    super(`${code}@${line}`);
    this.name = 'LinetypeParseError';
  }
}

export const CONTINUOUS = 'CONTINUOUS';
const MAX_DASHES = 12;

function parseComplex(body: string, line: number): ComplexLinetypeElement {
  const parts = body.split(',').map((part) => part.trim());
  const head = parts.shift() ?? '';
  const quoted = /^"(.*)"$/.exec(head);
  const source = parts.shift() ?? '';
  const element: ComplexLinetypeElement = {
    kind: quoted ? 'text' : 'shape',
    value: quoted ? (quoted[1] ?? '') : head.toUpperCase(),
    source,
    scale: 1,
    rotation: 0,
    absoluteRotation: false,
    uprightRotation: false,
    x: 0,
    y: 0,
  };
  if (!element.value || !source) throw new LinetypeParseError('element', line);
  for (const part of parts) {
    const match = /^([SRAUXY])\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)[DRG]?$/i.exec(part);
    if (!match?.[1] || match[2] === undefined) throw new LinetypeParseError('element', line);
    const value = Number(match[2]);
    switch (match[1].toUpperCase()) {
      case 'S':
        element.scale = value;
        break;
      case 'R':
        element.rotation = value;
        break;
      case 'A':
        element.rotation = value;
        element.absoluteRotation = true;
        break;
      case 'U':
        element.rotation = value;
        element.uprightRotation = true;
        break;
      case 'X':
        element.x = value;
        break;
      default:
        element.y = value;
    }
  }
  return element;
}

function splitPattern(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let quoted = false;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    if (!quoted && character === '[') depth++;
    if (!quoted && character === ']') depth--;
    if (character === ',' && depth === 0 && !quoted) {
      parts.push(current.trim());
      current = '';
    } else current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Parses AutoCAD-format .lin text (UTF-8 or already-decoded CP949). */
export function parseLin(text: string): LinetypeDefinition[] {
  const definitions: LinetypeDefinition[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let header: { name: string; description: string; line: number } | undefined;
  lines.forEach((raw, index) => {
    const line = raw.replace(/;;.*$/, '').trim();
    if (!line) return;
    if (line.startsWith('*')) {
      if (header) throw new LinetypeParseError('pattern', header.line);
      const comma = line.indexOf(',');
      const name = (comma < 0 ? line.slice(1) : line.slice(1, comma)).trim().toUpperCase();
      if (!name) throw new LinetypeParseError('header', index + 1);
      header = {
        name,
        description: comma < 0 ? '' : line.slice(comma + 1).trim(),
        line: index + 1,
      };
      return;
    }
    if (!header) throw new LinetypeParseError('header', index + 1);
    const parts = splitPattern(line);
    if ((parts.shift() ?? '').toUpperCase() !== 'A')
      throw new LinetypeParseError('alignment', index + 1);
    const elements: LinetypeElement[] = [];
    let pendingComplex: ComplexLinetypeElement | undefined;
    for (const part of parts) {
      if (part.startsWith('[')) {
        if (!part.endsWith(']')) throw new LinetypeParseError('element', index + 1);
        pendingComplex = parseComplex(part.slice(1, -1), index + 1);
        continue;
      }
      const length = Number(part);
      if (!part || !Number.isFinite(length)) throw new LinetypeParseError('element', index + 1);
      elements.push(pendingComplex ? { length, complex: pendingComplex } : { length });
      pendingComplex = undefined;
    }
    if (pendingComplex) elements.push({ length: 0, complex: pendingComplex });
    if (elements.length < 2 || elements.length > MAX_DASHES || (elements[0]?.length ?? 0) < 0)
      throw new LinetypeParseError('pattern', index + 1);
    definitions.push({
      name: header.name,
      description: header.description,
      elements,
      patternLength: elements.reduce((sum, element) => sum + Math.abs(element.length), 0),
    });
    header = undefined;
  });
  if (header) throw new LinetypeParseError('pattern', header.line);
  return definitions;
}

let library: ReadonlyMap<string, LinetypeDefinition> | undefined;
/** HanCAD's built-in metric library, keyed by upper-case name. */
export function builtinLinetypes(): ReadonlyMap<string, LinetypeDefinition> {
  library ??= new Map(parseLin(HANCAD_ISO_LIN).map((definition) => [definition.name, definition]));
  return library;
}

/** Converts a database LTYPE record (pattern elements in `fields.pattern`). */
export function linetypeFromFields(name: string, fields: Readonly<Record<string, unknown>>) {
  const pattern = Array.isArray(fields.pattern) ? fields.pattern : [];
  const elements: LinetypeElement[] = [];
  for (const item of pattern) {
    const length =
      typeof item === 'number'
        ? item
        : typeof item === 'object' && item !== null && 'length' in item
          ? Number((item as { length: unknown }).length)
          : Number.NaN;
    if (Number.isFinite(length)) elements.push({ length });
  }
  return {
    name: name.toUpperCase(),
    description: typeof fields.description === 'string' ? fields.description : '',
    elements,
    patternLength: elements.reduce((sum, element) => sum + Math.abs(element.length), 0),
  } satisfies LinetypeDefinition;
}

export function linetypeFields(definition: LinetypeDefinition): Record<string, unknown> {
  return {
    description: definition.description,
    alignment: 65,
    flags: 0,
    patternLength: definition.patternLength,
    pattern: definition.elements.map((element) => ({
      length: element.length,
      ...(element.complex ? { complex: { ...element.complex } } : {}),
    })),
  };
}

/** True when the pattern draws as a solid line (Continuous or no gaps). */
export function isContinuous(definition: LinetypeDefinition | undefined): boolean {
  return (
    !definition ||
    definition.patternLength <= 1e-12 ||
    !definition.elements.some((element) => element.length < 0)
  );
}

export interface PatternFit {
  /** Length of the dash that begins and ends the run. */
  endDash: number;
  repetitions: number;
}

/**
 * AutoCAD-style 'A' alignment: whole patterns fit the run and the first dash is
 * split so that the run begins and ends with equal dashes of at least half its
 * length. Runs shorter than one pattern are drawn continuous (undefined).
 */
export function fitPattern(runLength: number, patternLength: number, firstDash: number) {
  if (!(patternLength > 0) || !(runLength > 0)) return undefined;
  const repetitions = Math.floor(runLength / patternLength + 1e-9);
  if (repetitions < 1) return undefined;
  return {
    endDash: (runLength - repetitions * patternLength + firstDash) / 2,
    repetitions,
  } satisfies PatternFit;
}

/**
 * Reference implementation of the shader: drawn intervals [start, end] along a
 * run. Dots are zero-length intervals. `scale` multiplies the pattern.
 */
export function patternIntervals(
  runLength: number,
  definition: LinetypeDefinition | undefined,
  scale = 1,
): [number, number][] {
  if (isContinuous(definition) || !definition) return [[0, runLength]];
  const lengths = definition.elements.map((element) => element.length * scale);
  const pattern = definition.patternLength * scale;
  const first = Math.max(0, lengths[0] ?? 0);
  const fit = fitPattern(runLength, pattern, first);
  if (!fit) return [[0, runLength]];
  const intervals: [number, number][] = [[0, fit.endDash]];
  let position = fit.endDash;
  for (let repetition = 0; repetition < fit.repetitions; repetition++)
    for (let index = 0; index < lengths.length; index++) {
      if (repetition === 0 && index === 0) continue;
      const length = lengths[index]!;
      if (length >= 0) intervals.push([position, position + length]);
      position += Math.abs(length);
    }
  intervals.push([runLength - fit.endDash, runLength]);
  return intervals;
}

export interface LinetypeScaleContext {
  ltscale: number;
  /** MSLTSCALE: model-space linetypes scale by the annotation scale. */
  msltscale: number;
  /** CANNOSCALEVALUE (paper units per drawing unit, 1 for 1:1, 0.01 for 1:100). */
  annotationScale: number;
  modelSpace: boolean;
}

/** Total pattern multiplier for an object with its own linetype scale (CELTSCALE at creation). */
export function effectiveLinetypeScale(objectScale: number, context: LinetypeScaleContext): number {
  const global = context.ltscale > 0 ? context.ltscale : 1;
  const object = objectScale > 0 ? objectScale : 1;
  const annotation =
    context.modelSpace && context.msltscale === 1 && context.annotationScale > 0
      ? 1 / context.annotationScale
      : 1;
  return global * object * annotation;
}
