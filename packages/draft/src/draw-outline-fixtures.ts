import type { CadPolyline, CadSettings } from '@hancad/legacy-bridge';
import type { DrawContext, DrawFactory, DrawResult, DrawValue } from './draw-program';

export function outlineContext(values: Record<string, number> = {}): DrawContext {
  const settings: CadSettings = {
    layer: '0',
    color: '#ffffff',
    lineWidth: 1,
    unit: 'mm',
    grid: false,
    gridSnap: false,
    ortho: false,
    objectSnap: true,
    gridSize: 10,
    textSize: 2.5,
    dimPrecision: 4,
    dimScale: 1,
    dimTextSize: 2.5,
    arrowSize: 2.5,
    extensionGap: 0.625,
    extensionOvershoot: 1.25,
    dimUnit: 'mm',
  };
  return {
    settings,
    entities: [],
    memory: new Map(),
    coordinates: () => ({}),
    get: (name) => values[name],
    set: (name, value) => {
      if (typeof value === 'number') values[name] = value;
    },
  };
}
export function outlineRun(
  factory: DrawFactory,
  inputs: DrawValue[],
  context = outlineContext(),
): DrawResult {
  const program = factory(context);
  let state = program.next();
  for (const input of inputs) {
    if (state.done) throw new Error(`Unexpected extra input: ${JSON.stringify(input)}`);
    state = program.next(input);
  }
  if (!state.done) throw new Error(`Missing input at: ${state.value.en}`);
  return state.value;
}
export function outlineOnly(
  factory: DrawFactory,
  inputs: DrawValue[],
  context = outlineContext(),
): CadPolyline {
  const result = outlineRun(factory, inputs, context);
  const entity = result.entities[0];
  if (entity?.type !== 'polyline' && entity?.type !== 'rect')
    throw new Error('Expected a polyline');
  return entity;
}
