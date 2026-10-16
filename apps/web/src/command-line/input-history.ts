/**
 * Recent input by prompt context (INPUTHISTORYMODE bit 1): Up/Down at the command
 * prompt recalls commands; inside a command they recall values given at the same
 * kind of prompt. CMDINPUTHISTORYMAX bounds each list.
 */
export class InputHistory {
  private readonly lists = new Map<string, string[]>();
  private cursor: { context: string; index: number } | null = null;

  constructor(private readonly limit: () => number = () => 20) {}

  add(context: string, value: string): void {
    const text = value.trim();
    if (!text) return;
    const list = this.lists.get(context) ?? [];
    const existing = list.indexOf(text);
    if (existing >= 0) list.splice(existing, 1);
    list.push(text);
    const max = Math.max(0, this.limit());
    if (list.length > max) list.splice(0, list.length - max);
    this.lists.set(context, list);
    this.cursor = null;
  }

  list(context: string): readonly string[] {
    return this.lists.get(context) ?? [];
  }

  /** Steps from the newest entry backward (-1) or forward (+1); undefined past the end. */
  recall(context: string, direction: -1 | 1): string | undefined {
    const list = this.list(context);
    if (!list.length) return undefined;
    const start = this.cursor?.context === context ? this.cursor.index : list.length;
    const index = Math.min(list.length, Math.max(0, start + direction));
    this.cursor = { context, index };
    return list[index] ?? '';
  }

  resetCursor(): void {
    this.cursor = null;
  }
}
