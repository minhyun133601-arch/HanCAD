import { useEffect, useRef, useState } from 'react';
import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { SystemVariables } from '@hancad/sysvars';
import './selection-dialogs.css';

const checks = [
  ['PICKFIRST', 0, '명사/동사 선택', 'Noun/verb selection'],
  ['PICKADD', -1, 'Shift 키를 사용하여 선택에 추가', 'Use Shift to add to selection'],
  ['PICKAUTO', 1, '내재된 윈도우', 'Implied windowing'],
  ['PICKAUTO', 4, '올가미에 대해 누른 채 끌기 허용', 'Allow press and drag for lasso'],
  ['PICKSTYLE', 1, '객체 그룹화', 'Object grouping'],
  ['SELECTIONPREVIEW', 1, '활성 명령이 없는 경우', 'When no command is active'],
  ['SELECTIONPREVIEW', 2, '활성 명령이 있는 경우', 'When a command is active'],
  ['SELECTIONEFFECT', 0, '선택 효과 표시', 'Show selection effect'],
  ['SELECTIONAREA', 0, '선택 영역 표시', 'Show selection area'],
  ['GRIPS', 0, '그립 표시', 'Show grips'],
  ['GRIPBLOCK', 0, '블록 내 그립 표시', 'Show grips within blocks'],
  ['GRIPTIPS', 0, '그립 팁 표시', 'Show grip tips'],
  ['GRIPMULTIFUNCTIONAL', 2, '동적 그립 메뉴 표시', 'Show dynamic grip menu'],
  ['GRIPMULTIFUNCTIONAL', 1, 'Ctrl+순환 동작 허용', 'Allow Ctrl cycling behavior'],
  ['GROUPDISPLAYMODE', -2, '그룹에 단일 그립 표시', 'Show a single grip on groups'],
  ['GROUPDISPLAYMODE', -3, '그룹에 경계 상자 표시', 'Show bounding box on groups'],
] as const;
const numbers = [
  ['PICKBOX', '확인란 크기', 'Pickbox size'],
  ['PICKDRAG', '선택 윈도우 끌기 방식', 'Selection dragging mode'],
  ['GRIPSIZE', '그립 크기', 'Grip size'],
  ['GRIPOBJLIMIT', '그립 표시할 객체 선택 제한', 'Object selection limit for grips'],
  ['GRIPCOLOR', '선택하지 않은 그립 색상', 'Unselected grip color'],
  ['GRIPHOT', '선택한 그립 색상', 'Selected grip color'],
  ['GRIPHOVER', '그립 위에 마우스를 놓을 때의 색상', 'Hover grip color'],
  ['GRIPCONTOUR', '그립 윤곽선 색상', 'Grip contour color'],
  ['SELECTIONAREAOPACITY', '선택 영역 불투명도', 'Selection area opacity'],
  ['WINDOWAREACOLOR', '윈도우 선택 영역 색상', 'Window selection color'],
  ['CROSSINGAREACOLOR', '걸침 선택 영역 색상', 'Crossing selection color'],
] as const;
const variables = [...new Set([...checks.map(([name]) => name), ...numbers.map(([name]) => name)])];
export function SelectionSettingsDialog({
  open,
  close,
  sysvars,
  korean: ko,
}: {
  open: boolean;
  close: () => void;
  sysvars: SystemVariables;
  korean: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setDraft(Object.fromEntries(variables.map((name) => [name, sysvars.getNumber(name)])));
      setError('');
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open, sysvars]);
  function checked(name: string, bit: number): boolean {
    const value = draft[name] ?? 0;
    return bit === -1
      ? value === 0
      : bit === -2
        ? value > 0
        : bit === -3
          ? value === 2
          : bit
            ? (value & bit) !== 0
            : value !== 0;
  }
  function change(name: string, bit: number, enabled: boolean): void {
    setDraft((old) => {
      const value = old[name] ?? 0;
      const next =
        bit === -1
          ? enabled
            ? 0
            : 2
          : bit === -2
            ? enabled
              ? 1
              : 0
            : bit === -3
              ? enabled
                ? 2
                : 1
              : bit
                ? enabled
                  ? value | bit
                  : value & ~bit
                : enabled
                  ? 1
                  : 0;
      return { ...old, [name]: next };
    });
  }
  const label = (k: string, e: string) => (ko ? k : e);
  return (
    <dialog
      ref={dialog}
      className="selection-dialog"
      aria-labelledby="selection-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            for (const [name, value] of Object.entries(draft))
              validateSystemVariable(getSystemVariableDefinition(name)!, value);
            const drawing = Object.entries(draft).filter(
              ([name, value]) =>
                getSystemVariableDefinition(name)?.scope === 'drawing' &&
                sysvars.getNumber(name) !== value,
            );
            if (drawing.length)
              sysvars.database.transaction('DDGRIPS', (tx) => {
                for (const [name, value] of drawing) tx.setVariable(name, value);
              });
            for (const [name, value] of Object.entries(draft))
              if (
                getSystemVariableDefinition(name)?.scope !== 'drawing' &&
                sysvars.getNumber(name) !== value
              )
                sysvars.set(name, value);
            close();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
          }
        }}
      >
        <h2 id="selection-settings-title">{label('옵션 — 선택', 'Options — Selection')}</h2>
        <fieldset>
          <legend>{label('선택 모드 및 그립', 'Selection Modes and Grips')}</legend>
          {checks.map(([name, bit, k, e]) => (
            <label key={`${name}-${bit}`}>
              <input
                type="checkbox"
                checked={checked(name, bit)}
                onChange={(event) => change(name, bit, event.target.checked)}
              />
              {label(k, e)}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{label('크기 및 색상', 'Sizes and Colors')}</legend>
          {numbers.map(([name, k, e]) => {
            const definition = getSystemVariableDefinition(name);
            return (
              <label key={name}>
                {label(k, e)}
                <input
                  type="number"
                  aria-label={label(k, e)}
                  value={draft[name] ?? 0}
                  min={definition?.min}
                  max={definition?.max}
                  step={1}
                  onChange={(event) =>
                    setDraft((old) => ({ ...old, [name]: Number(event.target.value) }))
                  }
                />
              </label>
            );
          })}
        </fieldset>
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
