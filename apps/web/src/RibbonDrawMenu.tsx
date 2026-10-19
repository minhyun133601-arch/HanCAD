import { useRef, useState } from 'react';
import type { Locale } from '@hancad/ui';
import { ContextMenu } from './menus/ContextMenu';
import { Icon } from './Icon';
import type { DrawRibbonMethod } from './ribbon-draw-methods';
import type { Execute } from './ribbon-definitions';
import './ribbon-draw-menu.css';

export function RibbonDrawMenu({
  command,
  label,
  methods,
  locale,
  execute,
  expanded = false,
}: {
  command: string;
  label: string;
  methods: readonly DrawRibbonMethod[];
  locale: Locale;
  execute: Execute;
  expanded?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<{ x: number; y: number } | undefined>();
  const close = () => {
    setOpen(undefined);
    button.current?.focus();
  };
  const show = () => {
    const rect = button.current?.getBoundingClientRect();
    if (rect) setOpen({ x: rect.left, y: rect.bottom });
  };
  return (
    <>
      <button
        ref={button}
        className={expanded ? 'ribbon-tool ribbon-more-draw' : 'ribbon-method-arrow'}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!open}
        data-draw-methods={command}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            show();
          }
        }}
      >
        {expanded && (
          <>
            <Icon name="polyline" />
            <span>{locale === 'ko-KR' ? '더 그리기' : 'More Draw'}</span>
          </>
        )}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <ContextMenu
          x={open.x}
          y={open.y}
          label={label}
          onClose={close}
          items={methods.map((item) => ({
            id: item.id,
            label: locale === 'ko-KR' ? item.ko : item.en,
            onSelect: () => execute(item.macro),
          }))}
        />
      )}
    </>
  );
}
