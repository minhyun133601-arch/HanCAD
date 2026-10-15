import { entityFields } from './types';
import type { DatabaseObject, DatabaseSnapshot, JsonObject, SymbolTableName } from './types';

export function createMetricSnapshot(): DatabaseSnapshot {
  let seed = 1;
  const objects: DatabaseObject[] = [];
  const make = (
    type: string,
    owner: string | null,
    name?: string,
    fields: JsonObject = {},
  ): string => {
    const handle = (seed++).toString(16).toUpperCase();
    const object: DatabaseObject = {
      handle,
      owner,
      type,
      erased: false,
      reactors: [],
      extensionDictionary: null,
      xdata: {},
      groups: [],
      fields,
    };
    if (name !== undefined) object.name = name;
    objects.push(object);
    return handle;
  };
  const tableNames: SymbolTableName[] = [
    'BLOCK_RECORD',
    'LAYER',
    'LTYPE',
    'STYLE',
    'DIMSTYLE',
    'UCS',
    'VIEW',
    'VPORT',
    'APPID',
  ];
  const tables = Object.fromEntries(
    tableNames.map((name) => [name, make('SYMBOL_TABLE', null, name)]),
  ) as Record<SymbolTableName, string>;
  const namedObjectDictionary = make('DICTIONARY', null, 'NAMED_OBJECT_DICTIONARY', {
    entries: [],
    hardOwner: 1,
    cloning: 1,
  });
  const get = (handle: string): DatabaseObject => {
    const object = objects.find((candidate) => candidate.handle === handle);
    if (!object) throw new Error('Missing metric drawing object.');
    return object;
  };
  const entry = (dictionary: string, name: string, handle: string): void => {
    const entries = get(dictionary).fields.entries;
    if (!Array.isArray(entries)) throw new Error('Metric dictionary entries are unavailable.');
    entries.push({ name, handle, hardOwner: true });
  };
  const dictionary = (name: string): string => {
    const handle = make('DICTIONARY', namedObjectDictionary, name, {
      entries: [],
      hardOwner: 1,
      cloning: 1,
    });
    entry(namedObjectDictionary, name, handle);
    return handle;
  };
  make('LAYER', tables.LAYER, '0', { color: 7, linetype: 'CONTINUOUS', lineweight: -3, flags: 0 });
  for (const name of ['BYBLOCK', 'BYLAYER', 'CONTINUOUS'])
    make('LTYPE', tables.LTYPE, name, { pattern: [], flags: 0, alignment: 65, patternLength: 0 });
  make('STYLE', tables.STYLE, 'Standard', { font: 'sans-serif', height: 0, width: 1 });
  make('STYLE', tables.STYLE, 'Annotative', {
    font: 'sans-serif',
    height: 0,
    width: 1,
    annotative: true,
  });
  for (const name of ['ISO-25', 'Standard', 'Annotative']) {
    make('DIMSTYLE', tables.DIMSTYLE, name, {
      annotative: name === 'Annotative',
      DIMTXT: 2.5,
      DIMASZ: 2.5,
      DIMDLI: 3.75,
      DIMSCALE: 1,
      DIMEXO: 0.625,
      DIMEXE: 1.25,
      DIMGAP: 0.625,
      DIMLFAC: 1,
      DIMZIN: 8,
      DIMDEC: 2,
    });
  }
  make('UCS', tables.UCS, 'World', { origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0] });
  make('APPID', tables.APPID, 'ACAD');
  make('VPORT', tables.VPORT, '*Active', {
    center: [210, 148.5],
    viewHeight: 297,
    snapUnit: [10, 10],
    gridUnit: [10, 10],
    viewDirection: [0, 0, 1],
    viewTarget: [0, 0, 0],
  });
  for (const [name, type] of [
    ['ACAD_MLINESTYLE', 'MLINESTYLE'],
    ['ACAD_MLEADERSTYLE', 'MLEADERSTYLE'],
    ['ACAD_TABLESTYLE', 'TABLESTYLE'],
  ]) {
    if (name === undefined || type === undefined) continue;
    const owner = dictionary(name);
    const style = make(type, owner, 'Standard');
    entry(owner, 'Standard', style);
  }
  dictionary('ACAD_GROUP');
  dictionary('ACAD_PLOTSETTINGS');
  const scales = dictionary('ACAD_SCALELIST');
  for (const ratio of [
    1, 2, 4, 5, 8, 10, 16, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 600, 750,
    1000, 1200,
  ]) {
    const name = `1:${ratio}`;
    const handle = make('SCALE', scales, name, {
      paperUnits: 1,
      drawingUnits: ratio,
      unitScale: ratio === 1,
    });
    entry(scales, name, handle);
  }
  const layoutDictionary = dictionary('ACAD_LAYOUT');
  for (const [index, name] of ['Model', 'Layout1', 'Layout2'].entries()) {
    const block = make(
      'BLOCK_RECORD',
      tables.BLOCK_RECORD,
      index === 0 ? '*Model_Space' : index === 1 ? '*Paper_Space' : '*Paper_Space0',
      { units: 4, explodable: 1, scalable: 1 },
    );
    const layout = make('LAYOUT', layoutDictionary, name, {
      blockRecord: block,
      tabOrder: index,
      paper: index === 0 ? null : 'ISO_A4',
      limits: [0, 0, 420, 297],
      limitMinimum: [0, 0],
      limitMaximum: [420, 297],
      basePoint: [0, 0, 0],
      ucsOrigin: [0, 0, 0],
      ucsXAxis: [1, 0, 0],
      ucsYAxis: [0, 1, 0],
      paperWidth: index === 0 ? 0 : 297,
      paperHeight: index === 0 ? 0 : 210,
      plotUnits: 1,
    });
    get(block).fields.layout = layout;
    entry(layoutDictionary, name, layout);
    const blockName = get(block).name!;
    const begin = make(
      'BLOCK',
      block,
      blockName,
      entityFields({ name: blockName, basePoint: [0, 0, 0], flags: 0, xrefPath: '' }),
    );
    const end = make('ENDBLK', block, undefined, entityFields());
    get(block).fields.blockBegin = begin;
    get(block).fields.blockEnd = end;
    if (index > 0) {
      const viewport = make(
        'VIEWPORT',
        block,
        undefined,
        entityFields({
          paperSpace: 1,
          layoutName: name,
          center: [148.5, 105, 0],
          width: 297,
          height: 210,
          id: 1,
          status: 1,
          viewTarget: [0, 0, 0],
          viewDirection: [0, 0, 1],
        }),
      );
      get(layout).fields.lastViewport = viewport;
    }
  }
  return {
    format: 'HanCAD.Database',
    version: 1,
    handseed: seed.toString(16).toUpperCase(),
    objects,
    tables,
    namedObjectDictionary,
    drawingVariables: {
      MEASUREMENT: 1,
      INSUNITS: 4,
      LUNITS: 2,
      LUPREC: 4,
      LIMMIN: [0, 0],
      LIMMAX: [420, 297],
      GRIDUNIT: [10, 10],
      SNAPUNIT: [10, 10],
      CLAYER: '0',
      CELTYPE: 'BYLAYER',
      TEXTSTYLE: 'Standard',
      DIMSTYLE: 'ISO-25',
      CMLSTYLE: 'Standard',
      CTAB: 'Model',
    },
    metadata: { units: 'millimeters', coordinateSystem: 'right-handed-y-up' },
  };
}
