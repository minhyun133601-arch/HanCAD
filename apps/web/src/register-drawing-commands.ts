import type { CommandRegistry } from '@hancad/commands';
import { drawFactories } from '@hancad/draft';
import type { DraftTool } from '@hancad/draft';
import { getMessages } from '@hancad/ui';
import type { MessageKey } from '@hancad/ui';

/** Chrome, aliases and prefixed names execute the same coroutine factories. */
export function registerDrawingCommands(
  registry: CommandRegistry,
  begin: (tool: DraftTool, repeat?: boolean) => void,
): void {
  const ko = getMessages('ko-KR'),
    en = getMessages('en-US');
  const names: readonly [DraftTool, MessageKey][] = [
    ['LINE', 'line'],
    ['CIRCLE', 'circle'],
    ['RECTANG', 'rectangle'],
    ['PLINE', 'polyline'],
  ];
  for (const [name, label] of names)
    registry.register({
      name,
      displayName: { 'ko-KR': ko[label], 'en-US': en[label] },
      description: { 'ko-KR': ko.draftingUsage, 'en-US': en.draftingUsage },
      execute: () => begin(name),
    });
  for (const name of Object.keys(drawFactories))
    if (
      !name.startsWith('-') &&
      name !== 'ARRAY' &&
      name !== 'OVERKILL' &&
      !names.some(([tool]) => tool === name)
    )
      registry.register({
        name,
        displayName: { 'ko-KR': name, 'en-US': name },
        description: { 'ko-KR': ko.draftingUsage, 'en-US': en.draftingUsage },
        execute: () => begin(name as DraftTool),
      });
  registry.register({
    name: 'ARRAY',
    displayName: { 'ko-KR': '배열', 'en-US': 'Array' },
    description: {
      'ko-KR': '객체 사본을 배열합니다.',
      'en-US': 'Creates an array of object copies.',
    },
    execute: (context) => begin(context.prefixes?.commandLine ? '-ARRAY' : 'ARRAY'),
  });
  registry.register({
    name: 'OVERKILL',
    displayName: { 'ko-KR': '중복 객체 삭제', 'en-US': 'Delete Duplicate Objects' },
    description: {
      'ko-KR': '중복되거나 겹치는 객체를 제거합니다.',
      'en-US': 'Removes duplicate or overlapping objects.',
    },
    execute: (context) => begin(context.prefixes?.commandLine ? '-OVERKILL' : 'OVERKILL'),
  });
  registry.register({
    name: 'MULTIPLE',
    displayName: { 'ko-KR': '다중', 'en-US': 'Multiple' },
    description: { 'ko-KR': '명령을 반복합니다.', 'en-US': 'Repeats a command.' },
    nextPrompt: (values, context) =>
      values.length
        ? undefined
        : {
            prompt:
              context.locale === 'ko-KR'
                ? '반복할 명령 이름 입력:'
                : 'Enter command name to repeat:',
          },
    execute: (context) => {
      const name = context.input.requireString(),
        resolved = registry.resolve(name),
        tool = resolved?.canonicalName as DraftTool | undefined;
      if (!tool || !drawFactories[tool]) {
        context.print(
          context.locale === 'ko-KR'
            ? `알 수 없거나 아직 반복을 지원하지 않는 명령 "${name}". 도움말을 보려면 F1 키를 누르십시오.`
            : `Unknown or unsupported repeated command "${name}". Press F1 for help.`,
        );
        return;
      }
      begin(tool, true);
    },
  });
}
