import type { CommandRegistry } from '@hancad/commands';
import type { GroupTool } from '@hancad/draft';
import type { SelectionDialogKind } from './SelectionDialogs';

export type SelectionCommand = 'SELECT' | 'ERASE' | 'SELECTSIMILAR' | GroupTool;
export function registerSelectionCommands(
  registry: CommandRegistry,
  actions: {
    begin: (command: SelectionCommand) => void;
    selectAll: () => void;
    openSettings: () => void;
    openDialog: (kind: SelectionDialogKind) => void;
  },
): void {
  registry.register({
    name: 'DDGRIPS',
    displayName: { 'ko-KR': '그립 옵션', 'en-US': 'Grip Options' },
    description: {
      'ko-KR': '옵션 대화상자의 선택 탭을 표시합니다.',
      'en-US': 'Displays the Selection tab of the Options dialog box.',
    },
    execute: actions.openSettings,
  });
  registry.register({
    name: 'AI_SELALL',
    displayName: { 'ko-KR': '모두 선택', 'en-US': 'Select All' },
    description: {
      'ko-KR': '모든 편집 가능한 객체를 선택합니다.',
      'en-US': 'Select all editable objects.',
    },
    execute: actions.selectAll,
  });
  for (const name of ['SELECT', 'ERASE', 'SELECTSIMILAR', 'GROUP', 'GROUPEDIT', 'UNGROUP'] as const)
    registry.register({
      name,
      displayName: { 'ko-KR': name, 'en-US': name },
      description: {
        'ko-KR': '객체를 선택하고 선택 세트를 관리합니다.',
        'en-US': 'Select objects and manage selection sets.',
      },
      execute: (context) =>
        actions.begin(name === 'GROUP' && context.prefixes?.commandLine ? '-GROUP' : name),
    });
  for (const [name, kind] of [
    ['QSELECT', 'qselect'],
    ['FILTER', 'filter'],
  ] as const)
    registry.register({
      name,
      displayName: { 'ko-KR': name === 'QSELECT' ? '신속 선택' : '객체 선택 필터', 'en-US': name },
      description: {
        'ko-KR': '특성을 기준으로 객체를 선택합니다.',
        'en-US': 'Select objects by property.',
      },
      execute: () => actions.openDialog(kind),
    });
}
