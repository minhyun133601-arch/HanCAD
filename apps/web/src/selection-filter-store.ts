import type { CadFilterExpression, CadNamedFilter } from '@hancad/legacy-bridge';
import { validateCadFilterExpression, validCadFilterExpression } from '@hancad/draft';

export const selectionFilterStorageKey = 'hancad.filter.nfl.v1';
/** Profile-global equivalent of filter.nfl; shared by every drawing and HanCAD window. */
export class SelectionFilterStore {
  private filters: CadNamedFilter[] = [];
  private readonly listeners = new Set<() => void>();
  constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.reload();
  }
  readonly snapshot = (): readonly CadNamedFilter[] => this.filters;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  reload(): void {
    try {
      const raw: unknown = JSON.parse(
        (this.storage ?? localStorage).getItem(selectionFilterStorageKey) ?? '[]',
      );
      this.filters = Array.isArray(raw)
        ? raw.filter(
            (item): item is CadNamedFilter =>
              typeof item === 'object' &&
              item !== null &&
              typeof item.name === 'string' &&
              item.name.trim().length > 0 &&
              Array.from(item.name).length <= 18 &&
              validCadFilterExpression(item.expression),
          )
        : [];
    } catch {
      this.filters = [];
    }
    this.emit();
  }
  save(name: string, expression: CadFilterExpression | null): void {
    name = name.trim();
    if (!name || Array.from(name).length > 18) throw new Error('filterName');
    if (expression) validateCadFilterExpression(expression);
    const next = [
      ...this.filters.filter((filter) => filter.name.toUpperCase() !== name.toUpperCase()),
      ...(expression ? [{ name, expression: structuredClone(expression) }] : []),
    ];
    (this.storage ?? localStorage).setItem(selectionFilterStorageKey, JSON.stringify(next));
    this.filters = next;
    this.emit();
  }
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
export const selectionFilterStore = new SelectionFilterStore();
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === selectionFilterStorageKey) selectionFilterStore.reload();
  });
