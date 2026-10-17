import { coordinateSettings, parseDraftNumber } from '@hancad/draft';
import type { CommandInput } from '@hancad/editor';
import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { SysvarValue, SystemVariables } from '@hancad/sysvars';
import { draftingCommandPrompt } from './drafting-command-prompts';
import type { DraftingCommandName, DraftingStage } from './drafting-command-prompts';
import type { CommandDefinition, CommandLocale, PromptStep } from './types';

const names: readonly DraftingCommandName[] = ['GRID', 'SNAP', 'ORTHO', 'ISOPLANE', 'ISODRAFT'];
const keyword = (text: string) => text.trim().replace(/^_+/, '').toUpperCase();
function option(text: string, options: readonly string[]): string | undefined {
  const value = keyword(text);
  if (!value) return;
  const candidates = options.filter((word) => word.toUpperCase().startsWith(value));
  return candidates.length === 1 ? candidates[0] : undefined;
}
function yesNo(text: string): boolean | undefined {
  const word = keyword(text);
  if (word === '예' || option(word, ['Yes']) !== undefined) return true;
  if (word === '아니오' || option(word, ['No']) !== undefined) return false;
  return;
}
interface WalkResult {
  changes: Map<string, SysvarValue>;
  step?: PromptStep;
}

/** Replay is pure: a prompt query never changes settings or creates undo records. */
function walk(
  name: DraftingCommandName,
  values: readonly string[],
  vars: SystemVariables,
  locale: CommandLocale,
): WalkResult {
  const changes = new Map<string, SysvarValue>();
  const get = (key: string): SysvarValue => changes.get(key) ?? vars.get(key);
  const number = (key: string) => Number(get(key));
  const pair = (key: string): [number, number] => {
    const value = get(key);
    return Array.isArray(value) ? [Number(value[0]), Number(value[1])] : [0, 0];
  };
  const set = (key: string, value: SysvarValue) => {
    changes.set(key, value);
  };
  const bit = (mask: number, enabled: boolean) =>
    set('GRIDDISPLAY', enabled ? number('GRIDDISPLAY') | mask : number('GRIDDISPLAY') & ~mask);
  const unit = name === 'GRID' ? 'GRIDUNIT' : 'SNAPUNIT';
  const invalid =
    locale === 'ko-KR'
      ? '유효한 옵션 키워드 또는 값을 지정해야 합니다.'
      : 'Requires a valid option keyword or value.';
  let stage: DraftingStage = 'main',
    notice: string | undefined,
    done = false;
  const spacing = (text: string, axis: 0 | 1): number | undefined => {
    if (!text.trim()) return pair(unit)[axis];
    const multiple = name === 'GRID' && /x$/i.test(text.trim());
    const value = parseDraftNumber(
      multiple ? text.trim().slice(0, -1) : text,
      coordinateSettings(get),
    );
    return value === undefined || value < 0 || (name === 'SNAP' && value === 0)
      ? undefined
      : value * (multiple ? pair('SNAPUNIT')[axis] : 1);
  };
  const setSpacing = (x: number, y: number) => {
    set(unit, [x, y]);
    set(name === 'GRID' ? 'GRIDMODE' : 'SNAPMODE', 1);
    done = true;
  };
  for (const text of values) {
    if (done) break;
    notice = undefined;
    const word = keyword(text);
    if (stage === 'main' && (name === 'ORTHO' || name === 'ISOPLANE' || name === 'ISODRAFT')) {
      if (name === 'ORTHO') {
        const selected = option(word, ['ON', 'OFF']);
        if (word && !selected) {
          notice = invalid;
          continue;
        }
        const enabled = selected ? selected === 'ON' : number('ORTHOMODE') !== 0;
        set('ORTHOMODE', enabled ? 1 : 0);
        if (enabled) set('AUTOSNAP', number('AUTOSNAP') & ~8);
      } else {
        const selected = option(
          word.replace(/^ISOPLANE\s*/, ''),
          name === 'ISODRAFT' ? ['Orthographic', 'Left', 'Top', 'Right'] : ['Left', 'Top', 'Right'],
        );
        if (word && !selected) {
          notice = invalid;
          continue;
        }
        if (selected === 'Orthographic') set('SNAPSTYL', 0);
        else if (selected) {
          set('SNAPISOPAIR', ['Left', 'Top', 'Right'].indexOf(selected));
          if (name === 'ISODRAFT') {
            set('SNAPSTYL', 1);
            set('SNAPTYPE', 0);
          }
        }
      }
      done = true;
      continue;
    }
    if (stage === 'aspect-x' || stage === 'aspect-y' || stage === 'iso-spacing') {
      const axis = stage === 'aspect-x' ? 0 : 1;
      const value = spacing(text, axis);
      if (value === undefined) {
        notice = invalid;
        continue;
      }
      const current = pair(unit);
      if (stage === 'aspect-x') {
        set(unit, [value, current[1]]);
        stage = 'aspect-y';
      } else if (stage === 'iso-spacing') setSpacing(value, value);
      else setSpacing(current[0], value);
      continue;
    }
    if (['legacy', 'adaptive', 'subdivide', 'limits', 'follow'].includes(stage)) {
      const mask =
        stage === 'adaptive' ? 2 : stage === 'subdivide' ? 4 : stage === 'limits' ? 1 : 8;
      const answer = word
        ? yesNo(text)
        : stage === 'legacy'
          ? number('SNAPGRIDLEGACY') !== 0
          : Boolean(number('GRIDDISPLAY') & mask);
      if (answer === undefined) {
        notice = invalid;
        continue;
      }
      if (stage === 'legacy') set('SNAPGRIDLEGACY', answer ? 1 : 0);
      else bit(mask, answer);
      if (stage === 'adaptive' && answer) stage = 'subdivide';
      else done = true;
      continue;
    }
    if (stage === 'major') {
      const value = word ? Number(text) : number('GRIDMAJOR');
      if (!Number.isInteger(value) || value < 1 || value > 100) {
        notice = invalid;
        continue;
      }
      set('GRIDMAJOR', value);
      done = true;
      continue;
    }
    if (stage === 'style') {
      const selected = word
        ? option(word, ['Standard', 'Isometric'])
        : number('SNAPSTYL')
          ? 'Isometric'
          : 'Standard';
      if (!selected) {
        notice = invalid;
        continue;
      }
      set('SNAPSTYL', selected === 'Isometric' ? 1 : 0);
      stage = selected === 'Isometric' ? 'iso-spacing' : 'style-spacing';
      continue;
    }
    if (stage === 'type') {
      const selected = word
        ? option(word, ['Polar', 'Grid'])
        : number('SNAPTYPE')
          ? 'Polar'
          : 'Grid';
      if (!selected) {
        notice = invalid;
        continue;
      }
      set('SNAPTYPE', selected === 'Polar' ? 1 : 0);
      done = true;
      continue;
    }
    const selected =
      stage === 'style-spacing'
        ? option(word, ['Aspect'])
        : name === 'GRID'
          ? word === 'D'
            ? 'Adaptive'
            : word === 'A'
              ? 'Aspect'
              : option(word, [
                  'ON',
                  'OFF',
                  'Snap',
                  'Major',
                  'Adaptive',
                  'Limits',
                  'Follow',
                  'Aspect',
                ])
          : option(word, ['ON', 'OFF', 'Aspect', 'Legacy', 'Style', 'Type']);
    if (!selected) {
      const value = spacing(text, 0);
      if (value === undefined) {
        notice = invalid;
        continue;
      }
      setSpacing(value, spacing(text, 1) ?? value);
      continue;
    }
    switch (selected) {
      case 'ON':
      case 'OFF':
        set(name === 'GRID' ? 'GRIDMODE' : 'SNAPMODE', selected === 'ON' ? 1 : 0);
        done = true;
        break;
      case 'Snap':
        setSpacing(0, 0);
        break;
      case 'Aspect':
        if (number('SNAPSTYL') === 1)
          notice =
            locale === 'ko-KR'
              ? '등각투영 스냅에서는 종횡비를 지정할 수 없습니다.'
              : 'Cannot specify aspect with isometric snap.';
        else stage = 'aspect-x';
        break;
      case 'Major':
        stage = 'major';
        break;
      case 'Adaptive':
        stage = 'adaptive';
        break;
      case 'Limits':
        stage = 'limits';
        break;
      case 'Follow':
        stage = 'follow';
        break;
      case 'Legacy':
        stage = 'legacy';
        break;
      case 'Style':
        stage = 'style';
        break;
      case 'Type':
        stage = 'type';
        break;
    }
  }
  return done
    ? { changes }
    : {
        changes,
        step: {
          prompt: draftingCommandPrompt(name, stage, get, locale),
          ...(notice ? { notice } : {}),
        },
      };
}

export function draftingCommands(): CommandDefinition[] {
  const neutral = { 'ko-KR': '', 'en-US': '' };
  return names.map((name) => ({
    name,
    displayName: neutral,
    description: neutral,
    nextPrompt: (values, state) => walk(name, values, state.sysvars, state.locale).step,
    execute: (context) => {
      const values: string[] = [];
      while (context.input.remaining) {
        const value: CommandInput | undefined = context.input.take();
        values.push(typeof value === 'string' ? value : String(value));
      }
      const result = walk(name, values, context.sysvars, context.locale);
      if (result.step) {
        if (result.step.notice) context.print(result.step.notice);
        context.print(result.step.prompt);
        return;
      }
      for (const [key, value] of result.changes)
        validateSystemVariable(getSystemVariableDefinition(key)!, value);
      const group = !context.database.undoGroupActive;
      if (group) context.database.beginUndoGroup();
      try {
        for (const [key, value] of result.changes) context.sysvars.set(key, value);
      } finally {
        if (group && context.database.undoGroupActive) context.database.endUndoGroup();
      }
    },
  }));
}
