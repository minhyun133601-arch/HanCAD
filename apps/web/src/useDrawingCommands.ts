import { useRef } from 'react';
import type { Messages } from '@hancad/ui';
import { useDrafting } from './useDrafting';
import { useDimensions } from './useDimensions';
import { useModification } from './useModification';
import { useMeasurement } from './useMeasurement';
import { useEditingTools } from './useEditingTools';
import { useTextCreation } from './useTextCreation';
import type { useDrawingFiles } from './useDrawingFiles';
import type { useCommandSession } from './useCommandSession';

interface Controller {
  isActive: () => boolean;
  cancel: (notify?: boolean) => boolean;
  submit: (value: string) => boolean;
}
export function useDrawingCommands({
  session,
  files,
  messages,
}: {
  session: ReturnType<typeof useCommandSession>;
  files: ReturnType<typeof useDrawingFiles>;
  messages: Messages;
}) {
  const controllers = useRef<Record<string, Controller>>({});
  function cancelOthers(except = ''): void {
    for (const [name, item] of Object.entries(controllers.current))
      if (name !== except && item.isActive()) item.cancel(false);
  }
  const common = {
    registry: session.registry,
    sysvars: session.sysvars,
    messages,
    getState: files.getState,
    commitState: files.commitState,
    print: session.print,
  };
  const draft = useDrafting({ ...common, state: files.state });
  const dimensions = useDimensions({
    ...common,
    selectedIds: draft.selectedIds,
    cancelDraft: () => cancelOthers('dimensions'),
  });
  const modification = useModification({
    ...common,
    getSelectedIds: draft.getSelectedIds,
    clearSelection: draft.clearSelection,
    cancelOthers: () => cancelOthers('modification'),
  });
  const measurement = useMeasurement({
    ...common,
    cancelOthers: () => cancelOthers('measurement'),
  });
  const editing = useEditingTools({ ...common, cancelOthers: () => cancelOthers('editing') });
  const text = useTextCreation({ ...common, cancelOthers: () => cancelOthers('text') });
  controllers.current = { editing, text, modification, measurement, dimensions, draft };
  const active = Object.values(controllers.current).some((item) => item.isActive());
  const preview =
    editing.snapshot?.preview ??
    text.snapshot?.preview ??
    dimensions.snapshot?.preview ??
    modification.snapshot?.preview ??
    measurement.snapshot?.preview ??
    draft.snapshot?.preview ??
    [];
  return {
    draft,
    dimensions,
    modification,
    measurement,
    editing,
    text,
    active,
    state: editing.snapshot?.state ?? files.state,
    selectedIds:
      editing.snapshot && editing.snapshot.tool !== 'OFFSET'
        ? editing.snapshot.boundaryIds
        : draft.selectedIds,
    preview: session.sysvars.getNumber('COMMANDPREVIEW') === 0 && editing.active ? [] : preview,
    previewHiddenIds:
      session.sysvars.getNumber('COMMANDPREVIEW') !== 0 && editing.snapshot?.tool !== 'OFFSET'
        ? (editing.snapshot?.previewHiddenIds ?? [])
        : [],
    prompt:
      editing.prompt ??
      text.prompt ??
      dimensions.prompt ??
      modification.prompt ??
      measurement.prompt ??
      draft.prompt ??
      session.prompt,
    usage: text.active
      ? messages.textUsage
      : editing.active
        ? messages.editingUsage
        : dimensions.active
          ? messages.dimensionUsage
          : messages.draftingUsage,
    editable: dimensions.active ? dimensions.editable : !active && session.editable,
    isActive: () => Object.values(controllers.current).some((item) => item.isActive()),
    cancelAll: cancelOthers,
    cancel: (): boolean => {
      const item = Object.values(controllers.current).find((entry) => entry.isActive());
      if (item) {
        item.cancel();
        return true;
      }
      if (draft.getSelectedIds().length) {
        draft.cancel();
        return true;
      }
      return false;
    },
    submit: (value: string): boolean =>
      Object.values(controllers.current).some((item) => item.submit(value)),
  };
}
