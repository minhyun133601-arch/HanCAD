import { useEffect, useRef, useState } from 'react';
import { parsePgp } from '@hancad/commands';
import { getAliasEditMessages } from '@hancad/ui';
import type { Locale } from '@hancad/ui';
import type { useCommandSession } from '../useCommandSession';
import { AliasEditDialog } from './AliasEditDialog';
import { ReinitDialog } from './ReinitDialog';
import type { InputSearchStore } from './input-search-store';
import { pgpStore } from './pgp-store';
import type { PgpKind } from './pgp-store';
import './alias-edit.css';

const neutral = { 'ko-KR': '', 'en-US': '' } as const;

/**
 * The user's acad.pgp and synonym list in one drawing's registry: loaded at start,
 * reloaded by REINIT or RE-INIT bit 16, and edited with ALIASEDIT.
 */
export function PgpCommands({
  session,
  locale,
  searchStore,
  onClosed,
}: {
  session: ReturnType<typeof useCommandSession>;
  locale: Locale;
  searchStore: InputSearchStore;
  onClosed: () => void;
}) {
  const text = getAliasEditMessages(locale);
  const [store] = useState(pgpStore);
  const [reinitOpen, setReinitOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const latest = useRef({ session, text });
  latest.current = { session, text };
  const { registry, sysvars } = session;

  async function reload(): Promise<void> {
    for (const kind of ['aliases', 'synonyms'] as const satisfies readonly PgpKind[]) {
      const result = await store.reload(kind);
      const live = latest.current;
      if (result.status === 'denied') live.session.print(live.text.reloadDenied(result.name));
      else if (result.status === 'failed') live.session.print(live.text.reloadFailed(result.name));
      const file = store.file(kind);
      const invalid = file ? parsePgp(file.text).invalidLines : [];
      if (file && invalid.length)
        live.session.print(live.text.invalidLines(file.name, invalid.join(', ')));
    }
  }
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const sync = (): void => {
      registry.reloadPgp(store.file('aliases')?.text, store.removed);
      registry.loadSynonyms(store.file('synonyms')?.text ?? '');
    };
    sync();
    return store.subscribe(sync);
  }, [registry, store]);
  useEffect(() => {
    for (const [name, open] of [
      ['REINIT', () => setReinitOpen(true)],
      ['ALIASEDIT', () => setEditOpen(true)],
    ] as const)
      registry.register({ name, displayName: neutral, description: neutral, execute: open });
  }, [registry]);
  useEffect(
    () =>
      sysvars.events.subscribe((event) => {
        if (event.name !== 'RE-INIT' || typeof event.value !== 'number' || !(event.value & 16))
          return;
        void reloadRef.current();
        // RE-INIT acts as a trigger; clearing it lets the next 16 reload again.
        queueMicrotask(() => sysvars.set('RE-INIT', 0));
      }),
    [sysvars],
  );

  return (
    <>
      <ReinitDialog
        open={reinitOpen}
        text={text}
        onReload={() => void reload()}
        onClose={() => {
          setReinitOpen(false);
          onClosed();
        }}
      />
      <AliasEditDialog
        open={editOpen}
        text={text}
        store={store}
        searchStore={searchStore}
        onSaved={(problems) => {
          for (const problem of problems) latest.current.session.print(problem);
        }}
        onClose={() => {
          setEditOpen(false);
          onClosed();
        }}
      />
    </>
  );
}
