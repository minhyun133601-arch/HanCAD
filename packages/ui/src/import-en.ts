import type { CadImportMessages } from './import-diagnostics';

export const importEn: CadImportMessages = {
  plain: {
    'runtime-unavailable': 'The local CAD runtime could not be loaded. Reopen the app.',
    'stored-invalid': 'The saved drawing data is invalid.',
    'stored-entities-invalid': 'Validation of the saved drawing entities failed.',
    'file-size': 'Select a DWG / DXF file no larger than 64 MB.',
    'file-extension': 'Only DWG or DXF files can be imported.',
    cancelled: 'Import cancelled.',
    'binary-dxf': 'Binary DXF is not supported. Save an ASCII DXF from your CAD application.',
    'dxf-size': 'The DXF data is too large.',
    'dxf-pairs': 'DXF group code and value pairs are damaged.',
    'no-editable-entities': 'There are no editable 2D entities. The original drawing is retained.',
    'imported-invalid': 'Validation of the imported drawing failed.',
    'dwg-browser-unavailable': 'Run the app in Chrome or Edge with DWG reading support.',
    'dwg-engine-unavailable':
      'The DWG engine could not be loaded. Restart HanCAD or build the latest version.',
    'dwg-timeout': 'DWG reading timed out. Try a file containing only the required area.',
    'dwg-signature': 'The DWG file signature is invalid.',
    'dxf-engine-unavailable': 'The DXF parsing engine is unavailable.',
    'curve-approximated':
      'Curved polylines, ellipses and nonuniformly scaled circles are approximated as editable polylines.',
    'spline-approximated': 'Splines are approximated as editable polylines.',
    'hidden-skipped':
      'Paper-space or hidden entities are omitted. Layer visibility and locks are retained.',
    'tilted-skipped': 'Tilted 3D entities are omitted.',
    'blocks-exploded': 'Blocks are exploded into individual editable entities.',
    'dimensions-exploded':
      'Existing CAD dimensions are imported as individual display entities. Use the dimension tools for new dimensions.',
    'dimension-skipped': 'Non-aligned dimensions without a display block are omitted.',
    'polyline-projected': '3D polylines are projected onto the XY plane.',
    'text-approximated': 'Text formatting, fonts and alignment are approximated as basic text.',
    'fill-outlined': 'Solid and hatch fills are imported as outlines.',
    'hatch-spline-skipped': 'Spline hatch boundaries are omitted.',
    'unsupported-skipped': 'Unsupported entities are reported and omitted.',
    'unit-unspecified':
      'Drawing units are not mm, cm or m; coordinates are imported without units.',
    'dwg-lossy':
      'DWG files are read with LibreDWG. The converter may omit some proxies and specialized 3D entities.',
  },
  geometry: {
    point: 'Invalid coordinates',
    'coordinate-range': 'Coordinates are out of range',
    entity: 'Invalid entity data',
    'polyline-vertices': 'The polyline vertex count is invalid.',
    'polyline-point': 'The polyline coordinates are invalid.',
    'polyline-curve-vertices': 'The curved polyline has too many vertices.',
    ellipse: 'The ellipse data is invalid.',
    'empty-ellipse': 'Empty ellipse',
    spline: 'The spline degree, knots or control points are invalid.',
    'spline-interval': 'The spline has no interval.',
    'spline-weights': 'The spline weights are invalid.',
    'block-transform': 'The block transform data is invalid.',
    'circle-radius': 'The circle radius is invalid.',
    'arc-angle': 'The arc angles are invalid.',
    'text-content-size': 'The text content or size is invalid.',
    'text-rotation': 'The text rotation is invalid.',
    'hatch-boundary': 'The hatch has no boundary.',
    'hatch-visible-boundary': 'The hatch has no displayable boundary.',
  },
  progress: {
    'file-reading': 'Reading file',
    'dwg-converting': 'Decoding DWG (offline)',
    'entities-importing': 'Importing 2D entities',
  },
  preparing: (entities, layers, blocks) =>
    `Source entities ${entities.toLocaleString('en-US')} · Layers ${layers.toLocaleString('en-US')} · Blocks ${blocks.toLocaleString('en-US')}: preparing display entities`,
  groupCode: (line) => `Invalid DXF group code on line ${line}.`,
  invalidNumber: (line) => `Invalid DXF number on line ${line}.`,
  structure: {
    SECTION: 'The DXF SECTION structure is damaged.',
    ENDSEC: 'The DXF ENDSEC structure is damaged.',
    'EOF-after': 'There is data after DXF EOF.',
    complete: 'A complete DXF ENTITIES / ENDSEC / EOF structure could not be found.',
  },
  entityLimit: (limit) =>
    `The drawing exceeds the supported limit of ${limit.toLocaleString('en-US')} entities. Isolate the required area in your CAD application.`,
  layerLimit: (limit) => `The drawing exceeds ${limit} layers. Isolate the required layers.`,
  dwgDecodeFailed: (detail) =>
    `DWG decoding failed. Check the file version and integrity.${detail ? ` ${detail}` : ''}`,
  dwgEngineFailed: (detail) => `DWG engine error: ${detail || 'Operation stopped'}`,
  dwgVersion: (_version) =>
    'DWG formats R13 through R2018 are supported. Save the file in one of these formats.',
  blockReference: (name) => `Missing block or cyclic reference: ${name}`,
  entitySkipped: (type, reason) => `${type}: ${reason}`,
};
