export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export type Handle = string;
export type SymbolTableName =
  'BLOCK_RECORD' | 'LAYER' | 'LTYPE' | 'STYLE' | 'DIMSTYLE' | 'UCS' | 'VIEW' | 'VPORT' | 'APPID';

export interface DxfGroup {
  code: number;
  value: JsonValue;
}

export interface DatabaseObject {
  handle: Handle;
  owner: Handle | null;
  type: string;
  name?: string;
  erased: boolean;
  reactors: Handle[];
  extensionDictionary: Handle | null;
  xdata: Record<string, DxfGroup[]>;
  groups: DxfGroup[];
  fields: JsonObject;
}

export interface EntityProperties {
  layer: string;
  color: number;
  trueColor: number | null;
  colorBook: string | null;
  linetype: string;
  linetypeScale: number;
  lineweight: number;
  transparency: number;
  plotStyle: string;
  visible: boolean;
  thickness: number;
  extrusion: [number, number, number];
  material: Handle | null;
  shadowFlags: number;
}

export type NewDatabaseObject = Pick<DatabaseObject, 'type'> &
  Partial<Omit<DatabaseObject, 'handle' | 'type'>> & { handle?: Handle };

export interface DatabaseSnapshot {
  format: 'HanCAD.Database';
  version: 1;
  handseed: Handle;
  objects: DatabaseObject[];
  tables: Record<SymbolTableName, Handle>;
  namedObjectDictionary: Handle;
  drawingVariables: JsonObject;
  metadata: JsonObject;
}

export type DatabaseEvent =
  | {
      type: 'object-added' | 'object-modified' | 'object-erased' | 'object-unerased';
      object: DatabaseObject;
    }
  | {
      type: 'sysvar-changed';
      name: string;
      before: JsonValue | undefined;
      value: JsonValue | undefined;
    }
  | { type: 'history-changed'; undoCount: number; redoCount: number };

export const defaultEntityProperties: Readonly<EntityProperties> = Object.freeze({
  layer: '0',
  color: 256,
  trueColor: null,
  colorBook: null,
  linetype: 'BYLAYER',
  linetypeScale: 1,
  lineweight: -1,
  transparency: 0,
  plotStyle: 'ByLayer',
  visible: true,
  thickness: 0,
  extrusion: [0, 0, 1] as [number, number, number],
  material: null,
  shadowFlags: 0,
});

export function entityFields(fields: JsonObject = {}): JsonObject {
  return { ...structuredClone(defaultEntityProperties), ...structuredClone(fields) };
}

export function normalizeHandle(handle: string): Handle {
  if (!/^[0-9a-f]+$/i.test(handle) || BigInt(`0x${handle}`) === 0n) {
    throw new Error(`Invalid persistent hex handle: ${handle}`);
  }
  return BigInt(`0x${handle}`).toString(16).toUpperCase();
}
