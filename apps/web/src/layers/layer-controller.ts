import { selectedLayerNames } from './layer-selection';
import { LayerCliSession } from './layer-cli-session';
import { LayerCopySession } from './layer-copy';
import { liveLayerState, layerMetadata, commitLayerChange } from './layer-host';
import type { LayerHost, LayerSnapshot } from './layer-host';
export { liveLayerState, layerMetadata, commitLayerChange } from './layer-host';
export type { LayerHost, LayerSnapshot, NativeLayerChange } from './layer-host';
import type { CadPoint, LegacyCadState } from '@hancad/legacy-bridge';
import { transformGripEntity } from '@hancad/draft';
import {
  changeLayerField,
  deleteLayers,
  findLayer,
  layerKey,
  matchesLayer,
  mergeLayers,
  setCurrentLayer,
} from './layer-model';
import { captureLayerState, restoreLayerState, restorePreviousLayers } from './layer-states';
import type { LayerMetadata } from './layer-states';

export class LayerController {
  snapshot: LayerSnapshot | null = null;
  readonly copy: LayerCopySession;
  readonly cli: LayerCliSession;
  constructor(
    private readonly host: () => LayerHost,
    private readonly changed: () => void,
    fileAction?: (type: 'import' | 'export', name: string) => void,
  ) {
    this.cli = new LayerCliSession(
      host,
      () => {
        this.publish({
          command: 'LAYER',
          stage: 'cli',
          inputMode: this.cli.step?.text ? 'text' : 'keyword',
          ids: [],
        });
      },
      () => this.publish(null),
      fileAction,
    );
    this.copy = new LayerCopySession(
      host,
      () => {
        if (this.snapshot) this.publish({ ...this.snapshot, preview: this.copy.preview });
      },
      (delta) => this.insertCopies(delta),
    );
  }
  private publish(value: LayerSnapshot | null): void {
    this.snapshot = value;
    this.changed();
  }
  private text(ko: string, en: string): string {
    return this.host().korean ? ko : en;
  }
  cancel(notify = true): boolean {
    const had = !!this.snapshot;
    this.copy.cancel();
    this.cli.finish();
    this.publish(null);
    if (had && notify) this.host().print(this.text('*취소*', '*Cancel*'));
    return had;
  }
  begin(command: string): void {
    this.cancel(false);
    this.host().cancelOthers?.();
    if (command === 'LAYER') {
      this.cli.begin();
      return;
    }
    const host = this.host(),
      state = liveLayerState(host),
      meta = layerMetadata(host);
    if (command === 'LAYUNISO') {
      if (meta.isolated) {
        const next = restoreLayerState(state, meta.isolated, false);
        delete meta.isolated;
        commitLayerChange(host, command, next, meta);
      }
      return;
    }
    if (command === 'LAYERP') {
      if (host.database.getVariable('HANCAD_LAYERPMODE') === 0) {
        host.print(this.text('도면층 이전 모드가 꺼져 있습니다.', 'Layer Previous mode is off.'));
        return;
      }
      if (meta.previous) {
        const next = restorePreviousLayers(state, meta.previous);
        meta.previousStack?.pop();
        const previous = meta.previousStack?.at(-1);
        if (previous) meta.previous = previous;
        else delete meta.previous;
        commitLayerChange(host, command, next, meta, false);
      } else
        host.print(
          this.text('복원할 이전 도면층 상태가 없습니다.', 'No previous layer status to restore.'),
        );
      return;
    }
    if (['LAYON', 'LAYTHW'].includes(command)) {
      const field = command === 'LAYON' ? 'visible' : 'frozen';
      commitLayerChange(host, command, changeLayerField(state, '*', field, command === 'LAYON'));
      return;
    }
    const ids = host.sysvars.getNumber('PICKFIRST') ? [...host.getSelectedIds()] : [];
    this.publish({ command, stage: 'selection', inputMode: 'selection', ids });
    if (ids.length) this.selection(ids);
  }
  private selection(ids: readonly string[]): void {
    const active = this.snapshot;
    if (!active) return;
    const host = this.host(),
      state = liveLayerState(host),
      names = selectedLayerNames(host, ids);
    if (!names.length) {
      host.print(this.text('선택한 객체가 없습니다.', 'No objects selected.'));
      this.publish(null);
      return;
    }
    if (active.stage === 'target') {
      this.target(names[0]!);
      return;
    }
    if (['LAYMCH', 'LAYMRG', 'COPYTOLAYER'].includes(active.command)) {
      if (host.clearSelection) host.clearSelection();
      else host.selectIds?.([]);
      this.publish({ ...active, ids, names, stage: 'target', inputMode: 'selection' });
      return;
    }
    if (active.command === 'LAYDEL') {
      this.publish({ ...active, ids, names, stage: 'confirm', inputMode: 'keyword' });
      return;
    }
    if (active.command === 'SETBYLAYER') {
      this.publish({ ...active, ids, names, stage: 'byblock', inputMode: 'keyword' });
      return;
    }
    if (active.command === 'LAYMCUR')
      commitLayerChange(host, active.command, setCurrentLayer(state, names[0]!));
    else if (active.command === 'LAYCUR') {
      const wanted = new Set(ids);
      commitLayerChange(
        host,
        active.command,
        {
          ...state,
          entities: state.entities.map((entity) =>
            wanted.has(entity.id) && !findLayer(state, entity.layer)?.locked
              ? { ...entity, layer: state.settings.layer }
              : entity,
          ),
        },
        layerMetadata(host),
        true,
        { kind: 'assign', ids, target: state.settings.layer },
      );
    } else if (active.command === 'LAYISO') {
      if (!metaIsolated(host)) {
        const meta = layerMetadata(host);
        meta.isolated = captureLayerState(state);
        this.isolate(names, state, meta);
      } else this.isolate(names, state, layerMetadata(host));
    } else {
      const field =
        active.command === 'LAYOFF' ? 'visible' : active.command === 'LAYFRZ' ? 'frozen' : 'locked';
      let next = state;
      for (const name of names)
        next = changeLayerField(next, name, field, !['LAYOFF', 'LAYULK'].includes(active.command));
      commitLayerChange(host, active.command, next);
    }
    this.publish(null);
  }
  private isolate(names: readonly string[], state: LegacyCadState, meta: LayerMetadata): void {
    const wanted = new Set(names.map(layerKey));
    const layers = state.layers.map((layer) =>
      wanted.has(layerKey(layer.name))
        ? layer
        : meta.isolateMode === 'off'
          ? { ...layer, visible: false }
          : { ...layer, locked: true },
    );
    commitLayerChange(this.host(), 'LAYISO', { ...state, layers }, meta);
  }
  private target(name: string): void {
    const active = this.snapshot;
    if (!active) return;
    const host = this.host();
    let state = liveLayerState(host);
    const target = findLayer(state, name);
    if (!target)
      throw new Error(this.text('대상 도면층을 찾을 수 없습니다.', 'Destination layer not found.'));
    if (active.command === 'LAYMRG') {
      this.publish({ ...active, target: target.name, stage: 'confirm', inputMode: 'keyword' });
      return;
    }
    if (active.command === 'COPYTOLAYER') {
      this.copy.begin(active.ids, target.name);
      this.publish({ ...active, target: target.name, stage: 'offset', inputMode: 'point' });
      return;
    }
    const wanted = new Set(active.ids);
    state = {
      ...state,
      entities: state.entities.map((entity) =>
        wanted.has(entity.id) && !findLayer(state, entity.layer)?.locked
          ? { ...entity, layer: target.name }
          : entity,
      ),
    };
    commitLayerChange(host, active.command, state, layerMetadata(host), true, {
      kind: 'assign',
      ids: active.ids,
      target: target.name,
    });
    this.publish(null);
  }
  private insertCopies(delta: CadPoint): void {
    const active = this.snapshot;
    if (!active) return;
    const host = this.host(),
      state = liveLayerState(host),
      ids = new Set(active.ids);
    const copies = state.entities
      .filter((entity) => ids.has(entity.id))
      .map((entity) => ({
        ...transformGripEntity(entity, 'MOVE', { x: 0, y: 0 }, delta),
        id: crypto.randomUUID(),
        layer: active.target ?? state.settings.layer,
      }));
    commitLayerChange(
      host,
      active.command,
      { ...state, entities: [...state.entities, ...copies] },
      layerMetadata(host),
      true,
      { kind: 'copy', ids: active.ids, target: active.target ?? state.settings.layer, delta },
    );
    this.copy.cancel();
    this.publish(null);
  }
  submit(value: string): boolean {
    const active = this.snapshot;
    if (!active) return false;
    if (active.stage === 'cli') {
      this.cli.submit(value);
      return true;
    }
    const host = this.host(),
      key = value.trim().replace(/^_/, '').toUpperCase();
    try {
      if (active.stage === 'selection' || active.stage === 'target') {
        if (active.command === 'LAYISO' && ['S', 'SETTINGS'].includes(key)) {
          this.publish({ ...active, stage: 'settings', inputMode: 'keyword' });
          return true;
        }
        if (['N', 'NAME'].includes(key)) {
          this.publish({ ...active, stage: 'names', inputMode: 'text' });
          return true;
        }
        if (key) {
          const direct = host.getState().entities.find((entity) => entity.id === value.trim());
          if (direct) this.selection([direct.id]);
          else host.print(this.text('객체 선택:', 'Select objects:'));
        } else this.selection(host.getSelectedIds());
      } else if (active.stage === 'settings') {
        const meta = layerMetadata(host);
        if (['O', 'OFF'].includes(key)) {
          meta.isolateMode = 'off';
          commitLayerChange(host, 'LAYISO SETTINGS', liveLayerState(host), meta, false);
          this.publish({ ...active, stage: 'selection', inputMode: 'selection' });
        } else if (!key || ['L', 'LOCK', 'LOCKANDFADE'].includes(key)) {
          meta.isolateMode = 'lock';
          commitLayerChange(host, 'LAYISO SETTINGS', liveLayerState(host), meta, false);
          this.publish({ ...active, stage: 'fade', inputMode: 'keyword' });
        } else host.print(this.text('유효한 옵션을 입력하십시오.', 'Requires a valid option.'));
      } else if (active.stage === 'fade') {
        const n = value.trim() ? Number(value) : 50;
        if (!Number.isFinite(n) || n < 0 || n > 90)
          throw new Error(this.text('페이드 값은 0~90이어야 합니다.', 'Fade must be 0–90.'));
        host.sysvars.set('LAYLOCKFADECTL', n);
        this.publish({ ...active, stage: 'selection', inputMode: 'selection' });
      } else if (active.stage === 'names') {
        const state = liveLayerState(host),
          names = state.layers
            .filter((layer) => matchesLayer(layer.name, value))
            .map((layer) => layer.name);
        if (!names.length)
          throw new Error(this.text('도면층을 찾을 수 없습니다.', 'Layer not found.'));
        if (active.names?.length) this.target(names[0]!);
        else if (active.command === 'LAYDEL')
          this.publish({ ...active, names, stage: 'confirm', inputMode: 'keyword' });
        else if (active.command === 'LAYMRG')
          this.publish({ ...active, names, stage: 'target', inputMode: 'selection' });
        else this.target(names[0]!);
      } else if (active.stage === 'confirm') {
        if (['Y', 'YES', '예'].includes(key)) {
          const state = liveLayerState(host);
          const next =
            active.command === 'LAYDEL'
              ? deleteLayers(state, active.names ?? [], true)
              : mergeLayers(state, active.names ?? [], active.target ?? state.settings.layer);
          commitLayerChange(host, active.command, next, layerMetadata(host), true, {
            kind: active.command === 'LAYDEL' ? 'delete' : 'merge',
            names: active.names ?? [],
            ...(active.target ? { target: active.target } : {}),
          });
        }
        this.publish(null);
      } else if (active.stage === 'byblock') {
        this.publish({
          ...active,
          byblock: !['N', 'NO', '아니오'].includes(key),
          stage: 'blocks',
          inputMode: 'keyword',
        });
      } else if (active.stage === 'blocks') {
        const state = liveLayerState(host),
          ids = new Set(active.ids),
          include = !['N', 'NO', '아니오'].includes(key);
        if (include)
          for (const block of state.clipboardBlocks ?? [])
            if (block.entityIds.some((id) => ids.has(id)))
              block.entityIds.forEach((id) => ids.add(id));
        const mode = host.sysvars.getNumber('SETBYLAYERMODE');
        const entities = state.entities.map((entity) => {
          if (!ids.has(entity.id) || findLayer(state, entity.layer)?.locked) return entity;
          const next = { ...entity };
          if (mode & 1 && (active.byblock || next.aci !== 0)) {
            next.aci = 256;
            delete next.trueColor;
          }
          if (mode & 2 && (active.byblock || next.linetype?.toUpperCase() !== 'BYBLOCK'))
            next.linetype = 'BYLAYER';
          if (mode & 4 && (active.byblock || next.lineweight !== -2)) next.lineweight = -1;
          if (mode & 8) next.material = 'ByLayer';
          if (mode & 16) next.plotStyle = 'ByLayer';
          if (mode & 128 && (active.byblock || next.transparency !== 'byblock'))
            next.transparency = 'bylayer';
          return next;
        });
        commitLayerChange(host, active.command, { ...state, entities }, layerMetadata(host), true, {
          kind: 'setbylayer',
          ids: [...ids],
          mode,
          byblock: active.byblock ?? true,
          includeBlocks: include,
        });
        this.publish(null);
      } else if (active.stage === 'offset') {
        this.copy.submit(value);
      }
    } catch (error) {
      host.print(error instanceof Error ? error.message : String(error));
    }
    return true;
  }
  get prompt(): string | null {
    const s = this.snapshot;
    if (!s) return null;
    if (s.stage === 'cli') return this.cli.step?.prompt ?? null;
    if (s.stage === 'target')
      return this.text(
        '대상 도면층의 객체 선택 또는 [이름(N)]:',
        'Select object on destination layer or [Name]:',
      );
    if (s.stage === 'names') return this.text('도면층 이름 입력:', 'Enter layer name:');
    if (s.stage === 'confirm')
      return this.text(
        '도면층과 해당 객체를 변경하시겠습니까? [예(Y)/아니오(N)] <아니오>:',
        'Change layers and their objects? [Yes/No] <No>:',
      );
    if (s.stage === 'settings')
      return this.text(
        '분리하지 않을 도면층 설정 [끄기(O)/잠금 및 페이드(L)] <잠금 및 페이드>:',
        'Enter setting for layers not isolated [Off/Lock and fade] <Lock and fade>:',
      );
    if (s.stage === 'fade')
      return this.text(
        '잠긴 도면층 페이드 값 입력(0-90) <50>:',
        'Enter locked layer fading value (0-90) <50>:',
      );
    if (s.stage === 'offset') return this.copy.prompt;
    if (s.stage === 'byblock')
      return this.text(
        'ByBlock을 ByLayer로 변경하시겠습니까? [예(Y)/아니오(N)] <예>:',
        'Change ByBlock to ByLayer? [Yes/No] <Yes>:',
      );
    if (s.stage === 'blocks')
      return this.text(
        '블록을 포함하시겠습니까? [예(Y)/아니오(N)] <예>:',
        'Include blocks? [Yes/No] <Yes>:',
      );
    return s.command === 'LAYISO'
      ? this.text(
          '분리할 도면층의 객체 선택 또는 [설정(S)]:',
          'Select objects on layer(s) to be isolated or [Settings]:',
        )
      : this.text('객체 선택 또는 [이름(N)]:', 'Select objects or [Name]:');
  }
}
function metaIsolated(host: LayerHost): boolean {
  return !!layerMetadata(host).isolated;
}
