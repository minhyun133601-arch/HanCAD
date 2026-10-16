import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CommandLineMessages } from '@hancad/ui';
import type { HistoryLine } from '../useCommandSession';

/** A modal native dialog; Esc and the close callback share one path. */
export function ModalDialog({
  open,
  title,
  className,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={`command-dialog ${className ?? ''}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>{title}</header>
      <div className="dialog-body">{children}</div>
      <footer>{footer}</footer>
    </dialog>
  );
}

/** Ctrl+F2 / TEXTSCR: the complete command history of the current drawing. */
export function TextWindow({
  open,
  text,
  drawing,
  history,
  prompt,
  onCopy,
  onClose,
}: {
  open: boolean;
  text: CommandLineMessages;
  drawing: string;
  history: readonly HistoryLine[];
  prompt: string;
  onCopy: (value: string) => void;
  onClose: () => void;
}) {
  const content = [...history.map((line) => line.text), prompt].join('\n');
  const body = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (open && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [open, content]);
  return (
    <ModalDialog
      open={open}
      title={text.textWindowTitle(drawing)}
      className="text-window"
      onClose={onClose}
      footer={
        <>
          <button onClick={() => onCopy(content)}>{text.copyHistory}</button>
          <button onClick={onClose}>{text.close}</button>
        </>
      }
    >
      <pre ref={body} tabIndex={0} aria-label={text.textWindowTitle(drawing)}>
        {content}
      </pre>
    </ModalDialog>
  );
}

export function TransparencyDialog({
  open,
  text,
  value,
  onApply,
  onClose,
}: {
  open: boolean;
  text: CommandLineMessages;
  value: number;
  onApply: (value: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);
  return (
    <ModalDialog
      open={open}
      title={text.transparencyTitle}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {text.ok}
          </button>
          <button onClick={onClose}>{text.cancel}</button>
        </>
      }
    >
      <label>
        {text.transparencyLabel} <output>{draft}%</output>
        <input
          type="range"
          min={0}
          max={90}
          step={5}
          value={draft}
          aria-label={text.transparencyLabel}
          onChange={(event) => setDraft(Number(event.target.value))}
        />
      </label>
      <p>{text.transparencyNote}</p>
    </ModalDialog>
  );
}

export function CloseCommandLineDialog({
  open,
  text,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  text: CommandLineMessages;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalDialog
      open={open}
      title={text.closeTitle}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onConfirm}>{text.yes}</button>
          <button onClick={onCancel}>{text.no}</button>
        </>
      }
    >
      <p>{text.closeQuestion}</p>
    </ModalDialog>
  );
}
