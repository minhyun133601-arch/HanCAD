import { useEffect, useRef, useState } from 'react';
import { getMessages, type Locale } from '@hancad/ui';
import { CommandLine } from './CommandLine';
import { DrawingSurface, type LayoutId } from './DrawingSurface';
import { FileTabs, Ribbon, TitleBar, type RibbonTab } from './ShellChrome';
import { changeToggle, StatusBar, type StatusToggle } from './StatusBar';
import { createPlatform } from './platform';
import { useCommandSession } from './useCommandSession';
import { useDrawingFiles } from './useDrawingFiles';
import { ImportReport } from './ImportReport';
import { ProgressDialog } from './ProgressDialog';
import type { CanvasSurface } from './canvas-surface';
import { DimensionStyleDialog } from './DimensionStyleDialog';
import { useCanvasInteraction } from './useCanvasInteraction';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';
import { useDrawingCommands } from './useDrawingCommands';
import { InlineTextEditor } from './InlineTextEditor';

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
  const tools = useDrawingCommands({ session, files, messages });
  const { draft, dimensions, modification, measurement, editing, text } = tools;
  const canvasSurface = useRef<CanvasSurface | null>(null);
  const interaction = useCanvasInteraction({
    files,
    draft,
    dimensions,
    modification,
    measurement,
    editing,
    text,
    session,
    progressOpen,
    messages,
    surface: canvasSurface,
  });
  const inputRef = useRef<HTMLDivElement | HTMLInputElement>(null);

  function focusCommand(): void {
    if (!text.editable) inputRef.current?.focus({ preventScroll: true });
  }
  function execute(command: string): void {
    canvasSurface.current?.cancelPointerInteraction();
    if (files.restoring) files.cancelRestore(false);
    tools.cancelAll();
    canvasSurface.current?.setSnapMarker();
    setCommandVisible(true);
    session.startCommand(command);
    focusCommand();
  }
  async function submit(value: string): Promise<void> {
    if (tools.submit(value)) {
      session.changeInput('');
      if (!tools.isActive()) canvasSurface.current?.setSnapMarker();
      return;
    }
    canvasSurface.current?.cancelPointerInteraction();
    await session.execute(value);
  }
  function cancel(): void {
    canvasSurface.current?.cancelPointerInteraction();
    if (!tools.cancel()) session.cancel();
    session.changeInput('');
    canvasSurface.current?.setSnapMarker();
  }
  function openFile(file: File): void {
    tools.cancelAll();
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
  }, [commandVisible, session.editable, dimensions.editable, text.editable]);
  useEffect(() => {
    tools.cancelAll();
  }, [files.fitRevision]);
  useEffect(() => {
    if (!tools.active) canvasSurface.current?.setSnapMarker();
  }, [tools.active]);
  useEffect(() => {
    void platform.info().catch((error: unknown) => {
      session.print(
        messages.commandFailure(error instanceof Error ? error.message : String(error)),
      );
    });
  }, [platform]);

  useWorkspaceShortcuts({
    files,
    draft,
    dimensions,
    modification,
    measurement,
    additional: [editing, text],
    messages,
    print: session.print,
    execute,
    focusCommand,
    toggle,
    cancelPointer: () => canvasSurface.current?.cancelPointerInteraction(),
    showCommand: () => setCommandVisible(true),
    toggleCommand: () => setCommandVisible((value) => !value),
    toggleExpanded: () => setExpanded((value) => !value),
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
          drawing={tools.state}
          onReady={(surface) => {
            canvasSurface.current = surface;
          }}
          execute={execute}
          fitRevision={files.fitRevision}
          preview={interaction.dragPreview ?? tools.preview}
          previewHiddenIds={tools.previewHiddenIds}
          selectedIds={tools.selectedIds}
          active={tools.active}
          selectionGesture={interaction.selectionGesture}
          onPick={interaction.pick}
          onCoordinates={interaction.cursor}
          canSelectArea={interaction.canSelectArea}
          onSelectionDrag={interaction.selectionDrag}
          suppressSelectionBox={interaction.suppressSelectionBox}
          getNavigationSettings={interaction.getNavigationSettings}
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
        <div className="drafting-usage">{tools.usage}</div>
        <InlineTextEditor
          messages={messages}
          entry={text.textEntry}
          surface={canvasSurface}
          changeText={text.changeText}
          submit={(value) => {
            text.submit(value);
          }}
          cancel={cancel}
        />
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
            prompt={tools.prompt}
            editable={tools.editable}
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
