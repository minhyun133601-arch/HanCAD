import type { Locale, Messages, MessageKey } from '@hancad/ui';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

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
type Execute = (command: string) => void;
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
      { label: 'offset', command: 'OFFSET', icon: 'offset' },
      { label: 'fillet', command: 'FILLET', icon: 'fillet' },
      { label: 'erase', command: 'ERASE', icon: 'trim' },
    ],
  },
  {
    label: 'annotation',
    tools: [
      { label: 'text', command: 'MTEXT', icon: 'text' },
      { label: 'dimension', command: 'DIMLINEAR', icon: 'dimension' },
      { label: 'dimensionStyle', command: 'DIMSTYLE', icon: 'dimension' },
    ],
  },
  { label: 'layers', tools: [{ label: 'layerProperties', command: 'LAYER', icon: 'layer' }] },
  { label: 'properties', tools: [{ label: 'properties', command: 'PROPERTIES', icon: 'options' }] },
];
const panels: Record<RibbonTab, readonly Panel[]> = {
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
  annotate: [homePanels[2]!],
  parametric: [
    {
      label: 'parametric',
      tools: [{ label: 'constraints', command: 'GEOCONSTRAINT', icon: 'dimension' }],
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

const quickTools: readonly Tool[] = [
  { label: 'newDrawing', command: 'NEW', icon: 'new' },
  { label: 'open', command: 'OPEN', icon: 'open' },
  { label: 'exportDxf', command: 'QSAVE', icon: 'save' },
  { label: 'undo', command: 'U', icon: 'undo' },
  { label: 'redo', command: 'REDO', icon: 'redo' },
  { label: 'plot', command: 'PLOT', icon: 'plot' },
];
const fileTools: readonly Tool[] = [
  { label: 'newDrawing', command: 'NEW', icon: 'new' },
  { label: 'openCad', command: 'OPEN', icon: 'open' },
  { label: 'exportPdf', command: 'EXPORTPDF', icon: 'plot' },
  { label: 'exportPng', command: 'EXPORTPNG', icon: 'rectangle' },
  { label: 'exportJpg', command: 'EXPORTJPG', icon: 'rectangle' },
  { label: 'exportSvg', command: 'EXPORTSVG', icon: 'line' },
  { label: 'exportDxf', command: 'QSAVE', icon: 'save' },
];

export function TitleBar({
  messages,
  locale,
  onLocale,
  execute,
  fileName,
}: {
  messages: Messages;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  execute: Execute;
  fileName: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuHost = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    menuHost.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function outside(event: PointerEvent): void {
      if (event.target instanceof Node && !menuHost.current?.contains(event.target))
        setMenuOpen(false);
    }
    function keyboard(event: KeyboardEvent): void {
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setMenuOpen(false);
        menuButton.current?.focus();
      } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const items = [
          ...(menuHost.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
        ];
        const current = items.findIndex((item) => item === document.activeElement);
        const index =
          event.code === 'Home'
            ? 0
            : event.code === 'End'
              ? items.length - 1
              : (current + (event.code === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[index]?.focus();
      } else if (event.code === 'Tab') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard, true);
    };
  }, [menuOpen]);
  return (
    <header className="title-bar">
      <div className="file-menu-host" ref={menuHost}>
        <button
          ref={menuButton}
          className="app-mark"
          aria-label={messages.appMenu}
          title={messages.appMenu}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls="application-file-menu"
          onClick={() => setMenuOpen((value) => !value)}
        >
          {messages.appMenu}
        </button>
        {menuOpen && (
          <div
            id="application-file-menu"
            className="application-file-menu"
            role="menu"
            aria-label={messages.appMenu}
            data-file-menu-open
          >
            {fileTools.map((tool) => (
              <button
                key={tool.command}
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  execute(tool.command);
                }}
              >
                <Icon name={tool.icon} small />
                <span>{messages[tool.label]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="quick-access" role="toolbar" aria-label={messages.quickAccess}>
        {quickTools.map((tool) => (
          <button
            key={tool.command}
            className="icon-button"
            aria-label={messages[tool.label]}
            title={`${messages[tool.label]} (${tool.command})`}
            onClick={() => execute(tool.command)}
          >
            <Icon name={tool.icon} small />
          </button>
        ))}
      </div>
      <div className="workspace-name" aria-label={messages.workspace}>
        {messages.workspaceName}
        <span aria-hidden="true">⌄</span>
      </div>
      <div className="window-title">
        {fileName} — {messages.appName}
      </div>
      <select
        className="language-select"
        aria-label={messages.language}
        value={locale}
        onChange={(event) => onLocale(event.target.value === 'en-US' ? 'en-US' : 'ko-KR')}
      >
        <option value="ko-KR">{messages.korean}</option>
        <option value="en-US">{messages.english}</option>
      </select>
      <button className="development-button" onClick={() => execute('HANPROGRESS')}>
        {messages.developmentProgress}
      </button>
    </header>
  );
}

export function Ribbon({
  messages,
  activeTab,
  setActiveTab,
  execute,
}: {
  messages: Messages;
  activeTab: RibbonTab;
  setActiveTab: (tab: RibbonTab) => void;
  execute: Execute;
}) {
  return (
    <section className="ribbon" aria-label={messages.ribbon}>
      <div className="ribbon-tabs" role="tablist" aria-label={messages.ribbon}>
        {ribbonTabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={tab === activeTab}
            className={tab === activeTab ? 'ribbon-tab active' : 'ribbon-tab'}
            onClick={() => setActiveTab(tab)}
          >
            {messages[tab]}
          </button>
        ))}
      </div>
      <div className="ribbon-body" role="tabpanel" aria-label={messages[activeTab]}>
        {panels[activeTab].map((panel) => (
          <div className="ribbon-panel" key={panel.label}>
            <div className="panel-tools">
              {panel.tools.map((tool) => (
                <button
                  key={tool.command}
                  className="ribbon-tool"
                  title={`${messages[tool.label]} (${tool.command})`}
                  onClick={() => execute(tool.command)}
                >
                  <Icon name={tool.icon} />
                  <span>{messages[tool.label]}</span>
                </button>
              ))}
            </div>
            {panel.label === 'layers' && (
              <div className="layer-placeholder">
                <i aria-hidden="true" />
                {messages.byLayer}
              </div>
            )}
            <div className="panel-label">{messages[panel.label]}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FileTabs({
  messages,
  execute,
  fileName,
}: {
  messages: Messages;
  execute: Execute;
  fileName: string;
}) {
  return (
    <nav className="file-tabs" aria-label={messages.fileTabs}>
      <button className="file-tab active" aria-current="page">
        <span className="file-dot" />
        {fileName}
      </button>
      <button
        className="add-tab"
        aria-label={messages.newDrawing}
        title={messages.newDrawing}
        onClick={() => execute('NEW')}
      >
        +
      </button>
    </nav>
  );
}
