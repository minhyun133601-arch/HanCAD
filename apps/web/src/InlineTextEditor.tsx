import { useLayoutEffect, useRef } from 'react';
import type { CadPoint } from '@hancad/legacy-bridge';
import type { Messages } from '@hancad/ui';
import type { CanvasSurface } from './canvas-surface';

interface TextEntry {
  point: CadPoint;
  textSize: number;
  rotation: number;
  value: string;
}
export function InlineTextEditor({
  entry,
  surface,
  messages,
  changeText,
  submit,
  cancel,
}: {
  entry: TextEntry | null;
  surface: { current: CanvasSurface | null };
  messages: Messages;
  changeText: (value: string) => void;
  submit: (value: string) => void;
  cancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const latest = useRef(entry);
  latest.current = entry;
  const active = entry !== null;
  useLayoutEffect(() => {
    if (!active) return;
    input.current?.focus({ preventScroll: true });
    let frame = 0;
    function position(): void {
      const element = input.current,
        current = latest.current,
        canvas = surface.current;
      if (element && current && canvas) {
        const point = canvas.worldToScreen(current.point);
        const rect = canvas.canvas.getBoundingClientRect();
        const size = Math.max(12, Math.min(64, current.textSize * canvas.getView().scale));
        const width = Math.min(
          Math.max(160, (current.value.length + 3) * size),
          Math.max(160, rect.width - 24),
        );
        element.style.fontSize = `${size}px`;
        element.style.width = `${width}px`;
        element.style.left = `${Math.max(8, Math.min(rect.width - width - 8, point.x))}px`;
        element.style.top = `${Math.max(8, Math.min(rect.height - size * 1.6, point.y - size * 1.1))}px`;
      }
      frame = requestAnimationFrame(position);
    }
    position();
    return () => cancelAnimationFrame(frame);
  }, [active, surface]);
  if (!entry) return null;
  return (
    <input
      ref={input}
      className="inline-text-editor"
      aria-label={messages.inlineTextLabel}
      title={messages.textUsage}
      value={entry.value}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => changeText(event.target.value)}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.code === 'Enter' || event.code === 'NumpadEnter') {
          event.preventDefault();
          submit(event.currentTarget.value);
        } else if (event.code === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
}
