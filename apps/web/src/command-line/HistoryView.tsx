import { useEffect, useRef, useState } from 'react';
import type { HistoryLine } from '../useCommandSession';

/** Temporary prompts stay readable briefly, then fade like AutoCAD's floating window. */
export const temporaryPromptMs = 5000;

export type HistoryPresentation = 'temporary' | 'expanded' | 'docked';

/**
 * One log owns the complete history for screen readers and copy; the presentation
 * only decides how many recent lines are visible.
 */
export function HistoryView({
  lines,
  presentation,
  visibleLines,
  label,
}: {
  lines: readonly HistoryLine[];
  presentation: HistoryPresentation;
  visibleLines: number;
  label: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const born = useRef(new Map<number, number>());
  const [now, setNow] = useState(() => Date.now());
  for (const line of lines) if (!born.current.has(line.id)) born.current.set(line.id, Date.now());
  const firstVisible = Math.max(0, lines.length - visibleLines);
  const fading =
    presentation === 'temporary' &&
    lines
      .slice(firstVisible)
      .some((line) => now - (born.current.get(line.id) ?? 0) < temporaryPromptMs + 1000);
  useEffect(() => {
    if (!fading) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [fading]);
  useEffect(() => {
    setNow(Date.now());
    if (element.current) element.current.scrollTop = element.current.scrollHeight;
  }, [lines, presentation]);
  return (
    <div
      className={`command-history ${presentation}`}
      ref={element}
      role="log"
      aria-live="polite"
      aria-label={label}
      style={
        presentation === 'docked'
          ? { height: `${visibleLines * 1.65 + 0.7}em` }
          : presentation === 'expanded'
            ? { maxHeight: `${Math.max(visibleLines, 12) * 1.65 + 0.7}em` }
            : undefined
      }
    >
      {lines.map((line, index) => {
        const hidden = presentation === 'temporary' && index < firstVisible;
        const age = now - (born.current.get(line.id) ?? 0);
        const faded = presentation === 'temporary' && age > temporaryPromptMs;
        return (
          <div
            key={line.id}
            className={`history-line ${line.kind}${hidden ? ' scrolled' : ''}${faded ? ' faded' : ''}`}
          >
            {line.text}
          </div>
        );
      })}
    </div>
  );
}
