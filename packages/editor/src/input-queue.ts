export type CommandInput =
  string | number | boolean | readonly [number, number] | readonly [number, number, number];

export class InputCancelled extends Error {
  constructor() {
    super('*취소*');
    this.name = 'InputCancelled';
  }
}

export class InputQueue {
  private cursor = 0;
  private cancelled = false;
  constructor(private readonly values: readonly CommandInput[] = []) {}
  get remaining(): number {
    return this.values.length - this.cursor;
  }
  cancel(): void {
    this.cancelled = true;
  }
  take(): CommandInput | undefined {
    if (this.cancelled) throw new InputCancelled();
    const value = this.values[this.cursor];
    if (value !== undefined) this.cursor++;
    if (value === '\u001b') throw new InputCancelled();
    return value;
  }
  requireString(): string {
    const value = this.take();
    if (typeof value !== 'string') throw new Error('A string input is required.');
    return value;
  }
  requireNumber(): number {
    const value = this.take();
    const number =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(number)) throw new Error('A finite number input is required.');
    return number;
  }
}
