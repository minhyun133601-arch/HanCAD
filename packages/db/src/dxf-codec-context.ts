import type { DxfFieldSchema } from './dxf-schema';
import type { DxfGroup } from './types';

export interface DxfGroupContext {
  subclass: string;
  eligible: boolean;
}

/** Application groups and XDATA may reuse geometry/ownership codes; do not edit inside them. */
export function dxfGroupContexts(groups: readonly DxfGroup[]): DxfGroupContext[] {
  let subclass = '',
    appDepth = 0,
    xdata = false;
  return groups.map((group) => {
    if (group.code === 1001) xdata = true;
    if (group.code === 102 && typeof group.value === 'string') {
      if (group.value.startsWith('{')) appDepth++;
      else if (group.value === '}') appDepth = Math.max(0, appDepth - 1);
      return { subclass, eligible: false };
    }
    if (group.code === 100 && !appDepth && !xdata && typeof group.value === 'string') {
      subclass = group.value;
      return { subclass, eligible: false };
    }
    return { subclass, eligible: !appDepth && !xdata };
  });
}

export function scopedIndices(groups: readonly DxfGroup[], field: DxfFieldSchema): number[] {
  const contexts = dxfGroupContexts(groups);
  const hasSubclasses = contexts.some((context) => context.subclass !== '');
  return groups.flatMap((group, index) => {
    const context = contexts[index]!;
    const classes = typeof field.subclass === 'string' ? [field.subclass] : field.subclass;
    return context.eligible &&
      (!hasSubclasses || !classes || classes.includes(context.subclass)) &&
      field.codes.includes(group.code)
      ? [index]
      : [];
  });
}

export function insertInSubclass(
  groups: DxfGroup[],
  field: DxfFieldSchema,
  inserted: readonly DxfGroup[],
): DxfGroup[] {
  if (!inserted.length) return groups;
  const contexts = dxfGroupContexts(groups);
  const classes = typeof field.subclass === 'string' ? [field.subclass] : field.subclass;
  const hasSubclasses = contexts.some((context) => context.subclass !== '');
  let insertion = -1;
  for (let index = 0; index < groups.length; index++) {
    if (
      contexts[index]!.eligible &&
      (!hasSubclasses || !classes || classes.includes(contexts[index]!.subclass))
    )
      insertion = index + 1;
    if (
      groups[index]!.code === 100 &&
      typeof groups[index]!.value === 'string' &&
      classes?.includes(String(groups[index]!.value))
    )
      insertion = index + 1;
  }
  if (insertion < 0) {
    insertion = groups.findIndex((group) => group.code === 1001);
    if (insertion < 0) insertion = groups.length;
    if (classes?.[0]) groups.splice(insertion++, 0, { code: 100, value: classes[0] });
  }
  groups.splice(insertion, 0, ...structuredClone(inserted));
  return groups;
}

/** Replace mapped slots in place, retaining every intervening unknown group and subclass marker. */
export function replaceMappedGroups(
  groups: readonly DxfGroup[],
  field: DxfFieldSchema,
  encoded: readonly DxfGroup[],
): DxfGroup[] {
  const indices = scopedIndices(groups, field);
  const replacements = new Map<number, DxfGroup | undefined>();
  const remaining = [...encoded];
  for (const index of indices) {
    const code = groups[index]!.code;
    const next = remaining.findIndex((group) => group.code === code);
    replacements.set(index, next < 0 ? undefined : remaining.splice(next, 1)[0]);
  }
  const result = groups.flatMap((group, index) =>
    replacements.has(index)
      ? replacements.get(index)
        ? [structuredClone(replacements.get(index)!)]
        : []
      : [structuredClone(group)],
  );
  return insertInSubclass(result, field, remaining);
}
