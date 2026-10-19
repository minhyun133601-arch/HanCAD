import { useEffect, useRef, useState } from 'react';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import { STANDARD_LINEWEIGHTS } from '@hancad/render';
import './ribbon-properties.css';

export interface RibbonLayerControlProps {
  korean: boolean;
  state: LegacyCadState;
  currentLayer: string;
  values: { color: string; linetype: string; lineweight: string; transparency: string };
  changeLayer: (name: string) => void;
  toggleLayer: (name: string, field: 'visible' | 'frozen' | 'locked') => void;
  changeProperty: (
    name: 'color' | 'linetype' | 'lineweight' | 'transparency',
    value: string,
  ) => void;
  execute: (command: string) => void;
  openPropertyDialog?: (name: 'color' | 'linetype' | 'lineweight' | 'transparency') => void;
}

export function RibbonLayerControls(props: RibbonLayerControlProps) {
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const host = useRef<HTMLDivElement>(null);
  const ko = props.korean;
  useEffect(() => {
    if (!expanded) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !host.current?.contains(event.target)) setExpanded(false);
    };
    const close = () => setExpanded(false);
    const escape = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    };
    const ribbon = host.current?.closest('.ribbon-body');
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', close);
    ribbon?.addEventListener('scroll', close);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', close);
      ribbon?.removeEventListener('scroll', close);
    };
  }, [expanded]);
  return (
    <div className="ribbon-layer-controls" ref={host}>
      <button
        className="ribbon-layer-current"
        aria-label={ko ? '도면층 목록' : 'Layer list'}
        aria-expanded={expanded}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(0, Math.min(rect.left, window.innerWidth - 280)),
            top: rect.bottom,
          });
          setExpanded(!expanded);
        }}
      >
        {props.currentLayer || (ko ? '*다양함*' : '*VARIES*')} ▾
      </button>
      {expanded && (
        <div className="ribbon-layer-list" style={position} aria-label={ko ? '도면층' : 'Layers'}>
          {props.state.layers.map((layer) => (
            <div key={layer.name} className="ribbon-layer-row">
              {(['visible', 'frozen', 'locked'] as const).map((field) => {
                const label =
                  field === 'visible'
                    ? ko
                      ? '켜기'
                      : 'On'
                    : field === 'frozen'
                      ? ko
                        ? '동결'
                        : 'Freeze'
                      : ko
                        ? '잠금'
                        : 'Lock';
                return (
                  <button
                    key={field}
                    type="button"
                    title={`${layer.name} ${label}`}
                    aria-label={`${layer.name} ${label}`}
                    aria-pressed={Boolean(layer[field])}
                    onClick={() => props.toggleLayer(layer.name, field)}
                  >
                    {field === 'visible'
                      ? layer.visible
                        ? '☀'
                        : '○'
                      : field === 'frozen'
                        ? layer.frozen
                          ? '❄'
                          : '◇'
                        : layer.locked
                          ? '▣'
                          : '□'}
                  </button>
                );
              })}
              <button
                type="button"
                className="ribbon-layer-name"
                aria-current={layer.name === props.currentLayer}
                onClick={() => {
                  props.changeLayer(layer.name);
                  setExpanded(false);
                }}
              >
                <i style={{ background: layer.color }} />
                {layer.name}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="ribbon-layer-tools">
        {[
          ['LAYMCUR', '현재로 설정', 'Make current'],
          ['LAYMCH', '도면층 일치', 'Match layer'],
          ['LAYISO', '분리', 'Isolate'],
          ['LAYUNISO', '분리 해제', 'Unisolate'],
        ].map(([command, korean, english]) => (
          <button key={command} title={command} onClick={() => props.execute(command!)}>
            {ko ? korean : english}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RibbonPropertyControls(props: RibbonLayerControlProps) {
  const ko = props.korean;
  function select(
    name: 'color' | 'linetype' | 'lineweight' | 'transparency',
    label: string,
    values: readonly (readonly [string, string])[],
    more: string,
  ) {
    const value = props.values[name];
    return (
      <label>
        <span>{label}</span>
        <select
          aria-label={`Ribbon ${label}`}
          value={value}
          onChange={(event) => {
            if (event.target.value === '__MORE__') {
              if (props.openPropertyDialog) props.openPropertyDialog(name);
              else props.execute(more);
            } else props.changeProperty(name, event.target.value);
          }}
        >
          {!values.some(([key]) => key === value) && <option value={value}>{value}</option>}
          {values.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
          <option value="__MORE__">{ko ? '기타...' : 'Other...'}</option>
        </select>
      </label>
    );
  }
  const names = [
    ['BYLAYER', 'ByLayer'],
    ['BYBLOCK', 'ByBlock'],
  ] as const;
  return (
    <div className="ribbon-property-controls">
      {select(
        'color',
        ko ? '색상' : 'Color',
        [
          ...names,
          ...[
            ['1', '빨간색', 'Red'],
            ['2', '노란색', 'Yellow'],
            ['3', '초록색', 'Green'],
            ['4', '청록색', 'Cyan'],
            ['5', '파란색', 'Blue'],
            ['6', '선홍색', 'Magenta'],
            ['7', '흰색', 'White'],
          ].map(([key, korean, english]) => [key!, (ko ? korean : english)!] as const),
        ],
        'COLOR',
      )}
      {select(
        'linetype',
        ko ? '선종류' : 'Linetype',
        [
          ...names,
          ['CONTINUOUS', 'Continuous'],
          ...(props.state.linetypes ?? [])
            .filter((l) => l.name.toUpperCase() !== 'CONTINUOUS')
            .map((l) => [l.name, l.name] as const),
        ],
        'LINETYPE',
      )}
      {select(
        'lineweight',
        ko ? '선가중치' : 'Lineweight',
        [
          ['-1', 'ByLayer'],
          ['-2', 'ByBlock'],
          ['-3', ko ? '기본값' : 'Default'],
          ...STANDARD_LINEWEIGHTS.map((n) => [String(n), `${(n / 100).toFixed(2)} mm`] as const),
        ],
        'LWEIGHT',
      )}
      {select(
        'transparency',
        ko ? '투명도' : 'Transparency',
        [
          ['bylayer', 'ByLayer'],
          ['byblock', 'ByBlock'],
          ...[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((n) => [String(n), String(n)] as const),
        ],
        'CETRANSPARENCY',
      )}
      <button onClick={() => props.execute('MATCHPROP')} title="MATCHPROP">
        {ko ? '특성 일치' : 'Match properties'}
      </button>
    </div>
  );
}
