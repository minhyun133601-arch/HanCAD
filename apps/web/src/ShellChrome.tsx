import type { Locale, Messages } from '@hancad/ui';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  fileTools,
  panels,
  quickTools,
  ribbonTabs,
  tabKeyTips,
  toolKeyTips,
} from './ribbon-definitions';
import type { Execute, RibbonTab } from './ribbon-definitions';
import { RibbonKeyTips } from './RibbonKeyTips';
export type { RibbonTab } from './ribbon-definitions';
export { ribbonTabs } from './ribbon-definitions';

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
          data-ribbon-keytip="F"
          data-ribbon-keytip-level="root"
          data-ribbon-keytip-next="file"
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
                data-ribbon-keytip={toolKeyTips[tool.command]}
                data-ribbon-keytip-level="file"
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
        {quickTools.map((tool, index) => (
          <button
            key={tool.command}
            className="icon-button"
            aria-label={messages[tool.label]}
            title={`${messages[tool.label]} (${tool.command})`}
            data-ribbon-keytip={String(index + 1)}
            data-ribbon-keytip-level="root"
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
  keyTipsEnabled = true,
}: {
  messages: Messages;
  activeTab: RibbonTab;
  setActiveTab: (tab: RibbonTab) => void;
  execute: Execute;
  keyTipsEnabled?: boolean;
}) {
  return (
    <section className="ribbon" aria-label={messages.ribbon}>
      <RibbonKeyTips enabled={keyTipsEnabled} activeTab={activeTab} />
      <div className="ribbon-tabs" role="tablist" aria-label={messages.ribbon}>
        {ribbonTabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={tab === activeTab}
            className={tab === activeTab ? 'ribbon-tab active' : 'ribbon-tab'}
            data-ribbon-keytip={tabKeyTips[tab]}
            data-ribbon-keytip-level="root"
            data-ribbon-keytip-next="tools"
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
                  data-ribbon-keytip={toolKeyTips[tool.command]}
                  data-ribbon-keytip-level="tools"
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
  documents,
  activeId,
  activate,
}: {
  messages: Messages;
  execute: Execute;
  fileName: string;
  documents?: readonly { id: string; name: string }[];
  activeId?: string;
  activate?: (id: string) => void;
}) {
  return (
    <nav className="file-tabs" aria-label={messages.fileTabs}>
      {documents ? (
        documents.map((document) => (
          <button
            key={document.id}
            className={document.id === activeId ? 'file-tab active' : 'file-tab'}
            aria-current={document.id === activeId ? 'page' : undefined}
            onClick={() => activate?.(document.id)}
          >
            {document.id === activeId && <span className="file-dot" />}
            {document.name}
          </button>
        ))
      ) : (
        <button className="file-tab active" aria-current="page">
          <span className="file-dot" />
          {fileName}
        </button>
      )}
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
