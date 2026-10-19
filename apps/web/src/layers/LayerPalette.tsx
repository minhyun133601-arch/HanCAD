import { useState } from 'react';
import type { CadLayer } from '@hancad/legacy-bridge';
import type { LayerField } from './layer-model';
import { layerFilterMatches } from './layer-filters';
import { LayerPaletteSettings } from './LayerPaletteSettings';
import type { LayerPaletteProps } from './layer-palette-types';
import './layers.css';

const columns: readonly [keyof CadLayer | 'status', string, string][] = [
  ['status', '상태', 'Status'],
  ['name', '이름', 'Name'],
  ['visible', '켜기', 'On'],
  ['frozen', '동결', 'Freeze'],
  ['locked', '잠금', 'Lock'],
  ['plot', '플롯', 'Plot'],
  ['aci', '색상', 'Color'],
  ['linetype', '선종류', 'Linetype'],
  ['lineweight', '선가중치', 'Lineweight'],
  ['transparency', '투명도', 'Transparency'],
  ['newViewportFrozen', '새 VP 동결', 'New VP Freeze'],
  ['description', '설명', 'Description'],
];
const flags: readonly LayerField[] = ['visible', 'frozen', 'locked', 'plot', 'newViewportFrozen'];
export function LayerPalette(props: LayerPaletteProps) {
  const { state, metadata, korean: ko } = props;
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [invert, setInvert] = useState(false);
  const [sort, setSort] = useState<{ key: (typeof columns)[number][0]; reverse: boolean }>({
    key: 'name',
    reverse: false,
  });
  const [selected, setSelected] = useState<string[]>([]),
    [rename, setRename] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'layers' | 'filters' | 'states'>(props.initialTab ?? 'layers');
  const text = (a: string, b: string): string => (ko ? a : b);
  const attempt = (action: () => void): void => {
    try {
      action();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const activeFilter = metadata.filters.find((item) => item.name === filter);
  const rows = state.layers
    .filter((layer) => {
      const matches =
        filter === '$unreconciled'
          ? !!layer.unreconciled
          : activeFilter
            ? layerFilterMatches(layer, activeFilter)
            : true;
      return (
        (invert ? !matches : matches) &&
        layer.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      );
    })
    .sort((a, b) => {
      const field = sort.key === 'status' ? 'name' : sort.key;
      const av = a[field] ?? '',
        bv = b[field] ?? '';
      const order =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'ko', { numeric: true });
      return sort.reverse ? -order : order;
    });
  function choose(name: string, additive: boolean): void {
    const next = additive
      ? selected.includes(name)
        ? selected.filter((item) => item !== name)
        : [...selected, name]
      : [name];
    setSelected(next);
    if (props.walk) props.preview(next);
  }
  return (
    <aside
      className="layer-palette"
      data-testid="layer-palette"
      aria-label={text(
        props.walk ? '도면층 탐색' : '도면층 특성 관리자',
        props.walk ? 'Layer Walk' : 'Layer Properties Manager',
      )}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') props.close();
        if (event.key === 'F2' && selected[0]) {
          event.preventDefault();
          setRename(selected[0]);
        }
      }}
    >
      <header>
        <strong>
          {text(
            props.walk ? '도면층 탐색' : '도면층 특성 관리자',
            props.walk ? 'Layer Walk' : 'Layer Properties Manager',
          )}
        </strong>
        <button aria-label={text('닫기', 'Close')} onClick={props.close}>
          ×
        </button>
      </header>
      <nav>
        {(['layers', 'filters', 'states'] as const).map((item, index) => (
          <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>
            {ko
              ? ['도면층', '필터', '도면층 상태'][index]
              : ['Layers', 'Filters', 'Layer States'][index]}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {tab === 'layers' && (
        <>
          <div className="layer-toolbar">
            <input
              aria-label={text('도면층 검색', 'Search layers')}
              placeholder={text('도면층 검색', 'Search layers')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              aria-label={text('도면층 필터', 'Layer filter')}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="">{text('모든 도면층', 'All')}</option>
              {state.layers.some((layer) => layer.unreconciled) && (
                <option value="$unreconciled">
                  {text('조정되지 않은 새 도면층', 'Unreconciled New Layers')}
                </option>
              )}
              {metadata.filters.map((entry) => (
                <option key={entry.name}>{entry.name}</option>
              ))}
            </select>
            <label>
              <input
                type="checkbox"
                checked={invert}
                onChange={(event) => setInvert(event.target.checked)}
              />
              {text('필터 반전', 'Invert filter')}
            </label>
          </div>
          <div className="layer-toolbar">
            <input
              aria-label={text('새 도면층 이름', 'New layer name')}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={text('새 도면층 이름', 'New layer name')}
            />
            <button
              onClick={() =>
                attempt(() => {
                  props.create(newName || `Layer${state.layers.length}`);
                  setNewName('');
                })
              }
            >
              {text('새 도면층', 'New Layer')}
            </button>
            <button
              disabled={!selected.length}
              onClick={() => attempt(() => props.remove(selected))}
            >
              {text('삭제', 'Delete')}
            </button>
            <button
              disabled={!selected[0]}
              onClick={() => attempt(() => props.current(selected[0]!))}
            >
              {text('현재로 설정', 'Set Current')}
            </button>
            <button
              disabled={!selected.length}
              onClick={() => attempt(() => props.reconcile(selected))}
            >
              {text('조정', 'Reconcile')}
            </button>
          </div>
          <div className="layer-grid">
            <table>
              <thead>
                <tr>
                  {columns.map(([key, korean, english]) => (
                    <th key={key}>
                      <button
                        onClick={() =>
                          setSort({ key, reverse: sort.key === key ? !sort.reverse : false })
                        }
                      >
                        {ko ? korean : english}
                        {sort.key === key ? (sort.reverse ? ' ▾' : ' ▴') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((layer) => (
                  <tr
                    key={layer.name}
                    data-layer={layer.name}
                    aria-selected={selected.includes(layer.name)}
                    onClick={(event) => choose(layer.name, event.ctrlKey || event.shiftKey)}
                    onDoubleClick={() => attempt(() => props.current(layer.name))}
                  >
                    {columns.map(([field, korean, english]) => {
                      const label = `${layer.name} ${ko ? korean : english}`;
                      if (field === 'status')
                        return (
                          <td key={field}>
                            {state.settings.layer === layer.name
                              ? '✓'
                              : state.entities.some((entity) => entity.layer === layer.name)
                                ? '◆'
                                : '◇'}
                          </td>
                        );
                      if (field === 'name' && rename !== layer.name)
                        return (
                          <td key={field}>
                            <button
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                setRename(layer.name);
                              }}
                            >
                              {layer.name}
                            </button>
                          </td>
                        );
                      if (flags.includes(field as LayerField)) {
                        const value = layer[field] ?? field === 'plot';
                        return (
                          <td key={field}>
                            <button
                              aria-label={label}
                              aria-pressed={!!value}
                              onClick={(event) => {
                                event.stopPropagation();
                                attempt(() => props.toggle(layer.name, field as LayerField));
                              }}
                            >
                              {field === 'visible'
                                ? value
                                  ? '●'
                                  : '○'
                                : field === 'frozen' || field === 'newViewportFrozen'
                                  ? value
                                    ? '❄'
                                    : '☀'
                                  : field === 'locked'
                                    ? value
                                      ? '▣'
                                      : '□'
                                    : value
                                      ? '✓'
                                      : '×'}
                            </button>
                          </td>
                        );
                      }
                      const display =
                        field === 'aci'
                          ? layer.trueColor !== undefined
                            ? `#${layer.trueColor.toString(16).padStart(6, '0')}`
                            : String(layer.aci ?? 7)
                          : field === 'lineweight'
                            ? layer.lineweight === -3 || layer.lineweight === undefined
                              ? 'Default'
                              : String(layer.lineweight / 100)
                            : String(
                                layer[field] ??
                                  (field === 'linetype'
                                    ? 'CONTINUOUS'
                                    : field === 'transparency'
                                      ? 0
                                      : ''),
                              );
                      return (
                        <td key={field}>
                          <input
                            aria-label={label}
                            key={`${layer.name}-${field}-${display}`}
                            defaultValue={display}
                            autoFocus={field === 'name'}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={(event) => {
                              if (event.target.value !== display)
                                attempt(() => props.edit(layer.name, field, event.target.value));
                              if (field === 'name') setRename('');
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.currentTarget.blur();
                                event.preventDefault();
                              }
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer>
            {text(
              `현재 도면층: ${state.settings.layer} · ${rows.length}/${state.layers.length}개 도면층`,
              `Current layer: ${state.settings.layer} · ${rows.length}/${state.layers.length} layers`,
            )}
          </footer>
        </>
      )}
      <LayerPaletteSettings {...props} tab={tab} selected={selected} attempt={attempt} />
    </aside>
  );
}
