import { useEffect, useRef, useState } from 'react';
import type { CommandRegistry } from '@hancad/commands';
import type { Locale } from '@hancad/ui';
import './command-help.css';

export function CommandHelpPanel({
  registry,
  topic,
  locale,
  select,
  close,
}: {
  registry: CommandRegistry;
  topic: string | null;
  locale: Locale;
  select: (topic: string) => void;
  close: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [query, setQuery] = useState('');
  const korean = locale === 'ko-KR';
  const command = topic ? registry.get(topic) : undefined;
  useEffect(() => {
    if (topic) panel.current?.focus({ preventScroll: true });
  }, [topic]);
  if (!topic) return null;
  const matches = query.trim()
    ? registry.all
        .filter((item) =>
          `${item.name} ${item.displayName[locale]} ${item.description[locale]}`
            .toLocaleUpperCase(locale)
            .includes(query.trim().toLocaleUpperCase(locale)),
        )
        .slice(0, 40)
    : [];
  const aliases = registry.aliasesFor(topic);
  const flags = command?.flags;
  const labels = korean
    ? {
        transparent: '투명 명령',
        modal: '모달 명령',
        pickfirst: '사전 선택 사용',
        noUndo: '도면 실행 취소에 기록하지 않음',
      }
    : {
        transparent: 'Transparent command',
        modal: 'Modal command',
        pickfirst: 'Uses preselection',
        noUndo: 'No drawing undo record',
      };
  return (
    <aside
      ref={panel}
      className="command-help-panel"
      role="complementary"
      aria-label={korean ? '명령 도움말' : 'Command help'}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (event.key === 'F1') {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <header>
        <strong>{korean ? '명령 도움말' : 'Command help'}</strong>
        <button onClick={close} aria-label={korean ? '도움말 닫기' : 'Close help'}>
          ×
        </button>
      </header>
      <input
        type="search"
        aria-label={korean ? '명령 도움말 검색' : 'Search command help'}
        placeholder={korean ? '명령 또는 한국어 검색' : 'Search commands'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim() && (
        <ul
          className="command-help-results"
          aria-label={korean ? '도움말 검색 결과' : 'Help search results'}
        >
          {matches.map((item) => (
            <li key={item.name}>
              <button
                onClick={() => {
                  select(item.name);
                  setQuery('');
                }}
              >
                {item.name} · {item.displayName[locale]}
              </button>
            </li>
          ))}
          {!matches.length && <li>{korean ? '검색 결과가 없습니다.' : 'No results.'}</li>}
        </ul>
      )}
      <h2>
        {topic}
        {command ? ` · ${command.displayName[locale]}` : ''}
      </h2>
      <p>{command?.description[locale]}</p>
      {aliases.length > 0 && (
        <p>
          <b>{korean ? '별칭: ' : 'Aliases: '}</b>
          {aliases.join(', ')}
        </p>
      )}
      {flags && (
        <ul>
          {(Object.keys(labels) as (keyof typeof labels)[])
            .filter((key) => flags[key])
            .map((key) => (
              <li key={key}>{labels[key]}</li>
            ))}
        </ul>
      )}
      {command && !command.execute && !command.systemVariable && (
        <p className="command-help-pending">
          {korean
            ? `이 명령은 아직 구현되지 않았습니다. 예정 단계: ${command.phase ?? '미정'}.`
            : `This command is not implemented yet. Planned phase: ${command.phase ?? 'unassigned'}.`}
        </p>
      )}
      <p className="command-help-tip">
        {korean
          ? 'F1: 현재 명령 도움말 · Esc: 도움말 닫기'
          : 'F1: current command help · Esc: close help'}
      </p>
    </aside>
  );
}
