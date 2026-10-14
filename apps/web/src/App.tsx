import { useEffect, useRef, useState } from 'react';
import { getMessages, type Locale } from '@hancad/ui';
import { CommandLine } from './CommandLine';
import { DrawingSurface, type LayoutId } from './DrawingSurface';
import { FileTabs, Ribbon, TitleBar, type RibbonTab } from './ShellChrome';
import { changeToggle, statusToggles, StatusBar, type StatusToggle } from './StatusBar';
import { createPlatform } from './platform';
import { useCommandSession } from './useCommandSession';
import { useDrawingFiles } from './useDrawingFiles';
import { ImportReport } from './ImportReport';
import { ProgressDialog } from './ProgressDialog';
import type { CanvasSurface } from './canvas-surface';
import { useDrafting } from './useDrafting';
import { useDimensions } from './useDimensions';
import { DimensionStyleDialog } from './DimensionStyleDialog';
import { snapDraftPoint } from '@hancad/draft';
import type { CadEntity, CadPoint } from '@hancad/legacy-bridge';
import type { CadPointerPick } from '@hancad/render';

const emptyPreview: readonly CadEntity[] = [];

export function App() {
  const [locale, setLocale] = useState<Locale>('ko-KR');
  const [ribbon, setRibbon] = useState<RibbonTab>('home');
  const [layout, setLayout] = useState<LayoutId>('model');
  const [expanded, setExpanded] = useState(false);
  const [commandVisible, setCommandVisible] = useState(true);
  const [progressOpen, setProgressOpen] = useState(false);
  const [platform] = useState(createPlatform);
  const messages = getMessages(locale);
  const session = useCommandSession(locale);
  const files = useDrawingFiles({
    registry: session.registry,
    database: session.database,
    messages,
    print: session.print,
  });
  const draft = useDrafting({
    registry: session.registry,
    sysvars: session.sysvars,
    messages,
    state: files.state,
    getState: files.getState,
    commitState: files.commitState,
    print: session.print,
  });
  const dimensions = useDimensions({
    registry: session.registry,
    sysvars: session.sysvars,
    messages,
    getState: files.getState,
    commitState: files.commitState,
    selectedIds: draft.selectedIds,
    cancelDraft: () => draft.cancel(false),
    print: session.print,
  });
  const interaction = useRef({ files, draft, dimensions, session, progressOpen });
  interaction.current = { files, draft, dimensions, session, progressOpen };
  const canvasSurface = useRef<CanvasSurface | null>(null);
  const inputRef = useRef<HTMLDivElement | HTMLInputElement>(null);

  function focusCommand(): void {
    inputRef.current?.focus({ preventScroll: true });
  }
  function execute(command: string): void {
    if (files.restoring) files.cancelRestore(false);
    if (draft.isActive()) draft.cancel(false);
    if (dimensions.isActive()) dimensions.cancel(false);
    canvasSurface.current?.setSnapMarker();
    setCommandVisible(true);
    session.startCommand(command);
    focusCommand();
  }
  async function submit(value: string): Promise<void> {
    if (dimensions.submit(value) || draft.submit(value)) {
      session.changeInput('');
      if (!draft.isDrafting() && !dimensions.isActive()) canvasSurface.current?.setSnapMarker();
      return;
    }
    await session.execute(value);
  }
  function cancel(): void {
    if (dimensions.isActive()) {
      dimensions.cancel();
      session.changeInput('');
    } else if (draft.isActive() || draft.selectedIds.length) {
      draft.cancel();
      session.changeInput('');
    } else session.cancel();
    canvasSurface.current?.setSnapMarker();
  }
  function snapped(point: CadPoint): CadPoint {
    const live = interaction.current;
    const result =
      live.draft.isDrafting() || live.dimensions.needsPoint()
        ? snapDraftPoint(
            live.files.getState(),
            point,
            10 / (canvasSurface.current?.getView().scale ?? 1),
            live.session.sysvars.getNumber('OSMODE'),
          )
        : undefined;
    canvasSurface.current?.setSnapMarker(result?.point);
    return result?.point ?? point;
  }
  function pick(event: CadPointerPick): void {
    const live = interaction.current;
    if (live.files.reading || live.files.restoring || live.progressOpen) return;
    if (live.dimensions.isActive()) {
      const entity = event.entityId
        ? live.files.getState().entities.find((item) => item.id === event.entityId)
        : undefined;
      live.dimensions.pick(snapped(event.point), entity);
    } else live.draft.pick({ ...event, point: snapped(event.point) });
  }
  function cursor(point: CadPoint): void {
    const live = interaction.current;
    if (live.files.reading || live.files.restoring || live.progressOpen) return;
    if (live.dimensions.isActive()) {
      const id = live.dimensions.needsEntity() ? canvasSurface.current?.pick(point) : undefined;
      const entity = id ? live.files.getState().entities.find((item) => item.id === id) : undefined;
      live.dimensions.cursor(snapped(point), entity);
    } else live.draft.cursor(snapped(point));
  }
  function openFile(file: File): void {
    if (draft.isActive()) draft.cancel(false);
    if (dimensions.isActive()) dimensions.cancel(false);
    void files.openFile(file);
  }
  function toggle(item: StatusToggle): void {
    try {
      const enabled = changeToggle(session.sysvars, item);
      session.print(messages.statusChanged(messages[item.label], enabled));
      session.refresh();
    } catch (error) {
      session.print(
        messages.commandFailure(error instanceof Error ? error.message : String(error)),
      );
    }
    focusCommand();
  }

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = files.fileName ? `${files.fileName} — ${messages.appName}` : messages.appName;
  }, [locale, messages, files.fileName]);
  useEffect(() => {
    const korean = getMessages('ko-KR'),
      english = getMessages('en-US');
    session.registry.register({
      name: 'HANPROGRESS',
      displayName: { 'ko-KR': korean.developmentProgress, 'en-US': english.developmentProgress },
      description: { 'ko-KR': korean.progressNote, 'en-US': english.progressNote },
      execute: () => setProgressOpen(true),
    });
    session.registry.register({
      name: 'ZOOM',
      displayName: { 'ko-KR': korean.zoom, 'en-US': english.zoom },
      description: { 'ko-KR': korean.fitDrawing, 'en-US': english.fitDrawing },
      execute: (context) => {
        const option = context.input.take();
        if (typeof option === 'string' && /^_?E$/i.test(option)) canvasSurface.current?.fit();
        else context.print(messages.zoomExtentsOnly);
      },
    });
  }, [session.registry, messages]);
  useEffect(() => {
    focusCommand();
  }, [commandVisible, session.editable, dimensions.editable]);
  useEffect(() => {
    draft.cancel(false);
    dimensions.cancel(false);
  }, [files.fitRevision]);
  useEffect(() => {
    if (!draft.active && !dimensions.active) canvasSurface.current?.setSnapMarker();
  }, [draft.active, dimensions.active]);
  useEffect(() => {
    void platform.info().catch((error: unknown) => {
      session.print(
        messages.commandFailure(error instanceof Error ? error.message : String(error)),
      );
    });
  }, [platform]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      if (document.querySelector('dialog[open], [data-file-menu-open]')) return;
      if (files.restoring && event.code === 'Escape') {
        event.preventDefault();
        files.cancelRestore();
        return;
      }
      if (files.reading) {
        if (event.code === 'Escape') {
          event.preventDefault();
          files.cancelImport();
        }
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      if (event.ctrlKey && event.code === 'KeyO') {
        event.preventDefault();
        execute('OPEN');
      } else if (event.ctrlKey && event.code === 'KeyS') {
        event.preventDefault();
        execute('QSAVE');
      } else if (event.ctrlKey && (event.code === 'KeyZ' || event.code === 'KeyY')) {
        event.preventDefault();
        execute(event.code === 'KeyY' || event.shiftKey ? 'REDO' : 'U');
      } else if (event.ctrlKey && event.code === 'KeyA') {
        event.preventDefault();
        if (draft.isActive()) draft.cancel(false);
        if (dimensions.isActive()) dimensions.cancel(false);
        draft.selectAll();
        focusCommand();
      } else if (event.code === 'Delete' && !draft.isActive() && !dimensions.isActive()) {
        event.preventDefault();
        execute('ERASE');
      } else if (event.code === 'F2') {
        event.preventDefault();
        setCommandVisible(true);
        setExpanded((value) => !value);
      } else if (event.ctrlKey && event.code === 'Digit9') {
        event.preventDefault();
        setCommandVisible((value) => !value);
      } else {
        const item = statusToggles.find((item) => item.key === event.code);
        if (item) {
          event.preventDefault();
          if (item.implemented === false) session.print(messages.draftingAidsPending);
          else toggle(item);
        }
      }
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  });

  return (
    <main
      className="app-shell"
      data-locale={locale}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0];
        if (file) {
          event.preventDefault();
          if (!progressOpen) openFile(file);
        }
      }}
    >
      <TitleBar
        messages={messages}
        locale={locale}
        onLocale={setLocale}
        execute={execute}
        fileName={files.fileName || messages.drawingName}
      />
      <Ribbon messages={messages} activeTab={ribbon} setActiveTab={setRibbon} execute={execute} />
      <FileTabs
        messages={messages}
        execute={execute}
        fileName={files.fileName || messages.drawingName}
      />
      <div className="workspace">
        <DrawingSurface
          messages={messages}
          layout={layout}
          onFocus={focusCommand}
          drawing={files.state}
          onReady={(surface) => {
            canvasSurface.current = surface;
          }}
          execute={execute}
          fitRevision={files.fitRevision}
          preview={dimensions.snapshot?.preview ?? draft.snapshot?.preview ?? emptyPreview}
          selectedIds={draft.selectedIds}
          active={draft.active || dimensions.active}
          onPick={pick}
          onCoordinates={cursor}
        />
        <div className="drawing-tools">
          <span>
            {messages.drawingObjects}{' '}
            <b data-testid="drawing-entity-count">{files.state.entities.length}</b>
          </span>
          <span>
            {messages.visibleObjects} {files.visibleCount}
          </span>
          <button onClick={() => execute('ZOOM E')}>{messages.fitDrawing}</button>
        </div>
        <div className="drafting-usage">
          {dimensions.active ? messages.dimensionUsage : messages.draftingUsage}
        </div>
        {draft.selectedIds.length > 0 && (
          <div className="draft-selection-count">
            {messages.selectedObjects(draft.selectedIds.length)}
          </div>
        )}
        {files.hiddenAll && (
          <div className="hidden-layers-notice">
            <p>{messages.hiddenLayersNote}</p>
            <button onClick={() => execute('LAYON')}>{messages.showAllLayers}</button>
          </div>
        )}
        <ImportReport report={files.report} messages={messages} />
        {files.reading && (
          <div className="drawing-loading" role="status">
            <p>{files.progress || messages.importing}</p>
            <button onClick={files.cancelImport}>{messages.cancelImport}</button>
          </div>
        )}
        {files.restoring && !files.reading && (
          <div className="drawing-loading" role="status">
            <p>{messages.restoringDrawing}</p>
            <button onClick={() => files.cancelRestore()}>{messages.cancelImport}</button>
          </div>
        )}
        {commandVisible && (
          <CommandLine
            messages={messages}
            history={session.history}
            input={session.input}
            prompt={dimensions.prompt ?? draft.prompt ?? session.prompt}
            editable={dimensions.active ? dimensions.editable : !draft.active && session.editable}
            busy={session.busy}
            blocked={files.reading || files.restoring}
            expanded={expanded}
            inputRef={inputRef}
            changeInput={session.changeInput}
            execute={submit}
            recall={session.recall}
            cancel={cancel}
            onExpanded={() => setExpanded((value) => !value)}
          />
        )}
      </div>
      <StatusBar
        messages={messages}
        layout={layout}
        onLayout={setLayout}
        sysvars={session.sysvars}
        toggle={toggle}
        mode={platform.mode}
        execute={execute}
      />
      <input
        ref={files.fileInput}
        type="file"
        accept=".dwg,.dxf"
        hidden
        data-testid="cad-file-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) openFile(file);
        }}
      />
      <ProgressDialog
        messages={messages}
        open={progressOpen}
        onClose={() => {
          setProgressOpen(false);
          focusCommand();
        }}
      />
      <DimensionStyleDialog
        messages={messages}
        open={dimensions.styleOpen}
        sysvars={session.sysvars}
        selectedCount={dimensions.selectedDimensionCount}
        onApply={(values, selected) => {
          dimensions.applyStyle(values, selected);
          session.refresh();
        }}
        onClose={() => {
          dimensions.closeStyle();
          focusCommand();
        }}
      />
    </main>
  );
}
