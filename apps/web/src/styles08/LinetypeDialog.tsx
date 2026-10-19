import { useState } from 'react';
import type { DrawingDatabase } from '@hancad/db';
import type { SystemVariables } from '@hancad/sysvars';
import { builtinLinetypes } from '@hancad/render';
import type { LinetypeDefinition } from '@hancad/render';
import { deleteLinetype, loadedLinetypes, loadLinetypes } from './linetype-library';
import type { LinetypeLibrary } from './linetype-library';
import { StyleDialogFrame } from './StyleDialogFrame';

export function LinetypeDialog(props: {
  database: DrawingDatabase;
  sysvars: SystemVariables;
  library: LinetypeLibrary;
  korean: boolean;
  close(): void;
  initial?: string;
  onApply?: (value: string) => void;
}) {
  const label = (k: string, e: string) => (props.korean ? k : e);
  const [loaded, setLoaded] = useState(() => loadedLinetypes(props.database));
  const [selected, setSelected] = useState(props.initial ?? String(props.sysvars.get('CELTYPE')));
  const [source, setSource] = useState<readonly LinetypeDefinition[]>([
    ...builtinLinetypes().values(),
  ]);
  const [file, setFile] = useState('hancadiso.lin');
  const [loading, setLoading] = useState(false);
  const [toLoad, setToLoad] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const [globalScale, setGlobalScale] = useState(String(props.sysvars.get('LTSCALE')));
  const [objectScale, setObjectScale] = useState(String(props.sysvars.get('CELTSCALE')));
  function refresh(): void {
    setLoaded(loadedLinetypes(props.database));
  }
  function apply(): void {
    const global = Number(globalScale),
      object = Number(objectScale);
    if (!(global > 0) || !(object > 0) || !Number.isFinite(global) || !Number.isFinite(object)) {
      setError(label('축척 비율은 양수여야 합니다.', 'Scale factors must be positive.'));
      return;
    }
    const own = !props.database.undoGroupActive;
    if (own) props.database.beginUndoGroup();
    try {
      if (props.onApply) props.onApply(selected);
      else props.sysvars.set('CELTYPE', selected);
      props.sysvars.set('LTSCALE', global);
      props.sysvars.set('CELTSCALE', object);
    } finally {
      if (own && props.database.undoGroupActive) props.database.endUndoGroup();
    }
    props.close();
  }
  async function openFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      setSource(props.library.remember(file.name, new Uint8Array(await file.arrayBuffer())));
      setFile(file.name);
      setToLoad(new Set());
      setError('');
    } catch {
      setError(
        label('선종류 파일의 정의가 올바르지 않습니다.', 'Invalid linetype definitions in file.'),
      );
    }
  }
  return (
    <StyleDialogFrame
      title={label('선종류 관리자', 'Linetype Manager')}
      korean={props.korean}
      close={props.close}
      apply={loading ? undefined : apply}
    >
      {loading ? (
        <>
          <h3>{label('선종류 로드 또는 다시 로드', 'Load or Reload Linetypes')}</h3>
          <p>
            {label('파일', 'File')}: {file}
          </p>
          <label>
            {label('파일 선택', 'Choose file')}
            <input type="file" accept=".lin" onChange={(e) => void openFile(e.target.files?.[0])} />
          </label>
          <div className="style08-linetype-load-list">
            {source.map((definition) => (
              <label key={definition.name}>
                <input
                  type="checkbox"
                  checked={toLoad.has(definition.name)}
                  onChange={(e) =>
                    setToLoad((previous) => {
                      const next = new Set(previous);
                      if (e.target.checked) next.add(definition.name);
                      else next.delete(definition.name);
                      return next;
                    })
                  }
                />
                {definition.name} — {definition.description}
              </label>
            ))}
          </div>
          <div className="style08-row">
            <button type="button" onClick={() => setToLoad(new Set(source.map((d) => d.name)))}>
              {label('모두 선택', 'Select All')}
            </button>
            <button
              type="button"
              onClick={() => {
                loadLinetypes(
                  props.database,
                  source.filter((d) => toLoad.has(d.name)),
                );
                refresh();
                setLoading(false);
              }}
              disabled={!toLoad.size}
            >
              {label('로드', 'Load')}
            </button>
            <button type="button" onClick={() => setLoading(false)}>
              {label('뒤로', 'Back')}
            </button>
          </div>
          <p>
            {label(
              '복합 선종류의 문자와 쉐이프 정의는 보존됩니다. 표시는 이후 문자 단계에서 추가됩니다.',
              'Complex text and shape definitions are preserved; rendering arrives in the later text phase.',
            )}
          </p>
        </>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>{label('선종류', 'Linetype')}</th>
                <th>{label('모양', 'Appearance')}</th>
                <th>{label('설명', 'Description')}</th>
              </tr>
            </thead>
            <tbody>
              {loaded.map((definition) => (
                <tr key={definition.name} aria-selected={selected === definition.name}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelected(definition.name)}
                      aria-pressed={selected === definition.name}
                    >
                      {definition.name}
                    </button>
                  </td>
                  <td>
                    <svg width="120" height="20" aria-hidden="true">
                      <line
                        x1="0"
                        y1="10"
                        x2="120"
                        y2="10"
                        stroke="currentColor"
                        strokeDasharray={
                          definition.elements.some((e) => e.length < 0)
                            ? definition.elements
                                .map((e) => Math.max(0.5, Math.abs(e.length)))
                                .join(' ')
                            : undefined
                        }
                      />
                    </svg>
                  </td>
                  <td>{definition.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="style08-row">
            <button type="button" onClick={() => setLoading(true)}>
              {label('로드...', 'Load...')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!deleteLinetype(props.database, selected))
                  setError(
                    label(
                      '현재 선종류, 참조된 선종류 및 기본 선종류는 삭제할 수 없습니다.',
                      'Cannot delete current, referenced or reserved linetypes.',
                    ),
                  );
                else {
                  setSelected(String(props.sysvars.get('CELTYPE')));
                  refresh();
                }
              }}
            >
              {label('삭제', 'Delete')}
            </button>
          </div>
          <p>
            {label('현재 선종류', 'Current linetype')}: {selected}
          </p>
          <label>
            {label('전역 축척 비율', 'Global scale factor')}
            <input value={globalScale} onChange={(e) => setGlobalScale(e.target.value)} />
          </label>
          <label>
            {label('현재 객체 축척', 'Current object scale')}
            <input value={objectScale} onChange={(e) => setObjectScale(e.target.value)} />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </StyleDialogFrame>
  );
}
