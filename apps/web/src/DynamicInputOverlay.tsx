import type { useDynamicInput } from './useDynamicInput';
import { keywordOf, promptOptions } from './command-line/PromptKeywords';
import './dynamic-input.css';

const labels = {
  distance: ['길이', 'Length'],
  angle: ['각도', 'Angle'],
  x: ['X', 'X'],
  y: ['Y', 'Y'],
  z: ['Z', 'Z'],
} as const;
export function DynamicInputOverlay({ view }: { view: ReturnType<typeof useDynamicInput> }) {
  if (!view.visible) return null;
  const ko = view.locale === 'ko-KR';
  const options = promptOptions(view.prompt);
  return (
    <div
      className="dynamic-input-overlay"
      data-testid="dynamic-input"
      style={{
        left: Math.max(4, view.screen.x + 18),
        top: Math.max(4, view.screen.y + 22),
        fontSize: `${12 + view.size}px`,
        opacity: view.opacity,
      }}
      role="group"
      aria-label={ko ? '동적 입력' : 'Dynamic input'}
      onMouseDown={(event) => event.preventDefault()}
    >
      {view.prompt && (
        <div
          className="dynamic-prompt"
          style={view.allTooltips ? undefined : { fontSize: 12, opacity: 1 }}
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
      <div className="dynamic-fields">
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
                    aria-label={ko ? `${labels[field][0]} 잠금 해제` : `Unlock ${labels[field][1]}`}
                    onClick={() => view.unlock(field)}
                  >
                    ▣
                  </button>
                )}
              </div>
            );
          })}
      </div>
      {view.menu && (
        <div
          className="dynamic-options"
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
