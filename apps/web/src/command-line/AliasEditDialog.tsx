import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AutoCorrectMemory,
  CommandRegistry,
  parsePgp,
  removePgpAlias,
  removePgpExternal,
  setPgpAlias,
  setPgpExternal,
} from '@hancad/commands';
import type { AliasEditMessages } from '@hancad/ui';
import { ModalDialog } from './CommandDialogs';
import { PairTable } from './PairTable';
import type { InputSearchStore } from './input-search-store';
import type { PgpKind, PgpStore } from './pgp-store';

type Tab = 'aliases' | 'external' | 'corrections' | 'synonyms';
interface Draft {
  aliases: string;
  removed: readonly string[];
  synonyms: string;
  corrections: string;
}
const aliasPattern = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const commandPattern = /^[-_.']*[A-Za-z0-9][A-Za-z0-9_-]*$/;

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** ALIASEDIT: command aliases, external commands, AutoCorrect and synonym lists. */
export function AliasEditDialog({
  open,
  text,
  store,
  searchStore,
  onSaved,
  onClose,
}: {
  open: boolean;
  text: AliasEditMessages;
  store: PgpStore;
  searchStore: InputSearchStore;
  /** Reports problems after saving (a file that could not be written). */
  onSaved: (messages: readonly string[]) => void;
  onClose: () => void;
}) {
  const fresh = (): Draft => ({
    aliases: store.file('aliases')?.text ?? '',
    removed: store.removed,
    synonyms: store.file('synonyms')?.text ?? '',
    corrections: searchStore.autoCorrect.toPgp(),
  });
  const [tab, setTab] = useState<Tab>('aliases');
  const [draft, setDraft] = useState<Draft>(fresh);
  const [revision, setRevision] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const inputKind = useRef<PgpKind>('aliases');
  useEffect(() => {
    if (open) setDraft(fresh());
  }, [open, revision]);
  useEffect(() => store.subscribe(() => setRevision((value) => value + 1)), [store]);
  const preview = useMemo(() => {
    const registry = new CommandRegistry();
    registry.reloadPgp(draft.aliases, draft.removed);
    return registry;
  }, [draft.aliases, draft.removed]);
  const change = (patch: Partial<Draft>) => setDraft((value) => ({ ...value, ...patch }));
  const validate = (alias: string, command: string): string | undefined =>
    !aliasPattern.test(alias)
      ? text.invalidAlias
      : !commandPattern.test(command.trim())
        ? text.unknownCommand(command.trim())
        : undefined;
  async function save(): Promise<void> {
    const original = fresh();
    const problems: string[] = [];
    if (draft.aliases !== original.aliases || draft.removed.join() !== original.removed.join())
      if ((await store.save('aliases', draft.aliases, draft.removed)) === 'denied')
        problems.push(text.writeDenied(store.file('aliases')?.name ?? 'acad.pgp'));
    if (draft.synonyms !== original.synonyms)
      if ((await store.save('synonyms', draft.synonyms)) === 'denied')
        problems.push(text.writeDenied(store.file('synonyms')?.name ?? 'synonyms.pgp'));
    if (draft.corrections !== original.corrections)
      searchStore.replaceCorrections(draft.corrections);
    onSaved(problems);
  }
  const kind: PgpKind = tab === 'synonyms' ? 'synonyms' : 'aliases';
  const file = store.file(kind);
  const tabs: readonly [Tab, string][] = [
    ['aliases', text.aliasesTab],
    ['external', text.externalTab],
    ['corrections', text.correctionsTab],
    ['synonyms', text.synonymsTab],
  ];
  return (
    <ModalDialog
      open={open}
      title={text.title}
      className="alias-edit-dialog"
      onClose={onClose}
      footer={
        <>
          <button onClick={() => void save().then(onClose)}>{text.ok}</button>
          <button onClick={onClose}>{text.cancel}</button>
          <button onClick={() => void save()}>{text.apply}</button>
        </>
      }
    >
      <div role="tablist" className="dialog-tabs">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab !== 'corrections' && (
        <div className="pgp-file-bar">
          <span>
            {file
              ? store.linked(kind)
                ? text.linked(file.name)
                : text.copied(file.name)
              : text.noFile}
          </span>
          <button
            onClick={() => {
              inputKind.current = kind;
              if (store.canPick) void store.pick(kind);
              else input.current?.click();
            }}
          >
            {text.chooseFile}
          </button>
          <button disabled={!file} onClick={() => void store.reload(kind)}>
            {text.reloadFile}
          </button>
          <button
            onClick={() =>
              download(
                file?.name ?? (kind === 'aliases' ? 'acad.pgp' : 'synonyms.pgp'),
                kind === 'aliases' ? draft.aliases : draft.synonyms,
              )
            }
          >
            {text.exportFile}
          </button>
          <button disabled={!file} onClick={() => store.clear(kind)}>
            {text.clearFile}
          </button>
          <input
            ref={input}
            type="file"
            accept=".pgp,text/plain"
            hidden
            data-testid="pgp-file-input"
            onChange={(event) => {
              const chosen = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (chosen) void store.load(inputKind.current, chosen);
            }}
          />
        </div>
      )}
      {tab === 'aliases' && (
        <PairTable
          text={text}
          keyLabel={text.alias}
          valueLabel={text.command}
          sourceLabel={text.source}
          rows={preview.aliasEntries().map((entry) => ({
            key: entry.alias,
            value: entry.command,
            source: entry.source === 'user' ? text.user : text.builtin,
          }))}
          onSet={(alias, command) => {
            const failure = validate(alias, command);
            if (!failure)
              change({
                aliases: setPgpAlias(draft.aliases, alias, command.trim()),
                removed: draft.removed.filter((item) => item !== alias.toUpperCase()),
              });
            return failure;
          }}
          onRemove={(alias) =>
            change({
              aliases: removePgpAlias(draft.aliases, alias),
              removed:
                preview.isBuiltinAlias(alias) && !draft.removed.includes(alias)
                  ? [...draft.removed, alias]
                  : draft.removed,
            })
          }
        />
      )}
      {tab === 'external' && (
        <PairTable
          text={text}
          keyLabel={text.command}
          valueLabel={text.externalLine}
          rows={preview.externalCommands.map((item) => ({
            key: item.name,
            value: `${item.executable}, ${item.flags}, ${item.allowSpaces ? '*' : ''}${item.prompt}`,
          }))}
          onSet={(name, line) => {
            // The prompt keeps its trailing space ("File to edit: ,"); only a final comma is added.
            const entry = /,\s*$/.test(line) ? line : `${line},`;
            const parsed = parsePgp(`${name},${entry}`).externals[0];
            if (!parsed) return `${text.invalidExternal} (${text.externalHint})`;
            change({ aliases: setPgpExternal(draft.aliases, parsed) });
            return undefined;
          }}
          onRemove={(name) => change({ aliases: removePgpExternal(draft.aliases, name) })}
        />
      )}
      {tab === 'corrections' && (
        <PairTable
          text={text}
          keyLabel={text.mistyped}
          valueLabel={text.command}
          rows={new AutoCorrectMemory({ pgp: draft.corrections }).entries.map((entry) => ({
            key: entry.alias,
            value: entry.command,
          }))}
          onSet={(mistyped, command) => {
            const failure = validate(mistyped, command);
            if (!failure)
              change({ corrections: setPgpAlias(draft.corrections, mistyped, command.trim()) });
            return failure;
          }}
          onRemove={(mistyped) =>
            change({ corrections: removePgpAlias(draft.corrections, mistyped) })
          }
        />
      )}
      {tab === 'synonyms' && (
        <PairTable
          text={text}
          keyLabel={text.synonym}
          valueLabel={text.command}
          rows={parsePgp(draft.synonyms).aliases.map((entry) => ({
            key: entry.alias,
            value: entry.command,
          }))}
          onSet={(synonym, command) => {
            const failure = validate(synonym, command);
            if (!failure)
              change({ synonyms: setPgpAlias(draft.synonyms, synonym, command.trim()) });
            return failure;
          }}
          onRemove={(synonym) => change({ synonyms: removePgpAlias(draft.synonyms, synonym) })}
        />
      )}
    </ModalDialog>
  );
}
