/** A vanished member invalidates Previous, matching the existing legacy editor rule. */
export function pruneSelectionPresence(
  entityIds: readonly string[],
  additionalIds: readonly string[],
  selected: readonly string[],
  previous: readonly string[],
): { selected: string[]; previous: string[] } {
  const present = new Set([...entityIds, ...additionalIds]);
  return {
    selected: selected.filter((id) => present.has(id)),
    previous: previous.some((id) => !present.has(id)) ? [] : [...previous],
  };
}
