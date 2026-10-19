import { useRef, useState } from 'react';
import type { LayerPaletteProps } from './layer-palette-types';
import { layerRestoreProperties } from './layer-states';
import type { LayerRestoreProperty } from './layer-states';
export function LayerPaletteSettings(
  props: LayerPaletteProps & {
    tab: string;
    selected: readonly string[];
    attempt: (action: () => void) => void;
  },
) {
  const { metadata, tab, selected, attempt } = props;
  const text = (ko: string, en: string): string => (props.korean ? ko : en);
  const [filterName, setFilterName] = useState('');
  const [expression, setExpression] = useState('name=*');
  const [savedName, setSavedName] = useState('');
  const [properties, setProperties] = useState<LayerRestoreProperty[]>([...layerRestoreProperties]);
  const importInput = useRef<HTMLInputElement>(null);
  return (
    <>
      {tab === 'filters' && (
        <section className="layer-settings">
          <label>
            {text('필터 이름', 'Filter name')}
            <input value={filterName} onChange={(event) => setFilterName(event.target.value)} />
          </label>
          <label>
            {text('특성 필터 표현식', 'Property filter expression')}
            <input value={expression} onChange={(event) => setExpression(event.target.value)} />
          </label>
          <small>name=A* AND color=1 OR frozen=true</small>
          <button
            onClick={() =>
              attempt(() => {
                if (!filterName.trim())
                  throw new Error(text('필터 이름을 입력하십시오.', 'Enter filter name.'));
                props.filter({ name: filterName, expression });
              })
            }
          >
            {text('특성 필터 저장', 'Save Property Filter')}
          </button>
          <button
            disabled={!selected.length}
            onClick={() =>
              attempt(() => {
                if (!filterName.trim())
                  throw new Error(text('필터 이름을 입력하십시오.', 'Enter filter name.'));
                props.filter({ name: filterName, names: [...selected] });
              })
            }
          >
            {text('선택 도면층으로 그룹 필터 저장', 'Save Group Filter from Selected Layers')}
          </button>
          <ul>
            {metadata.filters.map((entry) => (
              <li key={entry.name}>
                <button
                  onClick={() => {
                    setFilterName(entry.name);
                    setExpression(entry.expression ?? '');
                  }}
                >
                  {entry.name}
                </button>{' '}
                {entry.expression ?? entry.names?.join(', ')}
              </li>
            ))}
          </ul>
        </section>
      )}
      {tab === 'states' && (
        <section className="layer-settings">
          <label>
            {text('도면층 상태 이름', 'Layer state name')}
            <input value={savedName} onChange={(event) => setSavedName(event.target.value)} />
          </label>
          <button
            onClick={() =>
              attempt(() => {
                if (!savedName.trim())
                  throw new Error(text('상태 이름을 입력하십시오.', 'Enter state name.'));
                props.saveState(savedName, properties);
              })
            }
          >
            {text('새로 만들기 / 저장', 'New / Save')}
          </button>
          <button onClick={() => importInput.current?.click()}>
            {text('가져오기 (.las)', 'Import (.las)')}
          </button>
          <input
            hidden
            type="file"
            accept=".las"
            ref={importInput}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) props.importState(file);
              event.target.value = '';
            }}
          />
          <fieldset>
            <legend>{text('복원할 도면층 특성', 'Layer Properties to Restore')}</legend>
            {layerRestoreProperties.map((key, index) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={properties.includes(key)}
                  onChange={(event) =>
                    setProperties(
                      event.target.checked
                        ? [...properties, key]
                        : properties.filter((item) => item !== key),
                    )
                  }
                />
                {props.korean
                  ? [
                      '켜기/끄기',
                      '동결/동결해제',
                      '잠금/잠금해제',
                      '플롯',
                      '새 VP 동결',
                      '색상',
                      '선종류',
                      '선가중치',
                      '투명도',
                      '설명',
                    ][index]
                  : key}
              </label>
            ))}
          </fieldset>
          {metadata.states.map((saved) => (
            <div className="layer-state-row" key={saved.name}>
              <strong>{saved.name}</strong>
              <span>{saved.description}</span>
              <button onClick={() => attempt(() => props.restoreState({ ...saved, properties }))}>
                {text('복원', 'Restore')}
              </button>
              <button onClick={() => props.exportState(saved.name)}>
                {text('내보내기', 'Export')}
              </button>
              <button onClick={() => props.deleteState(saved.name)}>
                {text('삭제', 'Delete')}
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
