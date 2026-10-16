import type { MessageKey } from '@hancad/ui';
import type { IconName } from './Icon';

export type RibbonTab =
  | 'home'
  | 'insert'
  | 'annotate'
  | 'parametric'
  | 'view'
  | 'manage'
  | 'output'
  | 'addIns'
  | 'collaborate'
  | 'expressTools';
export const ribbonTabs: readonly RibbonTab[] = [
  'home',
  'insert',
  'annotate',
  'parametric',
  'view',
  'manage',
  'output',
  'addIns',
  'collaborate',
  'expressTools',
];
/** Tab keytips shown in Autodesk's Korean keytips reference illustration. */
export const tabKeyTips: Readonly<Record<RibbonTab, string>> = {
  home: 'H',
  insert: 'IN',
  annotate: 'AN',
  parametric: 'PA',
  view: 'VI',
  manage: 'MA',
  output: 'O',
  addIns: 'GI',
  collaborate: 'CO',
  expressTools: 'ET',
};

/** LINE=LI is documented; other original controls await installed-CUI comparison. */
export const toolKeyTips: Readonly<Record<string, string>> = {
  SELECT: 'SE',
  LINE: 'LI',
  PLINE: 'PL',
  CIRCLE: 'CI',
  ARC: 'AR',
  RECTANG: 'RE',
  MOVE: 'MV',
  COPY: 'CP',
  ROTATE: 'RO',
  TRIM: 'TR',
  EXTEND: 'EX',
  OFFSET: 'OF',
  FILLET: 'FI',
  ERASE: 'ER',
  DIM: 'DI',
  DIMLINEAR: 'DL',
  DIMSTYLE: 'DS',
  TEXT: 'TE',
  LAYER: 'LA',
  PROPERTIES: 'PR',
  DIST: 'ME',
  INSERT: 'I',
  BLOCK: 'B',
  DIMALIGNED: 'DA',
  DIMRADIUS: 'DR',
  DIMDIAMETER: 'DD',
  DIMANGULAR: 'DN',
  MTEXT: 'MT',
  GEOMCONSTRAINT: 'G',
  ZOOM: 'Z',
  PAN: 'P',
  OPTIONS: 'O',
  EXPORTPDF: 'EP',
  EXPORTPNG: 'EN',
  EXPORTJPG: 'EJ',
  EXPORTSVG: 'ES',
  QSAVE: 'S',
  PLOT: 'PT',
  PAGESETUP: 'PS',
  APPLOAD: 'A',
  COMPARE: 'C',
  OVERKILL: 'O',
  NEW: 'N',
  OPEN: 'O',
  HANSAVE: 'H',
};
export type Execute = (command: string) => void;
interface Tool {
  label: MessageKey;
  command: string;
  icon: IconName;
}
interface Panel {
  label: MessageKey;
  tools: readonly Tool[];
}

const homePanels: readonly Panel[] = [
  {
    label: 'draw',
    tools: [
      { label: 'select', command: 'SELECT', icon: 'options' },
      { label: 'line', command: 'LINE', icon: 'line' },
      { label: 'polyline', command: 'PLINE', icon: 'polyline' },
      { label: 'circle', command: 'CIRCLE', icon: 'circle' },
      { label: 'arc', command: 'ARC', icon: 'arc' },
      { label: 'rectangle', command: 'RECTANG', icon: 'rectangle' },
    ],
  },
  {
    label: 'modify',
    tools: [
      { label: 'move', command: 'MOVE', icon: 'move' },
      { label: 'copy', command: 'COPY', icon: 'copy' },
      { label: 'rotate', command: 'ROTATE', icon: 'rotate' },
      { label: 'trim', command: 'TRIM', icon: 'trim' },
      { label: 'extend', command: 'EXTEND', icon: 'trim' },
      { label: 'offset', command: 'OFFSET', icon: 'offset' },
      { label: 'fillet', command: 'FILLET', icon: 'fillet' },
      { label: 'erase', command: 'ERASE', icon: 'trim' },
    ],
  },
  {
    label: 'annotation',
    tools: [
      { label: 'dimensionSmart', command: 'DIM', icon: 'dimension' },
      { label: 'dimension', command: 'DIMLINEAR', icon: 'dimension' },
      { label: 'dimensionStyle', command: 'DIMSTYLE', icon: 'dimension' },
      { label: 'singleLineText', command: 'TEXT', icon: 'text' },
    ],
  },
  { label: 'layers', tools: [{ label: 'layerProperties', command: 'LAYER', icon: 'layer' }] },
  { label: 'properties', tools: [{ label: 'properties', command: 'PROPERTIES', icon: 'options' }] },
  { label: 'utilities', tools: [{ label: 'measure', command: 'DIST', icon: 'dimension' }] },
];
export const panels: Record<RibbonTab, readonly Panel[]> = {
  home: homePanels,
  insert: [
    {
      label: 'insert',
      tools: [
        { label: 'insertBlock', command: 'INSERT', icon: 'block' },
        { label: 'block', command: 'BLOCK', icon: 'block' },
      ],
    },
  ],
  annotate: [
    {
      label: 'annotation',
      tools: [
        { label: 'dimensionSmart', command: 'DIM', icon: 'dimension' },
        { label: 'dimension', command: 'DIMLINEAR', icon: 'dimension' },
        { label: 'dimensionAligned', command: 'DIMALIGNED', icon: 'dimension' },
        { label: 'dimensionRadius', command: 'DIMRADIUS', icon: 'dimension' },
        { label: 'dimensionDiameter', command: 'DIMDIAMETER', icon: 'dimension' },
        { label: 'dimensionAngular', command: 'DIMANGULAR', icon: 'dimension' },
        { label: 'dimensionStyle', command: 'DIMSTYLE', icon: 'dimension' },
      ],
    },
    {
      label: 'text',
      tools: [
        { label: 'singleLineText', command: 'TEXT', icon: 'text' },
        { label: 'text', command: 'MTEXT', icon: 'text' },
      ],
    },
  ],
  parametric: [
    {
      label: 'parametric',
      tools: [{ label: 'constraints', command: 'GEOMCONSTRAINT', icon: 'dimension' }],
    },
  ],
  view: [
    {
      label: 'view',
      tools: [
        { label: 'zoom', command: 'ZOOM', icon: 'circle' },
        { label: 'pan', command: 'PAN', icon: 'move' },
      ],
    },
  ],
  manage: [{ label: 'manage', tools: [{ label: 'options', command: 'OPTIONS', icon: 'options' }] }],
  output: [
    {
      label: 'output',
      tools: [
        { label: 'exportPdf', command: 'EXPORTPDF', icon: 'plot' },
        { label: 'exportPng', command: 'EXPORTPNG', icon: 'rectangle' },
        { label: 'exportJpg', command: 'EXPORTJPG', icon: 'rectangle' },
        { label: 'exportSvg', command: 'EXPORTSVG', icon: 'line' },
        { label: 'exportDxf', command: 'QSAVE', icon: 'save' },
        { label: 'plot', command: 'PLOT', icon: 'plot' },
        { label: 'pageSetup', command: 'PAGESETUP', icon: 'plot' },
      ],
    },
  ],
  addIns: [{ label: 'addIns', tools: [{ label: 'lisp', command: 'APPLOAD', icon: 'open' }] }],
  collaborate: [
    {
      label: 'collaborate',
      tools: [{ label: 'drawingCompare', command: 'COMPARE', icon: 'copy' }],
    },
  ],
  expressTools: [
    { label: 'utilities', tools: [{ label: 'overkill', command: 'OVERKILL', icon: 'trim' }] },
  ],
};

export const quickTools: readonly Tool[] = [
  { label: 'newDrawing', command: 'NEW', icon: 'new' },
  { label: 'open', command: 'OPEN', icon: 'open' },
  { label: 'exportDxf', command: 'QSAVE', icon: 'save' },
  { label: 'undo', command: 'U', icon: 'undo' },
  { label: 'redo', command: 'REDO', icon: 'redo' },
  { label: 'plot', command: 'PLOT', icon: 'plot' },
];
export const fileTools: readonly Tool[] = [
  { label: 'newDrawing', command: 'NEW', icon: 'new' },
  { label: 'openCad', command: 'OPEN', icon: 'open' },
  { label: 'exportPdf', command: 'EXPORTPDF', icon: 'plot' },
  { label: 'exportPng', command: 'EXPORTPNG', icon: 'rectangle' },
  { label: 'exportJpg', command: 'EXPORTJPG', icon: 'rectangle' },
  { label: 'exportSvg', command: 'EXPORTSVG', icon: 'line' },
  { label: 'exportDxf', command: 'QSAVE', icon: 'save' },
  { label: 'saveNative', command: 'HANSAVE', icon: 'save' },
];
