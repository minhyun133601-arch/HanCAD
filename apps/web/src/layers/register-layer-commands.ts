import type { CommandDefinition } from '@hancad/commands';
import { InputCancelled } from '@hancad/editor';
import { commitLayerChange, layerMetadata, liveLayerState } from './layer-host';
import type { LayerHost } from './layer-host';
import { captureLayerState } from './layer-states';
import { walkLayerCli } from './layer-cli';
import { recordLayerNotification } from '../layer-notifications';
import { runQueuedLayerTool } from './queued-layer-tools';

const commands = [
  'LAYISO',
  'LAYUNISO',
  'LAYOFF',
  'LAYON',
  'LAYFRZ',
  'LAYTHW',
  'LAYLCK',
  'LAYULK',
  'LAYMCUR',
  'LAYMCH',
  'LAYCUR',
  'LAYMRG',
  'LAYDEL',
  'COPYTOLAYER',
  'SETBYLAYER',
  'LAYERP',
] as const;
const blank = { 'ko-KR': '', 'en-US': '' } as const;

export function registerLayerCommands(actions: {
  host: () => LayerHost;
  begin: (name: string) => void;
  setPanelTab: (tab: 'layers' | 'states') => void;
  setWalk: (value: boolean) => void;
  setOpen: (value: boolean) => void;
  close: () => void;
  openImport: () => void;
  exportState: (name: string) => void;
}): void {
  const definition: CommandDefinition = {
    name: 'LAYER',
    displayName: blank,
    description: blank,
    nextPrompt: (values, state) =>
      state.prefixes.transparent && state.prefixes.commandLine
        ? walkLayerCli(
            values,
            liveLayerState(actions.host()),
            layerMetadata(actions.host()),
            state.locale === 'ko-KR',
          ).step
        : undefined,
    execute: (context) => {
      if (!context.prefixes?.commandLine) {
        actions.setPanelTab('layers');
        actions.setWalk(false);
        actions.setOpen(true);
        return;
      }
      if (!context.input.remaining) {
        actions.begin('LAYER');
        return;
      }
      const values: string[] = [];
      while (context.input.remaining) values.push(String(context.input.take() ?? ''));
      const result = walkLayerCli(
        values,
        liveLayerState(actions.host()),
        layerMetadata(actions.host()),
        context.locale === 'ko-KR',
      );
      if (result.step) throw new InputCancelled();
      if (
        JSON.stringify(result.state) !== JSON.stringify(liveLayerState(actions.host())) ||
        JSON.stringify(result.metadata) !== JSON.stringify(layerMetadata(actions.host()))
      )
        commitLayerChange(actions.host(), 'LAYER', result.state, result.metadata);
      for (const message of result.messages) context.print(message);
      if (result.restoredState)
        recordLayerNotification(actions.host().database, liveLayerState(actions.host()), 'restore');
      if (result.fileAction?.type === 'import') actions.openImport();
      if (result.fileAction?.type === 'export') actions.exportState(result.fileAction.name);
    },
  };
  actions.host().registry.register(definition);
  for (const name of commands)
    actions.host().registry.register({
      name,
      displayName: blank,
      description: blank,
      execute: (context) =>
        context.input.remaining
          ? runQueuedLayerTool(name, actions.host(), context.input, context.print)
          : actions.begin(name),
    });
  for (const name of ['LAYWALK', 'LAYERSTATE', 'LAYERCLOSE'] as const)
    actions.host().registry.register({
      name,
      displayName: blank,
      description: blank,
      execute: () => {
        if (name === 'LAYERCLOSE') actions.close();
        else {
          actions.setPanelTab(name === 'LAYERSTATE' ? 'states' : 'layers');
          actions.setOpen(true);
          actions.setWalk(name === 'LAYWALK');
        }
      },
    });
  actions.host().registry.register({
    name: 'LAYERSTATESAVE',
    displayName: blank,
    description: blank,
    nextPrompt: (values, state) =>
      values.length || !state.prefixes.commandLine
        ? undefined
        : {
            prompt: actions.host().korean
              ? '저장할 새 도면층 상태 이름 입력:'
              : 'Enter name of new layer state to save:',
            text: true,
          },
    execute: (context) => {
      if (!context.prefixes?.commandLine) {
        actions.setPanelTab('states');
        actions.setOpen(true);
        actions.setWalk(false);
        return;
      }
      const name = String(context.input.take() ?? '').trim();
      if (!name) return;
      const host = actions.host(),
        meta = layerMetadata(host);
      meta.states = [
        ...meta.states.filter((saved) => saved.name !== name),
        captureLayerState(liveLayerState(host), name),
      ];
      commitLayerChange(host, 'LAYERSTATESAVE', liveLayerState(host), meta, false);
    },
  });
  actions.host().registry.register({
    name: 'LAYERPMODE',
    displayName: blank,
    description: blank,
    nextPrompt: (values) =>
      values.length
        ? undefined
        : {
            prompt: actions.host().korean
              ? '도면층 이전 모드 입력 [켜기(ON)/끄기(OFF)] <켜기>:'
              : 'Enter layer previous mode [ON/OFF] <ON>:',
          },
    execute: (context) => {
      const value = String(context.input.take() ?? 'ON').toUpperCase();
      if (!['ON', 'OFF', ''].includes(value)) {
        context.print(
          context.locale === 'ko-KR' ? 'ON 또는 OFF를 입력하십시오.' : 'Enter ON or OFF.',
        );
        return;
      }
      context.database.transaction('LAYERPMODE', (tx) =>
        tx.setVariable('HANCAD_LAYERPMODE', value === 'OFF' ? 0 : 1),
      );
    },
  });
}
