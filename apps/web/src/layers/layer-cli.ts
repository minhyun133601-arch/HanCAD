import { options, keyword, optionPrompt, colorPatch, patch } from './layer-cli-values';
import type { Option } from './layer-cli-values';
import type { PromptStep } from '@hancad/commands';
import type { LegacyCadState } from '@hancad/legacy-bridge';
import {
  changeLayerField,
  changeLayers,
  createLayers,
  renameLayer,
  setCurrentLayer,
} from './layer-model';
import { captureLayerState, restoreLayerState } from './layer-states';
import type { LayerMetadata } from './layer-states';

export interface LayerCliResult {
  state: LegacyCadState;
  metadata: LayerMetadata;
  step?: PromptStep;
  messages: string[];
  restoredState?: boolean;
  fileAction?: { type: 'import' | 'export'; name: string };
}
/** Pure replay makes keyboard, macros, scripts and tests use exactly the same prompt sequence. */
export function walkLayerCli(
  values: readonly string[],
  initial: LegacyCadState,
  metadata: LayerMetadata,
  ko: boolean,
): LayerCliResult {
  let state = structuredClone(initial),
    option: Option | undefined;
  const meta = structuredClone(metadata);
  let parameter: string | undefined, suboption: string | undefined, notice: string | undefined;
  const messages: string[] = [];
  let fileAction: LayerCliResult['fileAction'];
  let restoredState = false;
  for (const value of values) {
    notice = undefined;
    try {
      if (!option) {
        if (!value.trim())
          return {
            state,
            metadata: meta,
            messages,
            ...(fileAction ? { fileAction } : {}),
            ...(restoredState ? { restoredState: true } : {}),
          };
        option = options[keyword(value)];
        if (!option)
          notice = ko
            ? '유효한 옵션 키워드를 지정해야 합니다.'
            : 'Requires a valid option keyword.';
        continue;
      }
      if (option === 'state') {
        if (!suboption) {
          if (!value.trim()) {
            option = undefined;
            continue;
          }
          const k = keyword(value);
          suboption = (
            {
              S: 'save',
              SAVE: 'save',
              R: 'restore',
              RESTORE: 'restore',
              D: 'delete',
              DELETE: 'delete',
              N: 'rename',
              NAME: 'rename',
              I: 'import',
              IMPORT: 'import',
              EX: 'export',
              EXPORT: 'export',
              '?': 'list',
              E: 'edit',
              EDIT: 'edit',
            } as Record<string, string>
          )[k];
          if (!suboption)
            throw new Error('유효한 상태 옵션이 필요합니다. / Invalid layer state option.');
          continue;
        }
        const name = value.trim();
        if (suboption === 'save') {
          if (!name) throw new Error('상태 이름을 입력하십시오. / Enter state name.');
          meta.states = [
            ...meta.states.filter((saved) => saved.name !== name),
            captureLayerState(state, name),
          ];
        } else if (suboption === 'restore') {
          const saved = meta.states.find((saved) => saved.name === name);
          if (!saved) throw new Error('도면층 상태를 찾을 수 없습니다. / Layer state not found.');
          state = restoreLayerState(state, saved);
          restoredState = true;
        } else if (suboption === 'delete')
          meta.states = meta.states.filter((saved) => saved.name !== name);
        else if (suboption === 'list')
          messages.push(meta.states.map((saved) => saved.name).join('\n'));
        else if (suboption === 'rename' || suboption === 'edit') {
          if (parameter === undefined) {
            parameter = name;
            continue;
          }
          const saved = meta.states.find((saved) => saved.name === parameter);
          if (!saved) throw new Error('도면층 상태를 찾을 수 없습니다. / Layer state not found.');
          meta.states = meta.states.map((entry) =>
            entry === saved
              ? suboption === 'rename'
                ? { ...saved, name }
                : captureLayerState(state, saved.name, name)
              : entry,
          );
        } else fileAction = { type: suboption === 'import' ? 'import' : 'export', name };
        parameter = undefined;
        suboption = undefined;
        continue;
      }
      if (option === 'rename') {
        if (parameter === undefined) {
          parameter = value;
          continue;
        }
        state = renameLayer(state, parameter, value);
      } else if (
        [
          'color',
          'ltype',
          'lweight',
          'transparency',
          'material',
          'plot',
          'pstyle',
          'description',
          'xref',
        ].includes(option)
      ) {
        if (parameter === undefined) {
          if (
            ['color', 'lweight', 'transparency', 'plot'].includes(option) &&
            !(option === 'color' && ['T', 'TRUECOLOR', 'CO', 'COLORBOOK'].includes(keyword(value)))
          )
            patch(state, option, value, state.settings.layer);
          parameter = value;
          continue;
        }
        if (option === 'color' && ['T', 'TRUECOLOR'].includes(keyword(parameter))) {
          colorPatch(value);
          parameter = value;
          continue;
        }
        if (option === 'color' && ['CO', 'COLORBOOK'].includes(keyword(parameter)))
          throw new Error(
            '색상표 색상은 아직 지원하지 않습니다. / Color book colors are not available yet.',
          );
        if (
          option === 'ltype' &&
          ![
            'CONTINUOUS',
            'BYLAYER',
            'BYBLOCK',
            ...(state.linetypes?.map((item) => keyword(item.name)) ?? []),
          ].includes(keyword(parameter))
        )
          throw new Error('선종류를 먼저 로드하십시오. / Load the linetype first.');
        if (option === 'xref') {
          messages.push(
            ko
              ? '외부 참조 도면층 재지정은 참조 도면을 연결한 후 사용할 수 있습니다.'
              : 'Xref layer overrides require an attached reference drawing.',
          );
        } else state = patch(state, option, parameter, value);
      } else if (option === 'make')
        state = setCurrentLayer(
          createLayers(state, value || state.settings.layer),
          value || state.settings.layer,
        );
      else if (option === 'set') state = setCurrentLayer(state, value || state.settings.layer);
      else if (option === 'new') state = createLayers(state, value);
      else if (option === 'list')
        messages.push(
          state.layers
            .filter(
              (layer) =>
                value === '' ||
                value === '*' ||
                layer.name.toUpperCase().includes(value.toUpperCase().replace(/\*/g, '')),
            )
            .map(
              (layer) =>
                `${layer.name}  ${layer.visible ? 'On' : 'Off'} ${layer.frozen ? 'Frozen' : 'Thawed'} ${layer.locked ? 'Locked' : 'Unlocked'}  ${layer.aci ?? 7}  ${layer.linetype ?? 'CONTINUOUS'}  ${layer.lineweight ?? -3}`,
            )
            .join('\n'),
        );
      else if (option === 'reconcile')
        state = changeLayers(state, value || '*', (layer) => ({ ...layer, unreconciled: false }));
      else {
        const field =
          option === 'on' || option === 'off'
            ? 'visible'
            : option === 'freeze' || option === 'thaw'
              ? 'frozen'
              : 'locked';
        state = changeLayerField(state, value, field, ['on', 'freeze', 'lock'].includes(option));
      }
      option = undefined;
      parameter = undefined;
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
    }
  }
  let prompt = optionPrompt(ko),
    text = false;
  if (option === 'state') {
    prompt = !suboption
      ? ko
        ? '옵션 입력 [?/저장(S)/복원(R)/편집(E)/이름(N)/삭제(D)/가져오기(I)/내보내기(EX)]:'
        : 'Enter an option [?/Save/Restore/Edit/Name/Delete/Import/EXport]:'
      : ko
        ? `도면층 상태 ${suboption} 이름 입력:`
        : `Enter layer state ${suboption} name:`;
    text = !!suboption;
  } else if (option) {
    text =
      !['color', 'lweight', 'transparency', 'plot', 'xref'].includes(option) ||
      parameter !== undefined;
    if (option === 'make')
      prompt = ko
        ? `새 도면층 이름 입력(현재 도면층이 됨) <${state.settings.layer}>:`
        : `Enter name for new layer (becomes the current layer) <${state.settings.layer}>:`;
    else if (option === 'set')
      prompt = ko
        ? `현재 도면층으로 설정할 이름 입력 <${state.settings.layer}>:`
        : `Enter layer name to make current <${state.settings.layer}>:`;
    else if (option === 'new')
      prompt = ko ? '새 도면층에 대한 이름 리스트 입력:' : 'Enter name list for new layer(s):';
    else if (option === 'rename')
      prompt =
        parameter === undefined
          ? ko
            ? '이름을 바꿀 도면층 이름 입력:'
            : 'Enter old layer name:'
          : ko
            ? '새 도면층 이름 입력:'
            : 'Enter new layer name:';
    else if (
      [
        'color',
        'ltype',
        'lweight',
        'transparency',
        'material',
        'plot',
        'pstyle',
        'description',
        'xref',
      ].includes(option) &&
      parameter === undefined
    )
      prompt = ko
        ? `${option === 'color' ? '새 색상 [트루컬러(T)/색상표(CO)]' : option === 'transparency' ? '투명도 값 입력(0-90)' : option === 'description' ? '도면층 설명 입력' : option === 'plot' ? '플롯 설정 입력 [플롯(P)/플롯 안 함(N)]' : `${option} 값 입력`}:`
        : `${option === 'color' ? 'New color [Truecolor/COlorbook]' : `Enter ${option} value`}:`;
    else
      prompt = ko
        ? `도면층 이름 리스트 입력 <${state.settings.layer}>:`
        : `Enter name list of layer(s) <${state.settings.layer}>:`;
  }
  const step: PromptStep = {
    prompt,
    ...(text ? { text: true } : {}),
    ...(notice ? { notice } : {}),
  };
  return {
    state,
    metadata: meta,
    step,
    messages,
    ...(fileAction ? { fileAction } : {}),
    ...(restoredState ? { restoredState: true } : {}),
  };
}
