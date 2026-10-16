import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isTextEditingTarget } from './ui-focus';
import './ribbon-keytips.css';

type Level = 'root' | 'tools' | 'file';
interface KeyTipState {
  level: Level;
  prefix: string;
}
interface Badge {
  key: string;
  x: number;
  y: number;
}

function targets(level: Level): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(`[data-ribbon-keytip-level="${level}"]`),
  ].filter((element) => {
    const rect = element.getBoundingClientRect();
    const clip = element.closest('.ribbon-body')?.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      x >= 0 &&
      x <= window.innerWidth &&
      y >= 0 &&
      y < window.innerHeight &&
      (!clip || (x >= clip.left && x <= clip.right)) &&
      !element.matches(':disabled, [aria-disabled="true"]')
    );
  });
}

/** Alt navigates the same buttons used by pointer input; commands remain macros. */
export function RibbonKeyTips({ enabled, activeTab }: { enabled: boolean; activeTab: string }) {
  const [state, setState] = useState<KeyTipState | null>(null);
  const live = useRef({ enabled, state });
  live.current = { enabled, state };
  const previousFocus = useRef<HTMLElement | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [positionVersion, setPositionVersion] = useState(0);

  useEffect(() => {
    if (!enabled) setState(null);
  }, [enabled]);
  useEffect(() => {
    function update(value: KeyTipState | null): void {
      live.current.state = value;
      setState(value);
    }
    function close(restore = false): void {
      update(null);
      if (restore && previousFocus.current?.isConnected)
        previousFocus.current.focus({ preventScroll: true });
    }
    function blocked(event: Event): boolean {
      return (
        isTextEditingTarget(event.target) ||
        document.querySelector('dialog[open], [data-context-menu-open]') !== null ||
        (live.current.state?.level !== 'file' &&
          document.querySelector('[data-file-menu-open]') !== null)
      );
    }
    function own(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    function keyboard(event: KeyboardEvent): void {
      if (
        !live.current.enabled ||
        blocked(event) ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.getModifierState('AltGraph')
      ) {
        close();
        return;
      }
      if (event.code === 'AltRight') {
        close();
        return;
      }
      if (event.code === 'AltLeft') {
        if (event.shiftKey || event.repeat) return;
        own(event);
        if (live.current.state) close(true);
        else {
          previousFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          update({ level: 'root', prefix: '' });
        }
        return;
      }
      const current = live.current.state;
      if (!current) return;
      if (event.code === 'Escape') {
        own(event);
        if (current.prefix) update({ ...current, prefix: '' });
        else if (current.level === 'root') close(true);
        else {
          if (current.level === 'file')
            document.querySelector<HTMLButtonElement>('.app-mark[aria-expanded="true"]')?.click();
          update({ level: 'root', prefix: '' });
        }
        return;
      }
      if (event.code === 'Backspace') {
        own(event);
        update({ ...current, prefix: current.prefix.slice(0, -1) });
        return;
      }
      const key = /^Key[A-Z]$/.test(event.code)
        ? event.code.slice(3)
        : /^Digit[0-9]$/.test(event.code)
          ? event.code.slice(5)
          : undefined;
      if (!key) {
        close();
        return;
      }
      own(event);
      const prefix = current.prefix + key;
      const candidates = targets(current.level);
      const target = candidates.find((element) => element.dataset.ribbonKeytip === prefix);
      if (target) {
        const next = target.dataset.ribbonKeytipNext;
        if (next === 'tools' || next === 'file') update({ level: next, prefix: '' });
        else close();
        target.click();
      } else
        update({
          ...current,
          prefix: candidates.some((element) => element.dataset.ribbonKeytip?.startsWith(prefix))
            ? prefix
            : '',
        });
    }
    function focus(event: FocusEvent): void {
      if (blocked(event)) close();
    }
    const hide = (): void => close();
    const reposition = (): void => setPositionVersion((version) => version + 1);
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focus, true);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', focus, true);
      window.removeEventListener('blur', hide);
      window.removeEventListener('resize', reposition);
    };
  }, []);

  useLayoutEffect(() => {
    setBadges(
      !enabled || !state
        ? []
        : targets(state.level).flatMap((element) => {
            const key = element.dataset.ribbonKeytip;
            if (!key || !key.startsWith(state.prefix)) return [];
            const rect = element.getBoundingClientRect();
            return [{ key, x: rect.left + rect.width / 2, y: rect.bottom - 7 }];
          }),
    );
  }, [enabled, state, activeTab, positionVersion]);
  if (!badges.length) return null;
  return createPortal(
    <div className="ribbon-keytips" aria-hidden="true">
      {badges.map((badge) => (
        <span
          key={badge.key}
          className="ribbon-keytip"
          data-ribbon-keytip-badge={badge.key}
          style={{ left: badge.x, top: badge.y }}
        >
          {badge.key}
        </span>
      ))}
    </div>,
    document.body,
  );
}
