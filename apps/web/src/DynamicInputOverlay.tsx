import type { useDynamicInput } from './useDynamicInput';
import { useLayoutEffect, useRef, useState } from 'react';
import { keywordOf } from './command-line/PromptKeywords';
import { dynamicPosition } from './dynamic-input-state';
import './dynamic-input.css';

const labels = {
  distance: ['길이', 'Length'],
  angle: ['각도', 'Angle'],
  x: ['X', 'X'],
  y: ['Y', 'Y'],
  z: ['Z', 'Z'],
  result: ['결과 길이', 'Resulting length'],
  lengthChange: ['길이 변경', 'Length change'],
  absoluteAngle: ['절대 각도', 'Absolute angle'],
  angleChange: ['각도 변경', 'Angle change'],
  radius: ['호 반지름', 'Arc radius'],
} as const;
export function DynamicInputOverlay({ view }: { view: ReturnType<typeof useDynamicInput> }) {
  const overlay = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 4, y: 4 });
  useLayoutEffect(() => {
    const node = overlay.current;
    const parent = node?.offsetParent;
    if (!node || !(parent instanceof HTMLElement)) return;
    function update(): void {
      if (!node || !(parent instanceof HTMLElement)) return;
      const next = dynamicPosition(
        view.screen,
        node.getBoundingClientRect(),
        parent.getBoundingClientRect(),
      );
      setPosition((old) => (old.x === next.x && old.y === next.y ? old : next));
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [view.visible, view.screen.x, view.screen.y, view.menu, view.size]);
  if (!view.visible) return null;
  const ko = view.locale === 'ko-KR';
  const options = view.optionLabels;
  return (
    <div
      className="dynamic-input-overlay"
      ref={overlay}
      data-testid="dynamic-input"
      style={{
        left: position.x,
        top: position.y,
      }}
      role="group"
      aria-label={ko ? '동적 입력' : 'Dynamic input'}
      onMouseDown={(event) => event.preventDefault()}
    >
      {view.prompt && (
        <div
          className="dynamic-prompt"
          style={view.allTooltips ? { fontSize: 12 + view.size, opacity: view.opacity } : undefined}
        >
          {view.prompt}
          {options.length > 0 && (
            <button
              type="button"
              aria-label={ko ? '동적 입력 옵션' : 'Dynamic input options'}
              onClick={view.openOptions}
            >
              ▼
            </button>
          )}
        </div>
      )}
      {view.inputText && (
        <div
          className="dynamic-command-text"
          style={{ fontSize: 12 + view.size, opacity: view.opacity }}
        >
          {view.inputText}
        </div>
      )}
      {view.showFields && (
        <div className="dynamic-fields" style={{ fontSize: 12 + view.size, opacity: view.opacity }}>
          {view.fields
            .filter(
              (field) => field !== 'z' || view.state.field === 'z' || view.values.z !== undefined,
            )
            .map((field) => {
              const locked = view.values[field] !== undefined;
              return (
                <div
                  key={field}
                  className={view.state.field === field ? 'dynamic-field active' : 'dynamic-field'}
                  data-field={field}
                  data-locked={locked}
                  aria-invalid={view.invalid && locked}
                >
                  <button
                    type="button"
                    aria-label={labels[field][ko ? 0 : 1]}
                    onClick={() => view.selectField(field)}
                  >
                    <span className="dynamic-field-name">{labels[field][ko ? 0 : 1]}</span>
                    <span>{view.values[field] ?? view.displayed[field]}</span>
                  </button>
                  {locked && (
                    <button
                      type="button"
                      className="dynamic-unlock"
                      aria-label={
                        ko ? `${labels[field][0]} 잠금 해제` : `Unlock ${labels[field][1]}`
                      }
                      onClick={() => view.unlock(field)}
                    >
                      ▣
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
      {view.menu && (
        <div
          className="dynamic-options"
          style={view.allTooltips ? { fontSize: 12 + view.size, opacity: view.opacity } : undefined}
          role="menu"
          aria-label={ko ? '동적 입력 옵션' : 'Dynamic input options'}
        >
          {options.map((label, i) => (
            <button
              key={label}
              role="menuitem"
              className={view.highlight === i ? 'highlighted' : ''}
              onClick={() => {
                const keyword = keywordOf(label);
                if (keyword) view.selectOption(keyword);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
