import { getSystemVariableDefinition, validateSystemVariable } from '@hancad/sysvars';
import type { SystemVariableProfile, SysvarValue } from '@hancad/sysvars';

export const profileStorageKey = 'hancad.profile-variables.v1';
type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>;

function profileValue(name: string, value: unknown): [string, SysvarValue] | undefined {
  const definition = getSystemVariableDefinition(name);
  if (!definition || definition.scope !== 'profile' || definition.readonly) return;
  try {
    validateSystemVariable(definition, value);
    return [definition.name, structuredClone(value as SysvarValue)];
  } catch {
    return;
  }
}

/** Profile restoration bypasses the drawing journal and rejects values outside known profile definitions. */
export function restoreProfileVariables(
  profile: SystemVariableProfile,
  storage?: ProfileStorage,
): void {
  try {
    const serialized = (storage ?? localStorage).getItem(profileStorageKey);
    if (!serialized) return;
    const values: unknown = JSON.parse(serialized);
    if (!values || typeof values !== 'object' || Array.isArray(values)) return;
    for (const [name, value] of Object.entries(values)) {
      const entry = profileValue(name, value);
      if (entry) profile.values.set(...entry);
    }
  } catch {
    // Missing, corrupt or denied preference storage leaves application defaults usable.
  }
}

export function persistProfileVariables(
  profile: SystemVariableProfile,
  storage?: ProfileStorage,
): void {
  try {
    const entries = [...profile.values].flatMap(([name, value]) => {
      const entry = profileValue(name, value);
      return entry ? [entry] : [];
    });
    (storage ?? localStorage).setItem(
      profileStorageKey,
      JSON.stringify(Object.fromEntries(entries)),
    );
  } catch {
    // Profile preferences are independent of drawing recovery and may remain memory-only.
  }
}

export function subscribeProfileVariables(
  profile: SystemVariableProfile,
  storage?: ProfileStorage,
): () => void {
  return profile.events.subscribe(() => persistProfileVariables(profile, storage));
}
