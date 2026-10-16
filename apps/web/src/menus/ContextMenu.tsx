import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './menus.css';

export interface MenuAction {
  kind?: 'item';
  id: string;
  label: string;
  onSelect?: () => void;
  checked?: boolean;
  disabled?: boolean;
  shortcut?: string;
  items?: readonly MenuEntry[];
}
export type MenuEntry = MenuAction | { kind: 'separator'; id: string };

/** Korean AutoCAD menu labels end with a mnemonic such as "반복(R)". */
function mnemonic(label: string): string | undefined {
  return /\(([A-Z0-9])\)(?:\.\.\.)?$/.exec(label)?.[1];
}

function MenuList({
  items,
  x,
  y,
  close,
  closeSelf,
  depth,
  label,
}: {
  items: readonly MenuEntry[];
  x: number;
  y: number;
  /** Closes the whole menu tree after a selection. */
  close: () => void;
  /** Closes only this submenu level (ArrowLeft). */
  closeSelf: () => void;
  depth: number;
  label: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [open, setOpen] = useState<{ id: string; x: number; y: number } | null>(null);
  const actions = items.filter((item): item is MenuAction => item.kind !== 'separator');
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    });
    element.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [x, y]);

  function openSubmenu(item: MenuAction, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    setOpen(item.items?.length ? { id: item.id, x: rect.right - 2, y: rect.top - 4 } : null);
  }
  function activate(item: MenuAction, element: HTMLElement): void {
    if (item.disabled) return;
    if (item.items?.length) {
      openSubmenu(item, element);
      return;
    }
    close();
    item.onSelect?.();
  }
  function move(current: HTMLElement, step: number): void {
    const elements = [
      ...(root.current?.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]') ?? []),
    ];
    const index = elements.indexOf(current);
    elements.at((index + step) % elements.length)?.focus();
  }
  const submenu = open && actions.find((item) => item.id === open.id);
  return (
    <>
      <div
        ref={root}
        className="context-menu"
        role="menu"
        aria-label={label}
        data-context-menu-open=""
        style={{ left: position.x, top: position.y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {items.map((item) =>
          item.kind === 'separator' ? (
            <div key={item.id} className="context-menu-separator" role="separator" />
          ) : (
            <div
              key={item.id}
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              aria-disabled={item.disabled}
              aria-haspopup={item.items?.length ? 'menu' : undefined}
              aria-expanded={item.items?.length ? open?.id === item.id : undefined}
              tabIndex={-1}
              className={item.disabled ? 'context-menu-item disabled' : 'context-menu-item'}
              onPointerEnter={(event) => {
                event.currentTarget.focus();
                openSubmenu(item, event.currentTarget);
              }}
              onClick={(event) => activate(item, event.currentTarget)}
              onKeyDown={(event) => {
                event.stopPropagation();
                const key = event.key.toUpperCase();
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  move(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1);
                } else if (event.key === 'ArrowRight' && item.items?.length) {
                  event.preventDefault();
                  openSubmenu(item, event.currentTarget);
                } else if (event.key === 'ArrowLeft' && depth > 0) {
                  event.preventDefault();
                  closeSelf();
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  activate(item, event.currentTarget);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  close();
                } else {
                  const target = actions.find((entry) => mnemonic(entry.label) === key);
                  const element = target
                    ? root.current?.querySelector<HTMLElement>(`[data-menu-id="${target.id}"]`)
                    : null;
                  if (target && element) {
                    event.preventDefault();
                    activate(target, element);
                  }
                }
              }}
              data-menu-id={item.id}
            >
              <span className="context-menu-check" aria-hidden="true">
                {item.checked ? '✓' : ''}
              </span>
              <span className="context-menu-label">{item.label}</span>
              <span className="context-menu-shortcut">
                {item.items?.length ? '›' : (item.shortcut ?? '')}
              </span>
            </div>
          ),
        )}
      </div>
      {submenu?.items && open && (
        <MenuList
          items={submenu.items}
          x={open.x}
          y={open.y}
          close={close}
          closeSelf={() => {
            const id = open.id;
            setOpen(null);
            root.current?.querySelector<HTMLElement>(`[data-menu-id="${id}"]`)?.focus();
          }}
          depth={depth + 1}
          label={submenu.label}
        />
      )}
    </>
  );
}

/** A Korean AutoCAD-style shortcut menu rendered at a screen point. */
export function ContextMenu({
  items,
  x,
  y,
  label,
  onClose,
}: {
  items: readonly MenuEntry[];
  x: number;
  y: number;
  label: string;
  onClose: () => void;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    function outside(event: PointerEvent): void {
      if (!(event.target instanceof Element) || !event.target.closest('.context-menu'))
        close.current();
    }
    function escape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
    }
    const blur = (): void => close.current();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return createPortal(
    <MenuList
      items={items}
      x={x}
      y={y}
      close={() => close.current()}
      closeSelf={() => close.current()}
      depth={0}
      label={label}
    />,
    document.body,
  );
}
