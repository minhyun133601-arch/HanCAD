import type { CommandContext, CommandDefinition, PromptStep } from '@hancad/commands';
import { parseLin } from '@hancad/render';
import { parseColorValue } from './color-values';
import {
  LinetypeLibrary,
  loadedLinetypes,
  loadLinetypes,
  matchesLinetype,
} from './linetype-library';
import type { StyleDialogActions, StyleManagerHost } from './types';

const label = (ko: boolean, korean: string, english: string): string => (ko ? korean : english);
const actionName = (value: string): string => {
  const upper = value.toUpperCase().replace(/^_/, '');
  return ({ L: 'LOAD', S: 'SET', C: 'CREATE' } as Record<string, string>)[upper] ?? upper;
};
function colorPrompt(
  values: readonly string[],
  context: { locale: string; sysvars: StyleManagerHost['sysvars'] },
): PromptStep | undefined {
  const ko = context.locale === 'ko-KR';
  if (!values.length)
    return {
      prompt: label(
        ko,
        `새 객체의 색상 입력 [트루컬러(T)/색상표(CO)] <${String(context.sysvars.get('CECOLOR'))}>:`,
        `Enter new color [Truecolor/COlorbook] <${String(context.sysvars.get('CECOLOR'))}>:`,
      ),
    };
  const first = values[0]?.toUpperCase();
  if ((first === 'T' || first === 'TRUECOLOR') && values.length === 1)
    return {
      prompt: label(
        ko,
        '빨간색,초록색,파란색 값 입력 (0-255):',
        'Enter Red,Green,Blue values (0-255):',
      ),
    };
  return undefined;
}
function linetypePrompt(values: readonly string[], ko: boolean): PromptStep | undefined {
  let cursor = 0;
  while (cursor < values.length) {
    const action = actionName(values[cursor++] ?? '');
    if (!action) return undefined;
    const count = action === 'CREATE' ? 4 : action === 'LOAD' ? 2 : 1;
    const answers = values.slice(cursor, cursor + count);
    if (answers.length < count) {
      const prompts =
        action === 'CREATE'
          ? [
              ['작성할 선종류 이름 입력:', 'Enter name of linetype to create:'],
              [
                '선종류 파일 이름 입력 <hancadiso.lin>:',
                'Enter linetype file name <hancadiso.lin>:',
              ],
              ['선종류 설명 입력:', 'Enter linetype description:'],
              ['패턴 정의 입력 (A):', 'Enter linetype pattern (A):'],
            ]
          : action === 'LOAD'
            ? [
                ['로드할 선종류 입력:', 'Enter linetype(s) to load:'],
                [
                  '선종류 파일 이름 입력 <hancadiso.lin>:',
                  'Enter linetype file name <hancadiso.lin>:',
                ],
              ]
            : [
                [
                  action === '?'
                    ? '리스트할 선종류 입력 <*>:'
                    : '현재 선종류 이름 입력 또는 [?] <ByLayer>:',
                  action === '?'
                    ? 'Enter linetype(s) to list <*>:'
                    : 'Enter current linetype name or [?] <ByLayer>:',
                ],
              ];
      const prompt = prompts[answers.length]!;
      return { prompt: (ko ? prompt[0] : prompt[1])!, text: true };
    }
    cursor += count;
  }
  return {
    prompt: label(
      ko,
      '옵션 입력 [?/작성(C)/로드(L)/설정(S)]:',
      'Enter an option [?/Create/Load/Set]:',
    ),
  };
}
function downloadLin(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function registerStyleCommands(
  host: StyleManagerHost,
  dialogs: StyleDialogActions,
  library = new LinetypeLibrary(host.readSupportFile),
): void {
  const command = (
    name: string,
    execute: NonNullable<CommandDefinition['execute']>,
    nextPrompt?: CommandDefinition['nextPrompt'],
  ): void => {
    host.registry.register({
      name,
      displayName: { 'ko-KR': name, 'en-US': name },
      description: {
        'ko-KR': '새 객체의 표시 특성을 관리합니다.',
        'en-US': 'Manages display properties for new objects.',
      },
      execute,
      ...(nextPrompt ? { nextPrompt } : {}),
    });
  };
  command(
    'COLOR',
    (context) => {
      if (!context.prefixes?.commandLine && !context.input.remaining) {
        dialogs.color();
        return;
      }
      const first = String(context.input.take() ?? '');
      if (!first) return;
      const option = first.toUpperCase();
      if (option === 'CO' || option === 'COLORBOOK') {
        context.print(
          label(
            context.locale === 'ko-KR',
            '색상표는 아직 지원되지 않습니다.',
            'Color Books are not supported yet.',
          ),
        );
        return;
      }
      const input =
        option === 'T' || option === 'TRUECOLOR'
          ? `RGB:${String(context.input.take() ?? '')}`
          : first;
      try {
        context.sysvars.set('CECOLOR', parseColorValue(input));
      } catch {
        context.print(
          label(
            context.locale === 'ko-KR',
            '유효한 색상 값을 입력하십시오.',
            'Enter a valid color value.',
          ),
        );
      }
    },
    (values, state) => (state.prefixes.commandLine ? colorPrompt(values, state) : undefined),
  );
  command('LWEIGHT', () => dialogs.lineweight());
  command(
    'LINETYPE',
    async (context) => {
      if (!context.prefixes?.commandLine && !context.input.remaining) {
        dialogs.linetype();
        return;
      }
      const own = !context.database.undoGroupActive;
      if (own) context.database.beginUndoGroup();
      try {
        while (context.input.remaining) {
          const action = actionName(String(context.input.take() ?? ''));
          if (!action) break;
          const name = String(context.input.take() ?? '');
          if (action === '?') {
            for (const definition of loadedLinetypes(context.database).filter((item) =>
              matchesLinetype(item.name, name || '*'),
            ))
              context.print(`${definition.name}  ${definition.description}`);
          } else if (action === 'LOAD') {
            const file = String(context.input.take() ?? '');
            try {
              const definitions = (await library.read(file)).filter((item) =>
                matchesLinetype(item.name, name),
              );
              if (!definitions.length) printMissing(context, name);
              else loadLinetypes(context.database, definitions);
            } catch {
              context.print(
                label(
                  context.locale === 'ko-KR',
                  '선종류 파일을 찾거나 읽을 수 없습니다.',
                  'Cannot find or read the linetype file.',
                ),
              );
            }
          } else if (action === 'SET') {
            const selected = name || 'BYLAYER';
            if (selected === '?') {
              for (const definition of loadedLinetypes(context.database))
                context.print(definition.name);
              continue;
            }
            const found = loadedLinetypes(context.database).find(
              (item) => item.name.toUpperCase() === selected.toUpperCase(),
            );
            if (found) context.sysvars.set('CELTYPE', found.name);
            else {
              const builtin = (await library.read('')).find(
                (item) => item.name.toUpperCase() === selected.toUpperCase(),
              );
              if (!builtin) printMissing(context, selected);
              else
                context.database.atomic('LINETYPE', () => {
                  loadLinetypes(context.database, [builtin]);
                  context.sysvars.set('CELTYPE', builtin.name);
                });
            }
          } else if (action === 'CREATE') {
            const file = String(context.input.take() ?? '') || 'custom.lin';
            const description = String(context.input.take() ?? '').slice(0, 47);
            const pattern = String(context.input.take() ?? '');
            try {
              if (!name || /[<>/\\":;?*|=,`\r\n]/.test(name) || pattern.includes('['))
                throw new Error('Invalid simple linetype.');
              const text = `*${name},${description}\n${/^A,/i.test(pattern) ? pattern : `A,${pattern}`}\n`;
              parseLin(text);
              const appended = library.append(file, text);
              if (host.writeSupportFile) await host.writeSupportFile(file, appended);
              else downloadLin(file, appended);
            } catch {
              context.print(
                label(
                  context.locale === 'ko-KR',
                  '선종류 정의가 올바르지 않습니다.',
                  'Invalid linetype definition.',
                ),
              );
            }
          } else
            context.print(
              label(
                context.locale === 'ko-KR',
                '유효한 옵션 키워드가 필요합니다.',
                'Invalid option keyword.',
              ),
            );
        }
      } finally {
        if (own && context.database.undoGroupActive) context.database.endUndoGroup();
      }
    },
    (values, state) =>
      state.prefixes.commandLine ? linetypePrompt(values, state.locale === 'ko-KR') : undefined,
  );
}
function printMissing(context: CommandContext, name: string): void {
  context.print(
    label(
      context.locale === 'ko-KR',
      `선종류 "${name}"을(를) 찾을 수 없습니다.`,
      `Linetype "${name}" not found.`,
    ),
  );
}
