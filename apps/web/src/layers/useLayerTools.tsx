import { useEffect, useRef, useState } from 'react';
import type { CadLayer, CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { ACI_RGB, rgbToCss } from '@hancad/render';
import { decodeSupportText } from '@hancad/input';
import { LayerPalette } from './LayerPalette';
import {
  LayerController,
  commitLayerChange,
  layerMetadata,
  liveLayerState,
} from './layer-controller';
import type { LayerHost } from './layer-controller';
import {
  changeLayerField,
  changeLayers,
  createLayers,
  deleteLayers,
  findLayer,
  renameLayer,
  setCurrentLayer,
} from './layer-model';
import type { LayerField } from './layer-model';
import {
  captureLayerState,
  exportLayerState,
  importLayerState,
  restoreLayerState,
} from './layer-states';
import { registerLayerCommands } from './register-layer-commands';
import {
  bindLayerNotificationVariables,
  currentLayerNotification,
  recordLayerNotification,
} from '../layer-notifications';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export function useLayerTools(options: LayerHost) {
  const latest = useRef(options);
  latest.current = options;
  bindLayerNotificationVariables(options.sysvars);
  const [open, setOpen] = useState(false),
    [walk, setWalk] = useState(false),
    [, setRevision] = useState(0);
  const [panelTab, setPanelTab] = useState<'layers' | 'states'>('layers');
  const [previewState, setPreviewState] = useState<LegacyCadState | undefined>();
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<LayerController | null>(null);
  if (!controller.current)
    controller.current = new LayerController(
      () => latest.current,
      () => setRevision((value) => value + 1),
      (type, name) => {
        if (type === 'import') input.current?.click();
        else exportState(name);
      },
    );
  const active = controller.current;
  const state = liveLayerState(options),
    meta = layerMetadata(options);
  function close(): void {
    setOpen(false);
    setWalk(false);
    setPreviewState(undefined);
  }
  function update(label: string, next: LegacyCadState): void {
    commitLayerChange(latest.current, label, next);
  }
  function toggleLayer(name: string, field: LayerField): void {
    const state = liveLayerState(latest.current),
      layer = findLayer(state, name);
    if (layer)
      update('LAYER', changeLayerField(state, name, field, !(layer[field] ?? field === 'plot')));
  }
  function setCurrent(name: string): void {
    update('LAYER', setCurrentLayer(liveLayerState(latest.current), name));
  }
  function edit(name: string, field: keyof CadLayer, value: string): void {
    const state = liveLayerState(latest.current);
    if (field === 'name') {
      update('LAYER', renameLayer(state, name, value));
      return;
    }
    let patch: Partial<CadLayer> = {};
    if (field === 'aci') {
      if (/^#[a-f0-9]{6}$/i.test(value))
        patch = { trueColor: parseInt(value.slice(1), 16), color: value };
      else {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1 || number > 255)
          throw new Error(
            '색상은 1~255 또는 #RRGGBB여야 합니다. / Color requires 1–255 or #RRGGBB.',
          );
        patch = { aci: number, color: rgbToCss(ACI_RGB[number] ?? 0xffffff) };
      }
    } else if (field === 'transparency') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 90)
        throw new Error('투명도는 0~90이어야 합니다. / Transparency must be 0–90.');
      patch = { transparency: n };
    } else if (field === 'lineweight') {
      const n = /^default$/i.test(value) ? -3 : Math.round(Number(value) * 100);
      if (
        ![
          -3, 0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140,
          158, 200, 211,
        ].includes(n)
      )
        throw new Error('유효한 선가중치가 필요합니다. / Invalid lineweight.');
      patch = { lineweight: n };
    } else if (field === 'linetype') {
      if (
        ![
          'CONTINUOUS',
          ...(state.linetypes?.map((type) => type.name.toUpperCase()) ?? []),
        ].includes(value.toUpperCase()) &&
        !latest.current.database.find('LTYPE', value)
      )
        throw new Error('선종류를 먼저 로드하십시오. / Load the linetype first.');
      patch = { linetype: value };
    } else if (field === 'description') patch = { description: value };
    const next = changeLayers(state, name, (layer) => {
      const row = { ...layer, ...patch };
      if (field === 'aci' && !value.startsWith('#')) delete row.trueColor;
      return row;
    });
    update('LAYER', next);
  }
  function exportState(name: string): void {
    const saved = layerMetadata(latest.current).states.find((entry) => entry.name === name);
    if (saved) download(`${name.replace(/[<>:"/\\|?*]/g, '_')}.las`, exportLayerState(saved));
    else
      latest.current.print(
        latest.current.korean ? '도면층 상태를 찾을 수 없습니다.' : 'Layer state not found.',
      );
  }
  async function importState(file: File): Promise<void> {
    try {
      const saved = importLayerState(
          decodeSupportText(new Uint8Array(await file.arrayBuffer())).text,
        ),
        host = latest.current,
        meta = layerMetadata(host);
      meta.states = [...meta.states.filter((entry) => entry.name !== saved.name), saved];
      const state = liveLayerState(host),
        next = { ...state, layers: [...state.layers] };
      for (const layer of saved.layers)
        if (!findLayer(next, layer.name)) next.layers.push({ ...layer });
      commitLayerChange(host, 'LAYERSTATE IMPORT', next, meta, false);
    } catch (error) {
      latest.current.print(error instanceof Error ? error.message : String(error));
    }
  }
  useEffect(
    () => options.database.events.subscribe(() => setRevision((value) => value + 1)),
    [options.database],
  );
  useEffect(
    () =>
      options.sysvars.events.subscribe((event) => {
        if (event.name.startsWith('LAYER') || event.name === 'LAYLOCKFADECTL')
          setRevision((value) => value + 1);
      }),
    [options.sysvars],
  );
  useEffect(
    () =>
      registerLayerCommands({
        host: () => latest.current,
        begin: (name) => active.begin(name),
        setPanelTab,
        setWalk,
        setOpen,
        close,
        openImport: () => input.current?.click(),
        exportState,
      }),
    [options.registry],
  );
  const notify = currentLayerNotification(options.database, state) !== undefined;
  const palette = (
    <>
      {open && (
        <LayerPalette
          key={`${walk}-${panelTab}`}
          initialTab={panelTab}
          state={state}
          metadata={meta}
          korean={options.korean}
          walk={walk}
          close={close}
          toggle={toggleLayer}
          current={setCurrent}
          edit={edit}
          create={(name) => {
            let next = createLayers(
              liveLayerState(latest.current),
              name,
              findLayer(state, state.settings.layer),
            );
            if (
              options.sysvars.getNumber('LAYEREVALCTL') !== 0 &&
              options.sysvars.getNumber('LAYEREVAL') === 2
            )
              next = {
                ...next,
                layers: next.layers.map((layer) =>
                  findLayer(state, layer.name) ? layer : { ...layer, unreconciled: true },
                ),
              };
            update('LAYER', next);
          }}
          remove={(names) => {
            const wanted = new Set(names.map((name) => name.toUpperCase()));
            if (
              latest.current.database
                .all()
                .some(
                  (record) =>
                    record.type !== 'LAYER' &&
                    typeof record.fields.layer === 'string' &&
                    wanted.has(record.fields.layer.toUpperCase()),
                )
            )
              throw new Error(
                latest.current.korean
                  ? '객체가 참조하는 도면층은 삭제할 수 없습니다.'
                  : 'Cannot delete a layer referenced by objects.',
              );
            update('LAYER', deleteLayers(liveLayerState(latest.current), names));
          }}
          reconcile={(names) => {
            const wanted = new Set(names);
            update(
              'LAYER',
              changeLayers(liveLayerState(latest.current), '*', (layer) =>
                wanted.has(layer.name) ? { ...layer, unreconciled: false } : layer,
              ),
            );
          }}
          filter={(filter) => {
            const host = latest.current,
              meta = layerMetadata(host);
            meta.filters = [...meta.filters.filter((entry) => entry.name !== filter.name), filter];
            commitLayerChange(host, 'LAYER FILTER', liveLayerState(host), meta, false);
          }}
          saveState={(name, properties) => {
            const host = latest.current,
              meta = layerMetadata(host);
            meta.states = [
              ...meta.states.filter((entry) => entry.name !== name),
              {
                ...captureLayerState(liveLayerState(host), name),
                ...(properties ? { properties } : {}),
              },
            ];
            commitLayerChange(host, 'LAYERSTATE SAVE', liveLayerState(host), meta, false);
          }}
          restoreState={(saved) => {
            update('LAYERSTATE RESTORE', restoreLayerState(liveLayerState(latest.current), saved));
            recordLayerNotification(
              latest.current.database,
              liveLayerState(latest.current),
              'restore',
            );
          }}
          deleteState={(name) => {
            const host = latest.current,
              meta = layerMetadata(host);
            meta.states = meta.states.filter((entry) => entry.name !== name);
            commitLayerChange(host, 'LAYERSTATE DELETE', liveLayerState(host), meta, false);
          }}
          exportState={exportState}
          importState={(file) => void importState(file)}
          preview={(names) => {
            const state = liveLayerState(latest.current);
            setPreviewState({
              ...state,
              layers: state.layers.map((layer) => ({
                ...layer,
                visible: names.includes(layer.name),
                frozen: false,
              })),
            });
          }}
        />
      )}
      <input
        ref={input}
        hidden
        type="file"
        accept=".las"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importState(file);
          event.target.value = '';
        }}
      />
      {notify && !open && (
        <button className="layer-notification" onClick={() => setOpen(true)}>
          {options.korean
            ? '조정되지 않은 새 도면층이 있습니다.'
            : 'Unreconciled new layers found.'}
        </button>
      )}
    </>
  );
  return {
    palette,
    open,
    previewState: active.cli.state ?? previewState,
    rows: state.layers,
    toggleLayer,
    setCurrent,
    snapshot: active.snapshot,
    active: !!active.snapshot,
    inputMode: active.snapshot?.inputMode,
    needsPoint: () => active.snapshot?.stage === 'offset',
    getPointInput: () => active.copy.input,
    getAidContext: () => active.copy.getAidContext(),
    pick: (point: CadPoint) => active.copy.pick(point),
    cursor: (point: CadPoint) => active.copy.cursor(point),
    prompt: active.prompt,
    isActive: () => !!active.snapshot,
    submit: (value: string) => active.submit(value),
    cancel: (notify = true) => active.cancel(notify),
  };
}
