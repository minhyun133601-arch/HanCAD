/** Keep editor inquiry IDs separate from persistent database handles and arbitrary legacy IDs. */
export function nativeObjectSelectionId(
  handle: string,
  reserved: ReadonlySet<string> = new Set(),
): string {
  let id = `native:HATCH:${handle}`;
  while (reserved.has(id)) id += ':';
  return id;
}
