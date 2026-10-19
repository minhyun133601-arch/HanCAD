import { useEffect, useRef, useState } from 'react';
import type { CommandRegistry } from '@hancad/commands';
import type { SystemVariables } from '@hancad/sysvars';
import type { CadMlineStyle, LegacyCadState } from '@hancad/legacy-bridge';
import './selection-dialogs.css';

interface Props {
  registry: CommandRegistry;
  sysvars: SystemVariables;
  getState: () => LegacyCadState;
  commitState: (label: string, state: LegacyCadState) => void;
  korean: boolean;
  focus: () => void;
}
const standard: CadMlineStyle = { name: 'Standard', description: '', offsets: [0.5, -0.5] };
const modes = [0, 1, 2, 3, 4, 32, 33, 34, 35, 36, 64, 65, 66, 67, 68, 96, 97, 98, 99, 100];

export function DrawingStyleDialogs(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [open, setOpen] = useState<'point' | 'mline' | null>(null);
  const [mode, setMode] = useState(0),
    [size, setSize] = useState('5'),
    [relative, setRelative] = useState(true);
  const [styles, setStyles] = useState<CadMlineStyle[]>([standard]),
    [name, setName] = useState('Standard'),
    [description, setDescription] = useState(''),
    [offsets, setOffsets] = useState('0.5, -0.5');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null),
    ko = props.korean;
  const label = (k: string, e: string) => (ko ? k : e);
  function choose(style: CadMlineStyle): void {
    setName(style.name);
    setDescription(style.description);
    setOffsets(style.offsets.join(', '));
  }
  useEffect(() => {
    const point = () => {
      const vars = latest.current.sysvars,
        current = vars.getNumber('PDSIZE');
      setMode(vars.getNumber('PDMODE'));
      setSize(String(Math.abs(current) || 5));
      setRelative(current <= 0);
      setError('');
      setOpen('point');
    };
    for (const name of ['PTYPE', 'DDPTYPE'])
      props.registry.register({
        name,
        displayName: { 'ko-KR': '점 스타일', 'en-US': 'Point Style' },
        description: {
          'ko-KR': '점 표시 스타일과 크기를 설정합니다.',
          'en-US': 'Sets point display style and size.',
        },
        execute: point,
      });
    props.registry.register({
      name: 'MLSTYLE',
      displayName: { 'ko-KR': '여러 줄 스타일', 'en-US': 'Multiline Style' },
      description: {
        'ko-KR': '여러 줄의 기본 스타일을 관리합니다.',
        'en-US': 'Manages basic multiline styles.',
      },
      execute: () => {
        const source = latest.current.getState().mlineStyles ?? [],
          available = source.some((s) => s.name.toUpperCase() === 'STANDARD')
            ? source
            : [standard, ...source];
        setStyles(available);
        choose(
          available.find(
            (s) =>
              s.name.toUpperCase() === String(latest.current.sysvars.get('CMLSTYLE')).toUpperCase(),
          ) ?? standard,
        );
        setError('');
        setOpen('mline');
      },
    });
  }, [props.registry]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  function close(): void {
    setOpen(null);
    props.focus();
  }
  function apply(): void {
    const database = props.sysvars.database,
      own = !database.undoGroupActive;
    if (open === 'point') {
      const n = Number(size);
      if (!Number.isFinite(n) || n < 0 || (relative && n > 100)) {
        setError(label('올바른 점 크기를 입력하십시오.', 'Enter a valid point size.'));
        return;
      }
      if (own) database.beginUndoGroup();
      try {
        props.sysvars.set('PDMODE', mode);
        props.sysvars.set('PDSIZE', relative ? -n : n);
      } finally {
        if (own && database.undoGroupActive) database.endUndoGroup();
      }
    } else {
      const numbers = offsets.split(',').map((n) => Number(n.trim()));
      if (
        !name.trim() ||
        /[<>\/\\":;?*|=,`]/.test(name) ||
        !offsets.trim() ||
        numbers.length > 16 ||
        numbers.some((n) => !Number.isFinite(n))
      ) {
        setError(
          label(
            '스타일 이름과 숫자로 된 간격띄우기 값을 입력하십시오.',
            'Enter a valid style name and numeric offsets.',
          ),
        );
        return;
      }
      const updated = { name: name.trim(), description, offsets: numbers };
      if (own) database.beginUndoGroup();
      try {
        props.commitState('MLSTYLE', {
          ...props.getState(),
          mlineStyles: [
            ...styles.filter((s) => s.name.toUpperCase() !== updated.name.toUpperCase()),
            updated,
          ],
        });
        props.sysvars.set('CMLSTYLE', updated.name);
      } finally {
        if (own && database.undoGroupActive) database.endUndoGroup();
      }
    }
    close();
  }
  return (
    <dialog
      ref={dialog}
      className="selection-dialog drawing-style-dialog"
      aria-labelledby="drawing-style-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <h2 id="drawing-style-title">
          {open === 'point'
            ? label('점 스타일', 'Point Style')
            : label('여러 줄 스타일', 'Multiline Style')}
        </h2>
        {open === 'point' ? (
          <>
            <div
              className="point-style-grid"
              role="group"
              aria-label={label('점 스타일 선택', 'Choose point style')}
            >
              {modes.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-label={`PDMODE ${value}`}
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                >
                  <svg
                    width="36"
                    height="36"
                    viewBox="-18 -18 36 36"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    {(value & 32) !== 0 && <circle r="11" />}
                    {(value & 64) !== 0 && <rect x="-11" y="-11" width="22" height="22" />}
                    {value % 32 === 0 && <circle r="1" fill="currentColor" />}
                    {value % 32 === 2 && <path d="M-8 0H8 M0-8V8" />}
                    {value % 32 === 3 && <path d="M-7-7L7 7 M-7 7L7-7" />}
                    {value % 32 === 4 && <path d="M0 0V-8" />}
                  </svg>
                </button>
              ))}
            </div>
            <label>
              {label('점 크기', 'Point size')}
              <input
                type="number"
                min="0"
                step="any"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </label>
            <label>
              <input
                type="radio"
                name="point-size-mode"
                checked={relative}
                onChange={() => setRelative(true)}
              />
              {label('화면에 상대적인 크기 설정', 'Set size relative to screen')}
            </label>
            <label>
              <input
                type="radio"
                name="point-size-mode"
                checked={!relative}
                onChange={() => setRelative(false)}
              />
              {label('절대 단위 크기 설정', 'Set size in absolute units')}
            </label>
          </>
        ) : (
          <>
            <label>
              {label('스타일', 'Styles')}
              <select
                value={styles.some((s) => s.name === name) ? name : ''}
                onChange={(e) => {
                  const style = styles.find((s) => s.name === e.target.value);
                  if (style) choose(style);
                }}
              >
                {styles.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
                <option value="">{label('새 스타일', 'New style')}</option>
              </select>
            </label>
            <label>
              {label('이름', 'Name')}
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
            </label>
            <label>
              {label('설명', 'Description')}
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label>
              {label('요소 간격띄우기 (쉼표로 구분)', 'Element offsets (comma separated)')}
              <input value={offsets} onChange={(e) => setOffsets(e.target.value)} />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="submit">{label('확인', 'OK')}</button>
          <button type="button" onClick={close}>
            {label('취소', 'Cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
