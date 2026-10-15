export class NativeDrawingFileError extends Error {
  constructor(cause: unknown) {
    super('Invalid HCD drawing file.', { cause });
    this.name = 'NativeDrawingFileError';
  }
}
