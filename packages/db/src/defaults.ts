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
  const namedObjectDictionary = make('DICTIONARY', null, 'NAMED_OBJECT_DICTIONARY');
  make('LAYER', tables.LAYER, '0', { color: 7, linetype: 'CONTINUOUS', lineweight: -3, flags: 0 });
  for (const name of ['BYBLOCK', 'BYLAYER', 'CONTINUOUS'])
    make('LTYPE', tables.LTYPE, name, { pattern: [] });
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
    });
  }
  make('UCS', tables.UCS, 'World', { origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0] });
  make('APPID', tables.APPID, 'ACAD');
  for (const [name, type] of [
    ['ACAD_MLINESTYLE', 'MLINESTYLE'],
    ['ACAD_MLEADERSTYLE', 'MLEADERSTYLE'],
    ['ACAD_TABLESTYLE', 'TABLESTYLE'],
  ]) {
    if (name === undefined || type === undefined) continue;
    const dictionary = make('DICTIONARY', namedObjectDictionary, name);
    make(type, dictionary, 'Standard');
  }
  const layoutDictionary = make('DICTIONARY', namedObjectDictionary, 'ACAD_LAYOUT');
  for (const [index, name] of ['Model', 'Layout1', 'Layout2'].entries()) {
    const block = make(
      'BLOCK_RECORD',
      tables.BLOCK_RECORD,
      index === 0 ? '*Model_Space' : index === 1 ? '*Paper_Space' : '*Paper_Space0',
    );
    make('LAYOUT', layoutDictionary, name, {
      blockRecord: block,
      tabOrder: index,
      paper: index === 0 ? null : 'ISO_A4',
      limits: [0, 0, 420, 297],
    });
  }
  return {
    format: 'HanCAD.Database',
    version: 1,
    handseed: seed.toString(16).toUpperCase(),
    objects,
    tables,
    namedObjectDictionary,
    drawingVariables: {},
    metadata: { units: 'millimeters', coordinateSystem: 'right-handed-y-up' },
  };
}
