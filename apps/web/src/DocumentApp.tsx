import { useEffect, useRef, useState } from 'react';
import { getCommandLineMessages, getMessages, type Locale } from '@hancad/ui';
import { CommandWindow } from './command-line/CommandWindow';
import { useCommandWindow } from './command-line/useCommandWindow';
import { useCommandWindowCommands } from './command-line/useCommandWindowCommands';
import { DrawingSurface, type LayoutId } from './DrawingSurface';
import { FileTabs, Ribbon, TitleBar, type RibbonTab } from './ShellChrome';
import { StatusBar } from './StatusBar';
import { createPlatform } from './platform';
import { useCommandSession } from './useCommandSession';
import { useDrawingFiles } from './useDrawingFiles';
import { DrawingNotices } from './DrawingNotices';
import type { CanvasSurface } from './canvas-surface';
import { useCanvasInteraction } from './useCanvasInteraction';
import { useDrawingCommands } from './useDrawingCommands';
import { InlineTextEditor } from './InlineTextEditor';
import { errorMessage } from './error-presenter';
import { useViewHistory } from './view-history';
import { layoutFromName, layoutName, useHostVariables } from './host-variables';
import type { DocumentManager, DrawingDocument } from '@hancad/sysvars';
import { useViewNavigation } from './useViewNavigation';

import { useCommandInput } from './useCommandInput';
import { DocumentDialogs } from './DocumentDialogs';
import { CommandPanels } from './CommandPanels';
import { useStatusCoordinates } from './status-coordinates';
import { useDynamicInput } from './useDynamicInput';
import { DynamicInputOverlay } from './DynamicInputOverlay';
import type { DynamicConstraints } from './dynamic-input-state';
import type { CadPoint } from '@hancad/legacy-bridge';
import { useDraftingSettingsCommands } from './useDraftingSettingsCommands';

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
  const typedResolver = useRef<ReturnType<typeof useCanvasInteraction>['resolveTypedPoint']>(
    () => undefined,
  );
  const dynamicConstraints = useRef<() => DynamicConstraints>(() => ({ relative: false }));
  const dynamicEditing = useRef<() => boolean>(() => false);
  const tools = useDrawingCommands({
    session,
    files,
    messages,
    resolveTypedPoint: (point, override) => typedResolver.current(point, override),
  });
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
    getDynamicConstraints: () => dynamicConstraints.current(),
  });
  typedResolver.current = interaction.resolveTypedPoint;
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
  const input = useCommandInput({
    session,
    navigation,
    tools,
    files,
    surface: canvasSurface,
    commandWindow,
    manager,
    drawing: drawingDocument,
    layout,
    changeLayout,
    focusCommand,
    locale,
    messages,
    inputIsDynamic: () => dynamicEditing.current(),
  });
  const { routing, toggle, submit, cancel, execute } = input;
  const { inputMode, commandActive, commandName, historyContext } = routing;
  const points =
    measurement.snapshot?.points ?? dimensions.snapshot?.points ?? draft.snapshot?.points;
  const basePoint =
    points?.at(-1) ??
    modification.snapshot?.basePoint ??
    (editing.snapshot?.tool === 'OFFSET' ? editing.snapshot.basePoint : undefined) ??
    text.snapshot?.point;
  const coordinates = useStatusCoordinates({
    sysvars: session.sysvars,
    pointPrompt: inputMode === 'point' || inputMode === 'number',
    ...(basePoint ? { basePoint } : {}),
  });
  const [dynamicCursor, setDynamicCursor] = useState<{ point: CadPoint; screen: CadPoint } | null>(
    null,
  );
  const dynamic = useDynamicInput({
    sysvars: session.sysvars,
    mode: inputMode,
    input: session.input,
    changeInput: session.changeInput,
    prompt: routing.prompt,
    commandActive,
    cursor: dynamicCursor,
    ...(basePoint ? { base: basePoint } : {}),
    locale,
    submit,
    focusCommand: () => canvasSurface.current?.canvas.focus({ preventScroll: true }),
  });
  dynamicConstraints.current = dynamic.getConstraints;
  dynamicEditing.current = dynamic.isEditing;
  const draftingSettings = useDraftingSettingsCommands(session.registry, locale);

  function focusCommand(): void {
    if (!text.editable) inputRef.current?.focus({ preventScroll: true });
  }
  function openFile(file: File): void {
    navigation.cancel(false);
    tools.cancelAll();
    void files.openFile(file);
  }
  function changeLayout(next: LayoutId): void {
    // Switching tabs is not a drawing edit; SETVAR CLAYOUT remains undoable.
    const record = session.database.find('LAYOUT', layoutName(next));
    if (record)
      session.database.writeUntrackedVariable('CLAYOUT', `${layoutName(next)}*${record.handle}`);
    setLayout(next);
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
      <Ribbon
        messages={messages}
        activeTab={ribbon}
        setActiveTab={setRibbon}
        execute={execute}
        keyTipsEnabled={session.sysvars.getNumber('MENUBAR') === 0}
      />
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
          onFocus={() => {
            if (!text.editable) canvasSurface.current?.canvas.focus({ preventScroll: true });
          }}
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
          onPick={(event) => {
            if (interaction.pick(event)) dynamic.reset();
            input.inputReceived();
          }}
          onCoordinates={(point) => {
            interaction.cursor(point);
            coordinates.cursor(point);
            const surface = canvasSurface.current;
            if (surface) {
              const p = surface.getCursorPosition() ?? surface.worldToScreen(point),
                rect = surface.canvas.getBoundingClientRect();
              const workspace = surface.canvas.closest('.workspace')?.getBoundingClientRect();
              setDynamicCursor({
                point,
                screen: {
                  x: p.x + rect.left - (workspace?.left ?? rect.left),
                  y: p.y + rect.top - (workspace?.top ?? rect.top),
                },
              });
            }
          }}
          canSelectArea={interaction.canSelectArea}
          onSelectionDrag={(event) => {
            interaction.selectionDrag(event);
            if (event.phase === 'end') input.inputReceived();
          }}
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
        <DynamicInputOverlay view={dynamic} />
        <div className="drawing-tools">
          <span>
            {messages.drawingObjects}{' '}
            <b data-testid="drawing-entity-count">{files.state.entities.length}</b>
          </span>
          <span>
            {messages.visibleObjects} {files.visibleCount}
          </span>
          <button onClick={() => execute("'_zoom _e")}>{messages.fitDrawing}</button>
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
        <CommandPanels
          settings={draftingSettings}
          session={session}
          input={input}
          locale={locale}
          selected={draft.selectedIds.length > 0}
          clearSelection={draft.clearSelection}
          focus={focusCommand}
          blocked={files.reading || files.restoring || progressOpen}
        />
      </div>
      <StatusBar
        openDraftingSettings={(tab) => {
          draftingSettings.selectTab(tab);
          input.execute("'_DSETTINGS");
        }}
        messages={messages}
        layout={layout}
        onLayout={changeLayout}
        sysvars={session.sysvars}
        toggle={toggle}
        pendingNote={input.pendingTooltip}
        mode={platform.mode}
        execute={execute}
        locale={locale}
        coordinates={coordinates.display}
        focusCommand={focusCommand}
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
      <DocumentDialogs
        messages={messages}
        locale={locale}
        progressOpen={progressOpen}
        closeProgress={() => setProgressOpen(false)}
        dimensions={dimensions}
        session={session}
        navigation={navigation}
        focus={focusCommand}
      />
    </main>
  );
}
