import { useEffect, useState } from 'react';
import { DocumentManager } from '@hancad/sysvars';
import { DocumentApp } from './DocumentApp';
import { restoreProfileVariables, subscribeProfileVariables } from './profile-storage';
import { createDocument } from './document-actions';
import type { Locale } from '@hancad/ui';
import { restoreDrawing, drawingViewVariable } from './drawing-storage';
import { cachedNativeDatabase, cachedNativeBlobs, nativeDrawingView } from './native-drawing-cache';

/** A document owns its database/journal; only its current workspace is mounted. */
export function App() {
  const [locale, setLocale] = useState<Locale>('ko-KR');
  const [manager] = useState(() => {
    const value = new DocumentManager();
    restoreProfileVariables(value.profile);
    const restored = restoreDrawing();
    const native = cachedNativeDatabase(restored.drawing);
    if (native) {
      native.transaction('RESTORE', (tx) =>
        tx.setVariable(drawingViewVariable, JSON.stringify(nativeDrawingView(restored.drawing))),
      );
      native.clearHistory();
      value.create(
        native,
        restored.drawing.fileName || restored.drawing.state.name,
        cachedNativeBlobs(restored.drawing),
        'restored',
        restored.drawing.nativeTitled ?? Boolean(restored.drawing.fileName),
      );
    } else value.create();
    return value;
  });
  const [active, setActive] = useState(manager.active);
  const [, refresh] = useState(0);
  const [initialId] = useState(manager.active?.id);
  useEffect(() => subscribeProfileVariables(manager.profile), [manager]);
  useEffect(
    () =>
      manager.events.subscribe((event) => {
        if (event.type === 'document-activated') setActive(event.document);
        else if (event.type === 'documents-empty') setActive(manager.create());
        refresh((value) => value + 1);
      }),
    [manager],
  );
  if (!active) return null;
  return (
    <DocumentApp
      key={active.id}
      document={active}
      manager={manager}
      restoreLocal={active.id === initialId}
      locale={locale}
      setLocale={setLocale}
      newDocument={() => createDocument(manager)}
    />
  );
}
