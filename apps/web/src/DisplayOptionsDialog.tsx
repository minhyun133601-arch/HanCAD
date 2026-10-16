import { useEffect, useRef, useState } from 'react';

export function DisplayOptionsDialog({
  open,
  korean,
  background,
  apply,
  close,
}: {
  open: boolean;
  korean: boolean;
  background: string;
  apply: (value: string) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [color, setColor] = useState(background);
  useEffect(() => {
    if (open) {
      setColor(background);
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="dimension-style-dialog"
      aria-labelledby="display-options-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(color);
          close();
        }}
      >
        <h2 id="display-options-title">{korean ? '옵션 — 화면 표시' : 'Options — Display'}</h2>
        <p>
          {korean
            ? '2D 모형 공간의 배경 색상을 설정합니다.'
            : 'Set the background color for 2D model space.'}
        </p>
        <label>
          {korean ? '균일한 배경' : 'Uniform background'}{' '}
          <input
            type="color"
            aria-label={korean ? '모형 배경 색상' : 'Model background color'}
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>
        <div className="dimension-dialog-actions">
          <button type="button" onClick={() => setColor('#212830')}>
            {korean ? '기본값 복원' : 'Restore default'}
          </button>
          <button type="button" onClick={() => setColor('#000000')}>
            {korean ? '검정' : 'Black'}
          </button>
          <button type="button" onClick={close}>
            {korean ? '취소' : 'Cancel'}
          </button>
          <button type="submit">{korean ? '확인' : 'OK'}</button>
        </div>
      </form>
    </dialog>
  );
}
