import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function StyleDialogFrame(props: {
  title: string;
  korean: boolean;
  children: ReactNode;
  close(): void;
  apply?: (() => void) | undefined;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="selection-dialog style08-dialog"
      ref={dialog}
      aria-label={props.title}
      onCancel={(event) => {
        event.preventDefault();
        props.close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.apply?.();
        }}
      >
        <h2>{props.title}</h2>
        {props.children}
        <footer>
          {props.apply && (
            <button type="submit" disabled={props.disabled}>
              {props.korean ? '확인' : 'OK'}
            </button>
          )}
          <button type="button" onClick={props.close}>
            {props.korean ? '취소' : 'Cancel'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
