import type { CadEntity, LegacyCadState } from '@hancad/legacy-bridge';
import type { SystemVariables } from '@hancad/sysvars';
import type { RibbonLayerControlProps } from './RibbonLayerControls';
import { changeEntityProperty, entityProperties } from './entity-properties';

interface Host {
  korean: boolean;
  sysvars: SystemVariables;
  state: LegacyCadState;
  getState: () => LegacyCadState;
  selectedIds: readonly string[];
  commitState: (label: string, state: LegacyCadState) => void;
  layers: Pick<RibbonLayerControlProps, 'toggleLayer'> & { setCurrent(name: string): void };
  execute: (command: string) => void;
  print: (message: string) => void;
  openPropertyDialog?: RibbonLayerControlProps['openPropertyDialog'];
}

/** The ribbon publishes the same validated CHPROP and LAYER transactions as the palettes. */
export function useRibbonProperties(host: Host): RibbonLayerControlProps {
  const selected = new Set(host.selectedIds);
  const entities = host.state.entities.filter((entity) => selected.has(entity.id));
  const properties = entityProperties(entities);
  const common = (key: string, fallback: string) =>
    properties.find((p) => p.key === key)?.value ?? fallback;
  const color = common('color', String(host.sysvars.get('CECOLOR')));
  const transparency = host.sysvars.getNumber('CETRANSPARENCY');
  function guarded(action: () => void): void {
    try {
      action();
    } catch (error) {
      host.print(error instanceof Error ? error.message : String(error));
    }
  }
  function changeProperty(
    name: 'color' | 'linetype' | 'lineweight' | 'transparency',
    value: string,
  ): void {
    guarded(() => {
      if (host.selectedIds.length) {
        const color = /^RGB:/i.test(value)
          ? '#' +
            value
              .slice(4)
              .split(',')
              .map((n) => Number(n).toString(16).padStart(2, '0'))
              .join('')
          : value;
        host.commitState(
          'CHPROP',
          changeEntityProperty(host.getState(), host.selectedIds, name, color),
        );
      } else {
        const variable = {
          color: 'CECOLOR',
          linetype: 'CELTYPE',
          lineweight: 'CELWEIGHT',
          transparency: 'CETRANSPARENCY',
        }[name];
        const normalized =
          name === 'lineweight'
            ? Number(value)
            : name === 'transparency'
              ? value === 'bylayer'
                ? -1
                : value === 'byblock'
                  ? -2
                  : Number(value)
              : value;
        host.sysvars.set(variable, normalized);
      }
    });
  }
  function layerOf(values: readonly CadEntity[]): string {
    return values.length
      ? values.every((e) => e.layer === values[0]!.layer)
        ? values[0]!.layer
        : ''
      : String(host.sysvars.get('CLAYER'));
  }
  return {
    korean: host.korean,
    state: host.state,
    currentLayer: layerOf(entities),
    values: {
      color: /^by(?:layer|block)$/i.test(color) ? color.toUpperCase() : color,
      linetype: common('linetype', String(host.sysvars.get('CELTYPE'))).toUpperCase(),
      lineweight: common('lineweight', String(host.sysvars.get('CELWEIGHT'))),
      transparency: common(
        'transparency',
        transparency === -1 ? 'bylayer' : transparency === -2 ? 'byblock' : String(transparency),
      ),
    },
    changeLayer: (name) =>
      guarded(() => {
        if (host.selectedIds.length)
          host.commitState(
            'CHPROP',
            changeEntityProperty(host.getState(), host.selectedIds, 'layer', name),
          );
        else host.layers.setCurrent(name);
      }),
    toggleLayer: (name, field) => guarded(() => host.layers.toggleLayer(name, field)),
    changeProperty,
    execute: host.execute,
    ...(host.openPropertyDialog ? { openPropertyDialog: host.openPropertyDialog } : {}),
  };
}
