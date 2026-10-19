import type { DrawFactory, DrawProgram } from './draw-program';
import { modifySelection, modifyResult } from './modify-common';
import { overkillEntities, overkillRemovedCount } from './modify-overkill';
import type { OverkillOptions } from './modify-overkill';

export type OverkillDialogValues = Omit<OverkillOptions, 'ignore'> & { ignore: string[] };
export function overkillDialogDefaults(): OverkillDialogValues {
  return {
    tolerance: 1e-6,
    ignore: [],
    optimizePolylines: true,
    ignoreWidths: false,
    keepPolylines: true,
    partialOverlap: true,
    endToEnd: true,
    maintainAssociativity: true,
  };
}
export function parseOverkillDialog(text: string): OverkillOptions | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return;
    const value = parsed as Record<string, unknown>;
    const properties = [
      'COLOR',
      'LAYER',
      'LTYPE',
      'LTSCALE',
      'LWEIGHT',
      'THICKNESS',
      'TRANSPARENCY',
      'PLOTSTYLE',
      'MATERIAL',
    ];
    if (
      typeof value.tolerance !== 'number' ||
      !Number.isFinite(value.tolerance) ||
      value.tolerance < 0 ||
      !Array.isArray(value.ignore) ||
      !value.ignore.every((item: unknown) => typeof item === 'string' && properties.includes(item))
    )
      return;
    for (const key of [
      'optimizePolylines',
      'ignoreWidths',
      'keepPolylines',
      'partialOverlap',
      'endToEnd',
      'maintainAssociativity',
    ])
      if (typeof value[key] !== 'boolean') return;
    const options = value as unknown as OverkillDialogValues;
    return { ...options, ignore: new Set(options.ignore) };
  } catch {
    return;
  }
}
export const overkillDialogFactory: DrawFactory = function* (context): DrawProgram {
  for (;;) {
    const input = yield {
      kind: 'keyword',
      dialog: 'overkill',
      ko: '중복 객체 삭제 옵션 지정:',
      en: 'Specify Delete Duplicate Objects options:',
    };
    if (typeof input !== 'string') continue;
    const options = parseOverkillDialog(input);
    if (!options) continue;
    const originals = modifySelection(context),
      entities = overkillEntities(originals, options);
    return {
      ...modifyResult(originals, entities),
      messages: [
        {
          ko: `${overkillRemovedCount(originals, entities)}개의 중복 또는 겹치는 객체가 제거되었습니다.`,
          en: `${overkillRemovedCount(originals, entities)} duplicate or overlapping objects removed.`,
        },
      ],
    };
  }
};
