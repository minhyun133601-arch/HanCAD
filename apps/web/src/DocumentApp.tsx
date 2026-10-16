import { useEffect, useRef, useState } from 'react';
import { getCommandLineMessages, getMessages, type Locale } from '@hancad/ui';
import { CommandWindow } from './command-line/CommandWindow';
import { useCommandWindow } from './command-line/useCommandWindow';
import { useCommandWindowCommands } from './command-line/useCommandWindowCommands';
import { DrawingSurface, type LayoutId } from './DrawingSurface';
import { FileTabs, Ribbon, TitleBar, type RibbonTab } from './ShellChrome';
import { changeToggle, StatusBar, type StatusToggle } from './StatusBar';
import { createPlatform } from './platform';
import { useCommandSession } from './useCommandSession';
import { useDrawingFiles } from './useDrawingFiles';
import { DrawingNotices } from './DrawingNotices';
import { ProgressDialog } from './ProgressDialog';
import type { CanvasSurface } from './canvas-surface';
import { DimensionStyleDialog } from './DimensionStyleDialog';
import { useCanvasInteraction } from './useCanvasInteraction';
import { useWorkspaceShortcuts } from './useWorkspaceShortcuts';
import { useDrawingCommands } from './useDrawingCommands';
import { InlineTextEditor } from './InlineTextEditor';
import { errorMessage } from './error-presenter';
import { useViewHistory } from './view-history';
import { layoutFromName, layoutName, useHostVariables } from './host-variables';
import type { DocumentManager, DrawingDocument } from '@hancad/sysvars';
import { useViewNavigation } from './useViewNavigation';
import { useCommandRouting } from './useCommandRouting';
import { DisplayOptionsDialog } from './DisplayOptionsDialog';

export function DocumentApp({
  document: drawingDocument,
  manager,
  restoreLocal,
  newDocument,
  locale,
  setLocale,
}: {
  document: DrawingDocument;
  manager: DocumentManager;
  restoreLocal: boolean;
  newDocument: () => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}) {
  const [ribbon, setRibbon] = useState<RibbonTab>('home');
  const [layout, setLayout] = useState<LayoutId>('model');
  const commandWindow = useCommandWindow();
  const [progressOpen, setProgressOpen] = useState(false);
  const [platform] = useState(createPlatform);
  const messages = getMessages(locale);
  const commandText = getCommandLineMessages(locale);
  const displayName = drawingDocument.name;
  const session = useCommandSession(locale, drawingDocument);
  const files = useDrawingFiles({
    registry: session.registry,
    database: session.database,
    messages,
    print: session.print,
    documentName: drawingDocument.name,
    restoreLocal,
    newDocument,
    manager,
    documentId: drawingDocument.id,
    ...(drawingDocument.notice ? { notice: drawingDocument.notice } : {}),
    consumeNotice: () => {
      delete drawingDocument.notice;
    },
  });
  const tools = useDrawingCommands({ session, files, messages });
  const { draft, dimensions, modification, measurement, editing, text } = tools;
  const canvasSurface = useRef<CanvasSurface | null>(null);
  const navigation = useViewNavigation({
    session,
    files,
    surface: canvasSurface,
    selected: draft.getSelectedIds,
    cancelOthers: tools.cancelAll,
    korean: locale === 'ko-KR',
  });
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
    navigation,
  });
  const onNavigate = useViewHistory(session.database, canvasSurface);
  useEffect(() => {
    const saved = session.database.getVariable('CLAYOUT');
    const initial = typeof saved === 'string' ? layoutFromName(saved) : undefined;
    if (initial) setLayout(initial);
  }, [session.database]);
  useEffect(
    () =>
      session.sysvars.events.subscribe((event) => {
        if (event.name !== 'CLAYOUT' || typeof event.value !== 'string') return;
        const next = layoutFromName(event.value);
        if (next) setLayout(next);
      }),
    [session.sysvars],
  );
  useHostVariables(drawingDocument.id, { locale, layout, state: tools.state }, canvasSurface);
  const inputRef = useRef<HTMLDivElement | HTMLInputElement>(null);
  const routing = useCommandRouting({ session, navigation, tools, surface: canvasSurface, locale });
  const { inputMode, commandActive, commandName, historyContext, submit, cancel } = routing;

  function focusCommand(): void {
    if (!text.editable) inputRef.current?.focus({ preventScroll: true });
  }
  function execute(command: string): void {
    canvasSurface.current?.cancelPointerInteraction();
    routing.reset();
    if (files.restoring) files.cancelRestore(false);
    tools.cancelAll();
    navigation.cancel(false);
    canvasSurface.current?.setSnapMarker();
    commandWindow.show();
    session.startCommand(command);
    focusCommand();
  }
  function openFile(file: File): void {
    navigation.cancel(false);
    tools.cancelAll();
    void files.openFile(file);
  }
  function toggle(item: StatusToggle): void {
    try {
      const enabled = changeToggle(session.sysvars, item);
      session.print(messages.statusChanged(messages[item.label], enabled));
      session.refresh();
    } catch (error) {
      session.print(messages.commandFailure(errorMessage(error, messages)));
    }
    focusCommand();
  }

  useEffect(() => {
    const name = files.fileName || drawingDocument.name;
    if (/\.hcd$/i.test(drawingDocument.name)) return;
    if (drawingDocument.name !== name) manager.rename(drawingDocument.id, name);
  }, [files.fileName, drawingDocument, manager]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${displayName} — ${messages.appName}`;
  }, [locale, messages, displayName]);
  useEffect(() => {
    const korean = getMessages('ko-KR'),
      english = getMessages('en-US');
    session.registry.register({
      name: 'HANPROGRESS',
      displayName: { 'ko-KR': korean.developmentProgress, 'en-US': english.developmentProgress },
      description: { 'ko-KR': korean.progressNote, 'en-US': english.progressNote },
      execute: () => setProgressOpen(true),
    });
  }, [session.registry, messages]);
  useEffect(() => {
    focusCommand();
  }, [commandWindow.visible, session.editable, dimensions.editable, text.editable]);
  useEffect(() => {
    tools.cancelAll();
    navigation.cancel(false);
  }, [files.fitRevision]);
  useEffect(() => {
    if (!tools.active) canvasSurface.current?.setSnapMarker();
  }, [tools.active]);
  useEffect(() => {
    void platform.info().catch((error: unknown) => {
      session.print(messages.commandFailure(errorMessage(error, messages)));
    });
  }, [platform]);

  useCommandWindowCommands(session.registry, commandWindow);
  useWorkspaceShortcuts({
    files,
    draft,
    dimensions,
    modification,
    measurement,
    additional: [navigation, editing, text],
    messages,
    print: session.print,
    execute,
    focusCommand,
    toggle,
    cancelPointer: () => canvasSurface.current?.cancelPointerInteraction(),
    showCommand: commandWindow.show,
    toggleCommand: commandWindow.toggle,
    toggleExpanded: commandWindow.pressF2,
    openTextWindow: commandWindow.openTextWindow,
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
        fileName={displayName}
      />
      <Ribbon messages={messages} activeTab={ribbon} setActiveTab={setRibbon} execute={execute} />
      <FileTabs
        messages={messages}
        execute={execute}
        fileName={displayName}
        documents={manager.all}
        activeId={drawingDocument.id}
        activate={(id) => {
          tools.cancelAll();
          manager.activate(id);
        }}
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
          selectedIds={navigation.snapshot?.selectedIds ?? tools.selectedIds}
          active={tools.active || navigation.active}
          selectionGesture={interaction.selectionGesture}
          onPick={interaction.pick}
          onCoordinates={interaction.cursor}
          canSelectArea={interaction.canSelectArea}
          onSelectionDrag={interaction.selectionDrag}
          suppressSelectionBox={interaction.suppressSelectionBox}
          getNavigationSettings={interaction.getNavigationSettings}
          onNavigate={onNavigate}
          getNavigationMode={interaction.getNavigationMode}
          getNavigationWindow={interaction.getNavigationWindow}
          getAidSettings={interaction.getAidSettings}
          getSystemVariable={interaction.getSystemVariable}
          getLinetypes={interaction.getLinetypes}
          getLayerStyles={interaction.getLayerStyles}
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
        <CommandWindow
          window={commandWindow}
          messages={messages}
          locale={locale}
          text={commandText}
          session={session}
          drawingName={displayName}
          prompt={routing.prompt}
          commandName={commandName}
          editable={routing.editable}
          mode={inputMode}
          commandActive={commandActive}
          blocked={files.reading || files.restoring}
          inputRef={inputRef}
          submit={submit}
          runCommand={execute}
          recall={(direction) => session.recall(direction, historyContext)}
          cancel={cancel}
        />
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
        <DrawingNotices files={files} messages={messages} execute={execute} />
      </div>
      <StatusBar
        messages={messages}
        layout={layout}
        onLayout={(next) => {
          // Switching tabs is not a drawing edit; SETVAR CLAYOUT remains undoable.
          const layout = session.database.find('LAYOUT', layoutName(next));
          if (layout)
            session.database.writeUntrackedVariable(
              'CLAYOUT',
              `${layoutName(next)}*${layout.handle}`,
            );
          setLayout(next);
        }}
        sysvars={session.sysvars}
        toggle={toggle}
        mode={platform.mode}
        execute={execute}
      />
      <input
        ref={files.fileInput}
        type="file"
        accept=".dwg,.dxf,.hcd"
        hidden
        data-testid="cad-file-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) openFile(file);
        }}
      />
      <ProgressDialog
        messages={messages}
        locale={locale}
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
      <DisplayOptionsDialog
        open={navigation.optionsOpen}
        korean={locale === 'ko-KR'}
        background={navigation.background}
        apply={navigation.setBackground}
        close={() => {
          navigation.setOptionsOpen(false);
          focusCommand();
        }}
      />
    </main>
  );
}
