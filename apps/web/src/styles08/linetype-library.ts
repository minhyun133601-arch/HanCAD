import type { DrawingDatabase } from '@hancad/db';
import { decodeSupportText } from '@hancad/input';
import { builtinLinetypes, linetypeFields, linetypeFromFields, parseLin } from '@hancad/render';
import type { LinetypeDefinition } from '@hancad/render';

/** Opened support files remain document-local; file contents never leave the machine. */
export class LinetypeLibrary {
  private readonly files = new Map<string, readonly LinetypeDefinition[]>();
  private readonly sources = new Map<string, string>();
  constructor(private readonly readFile?: (name: string) => Promise<Uint8Array>) {}
  remember(name: string, bytes: Uint8Array): readonly LinetypeDefinition[] {
    const text = decodeSupportText(bytes).text;
    const definitions = parseLin(text);
    this.files.set(name.toUpperCase(), definitions);
    this.sources.set(name.toUpperCase(), text);
    return definitions;
  }
  append(name: string, text: string): string {
    const source = this.sources.get(name.toUpperCase()) ?? '';
    const appended = source ? `${source.trimEnd()}\n${text}` : text;
    this.remember(name, new TextEncoder().encode(appended));
    return appended;
  }
  async read(name: string): Promise<readonly LinetypeDefinition[]> {
    const key = name.trim().toUpperCase();
    if (!key || ['HANCADISO.LIN', 'HANCAD.LIN'].includes(key))
      return [...builtinLinetypes().values()];
    const known = this.files.get(key);
    if (known) return known;
    if (!this.readFile) throw new Error('Open the LIN file in the Linetype Manager first.');
    return this.remember(name, await this.readFile(name));
  }
}
export function loadedLinetypes(database: DrawingDatabase): LinetypeDefinition[] {
  return database
    .all()
    .filter((object) => object.type === 'LTYPE' && object.name)
    .map((object) => linetypeFromFields(object.name!, object.fields));
}
export function loadLinetypes(
  database: DrawingDatabase,
  definitions: readonly LinetypeDefinition[],
): void {
  if (!definitions.length) return;
  database.transaction('LINETYPE', (tx) => {
    for (const definition of definitions) {
      if (['BYLAYER', 'BYBLOCK', 'CONTINUOUS'].includes(definition.name.toUpperCase())) continue;
      const existing = database
        .all()
        .find(
          (object) =>
            object.type === 'LTYPE' && object.name?.toUpperCase() === definition.name.toUpperCase(),
        );
      if (existing)
        tx.modify(existing.handle, (object) => {
          object.fields = linetypeFields(definition);
        });
      else
        tx.add({
          type: 'LTYPE',
          owner: database.tables.LTYPE,
          name: definition.name,
          fields: linetypeFields(definition),
        });
    }
  });
}
export function deleteLinetype(database: DrawingDatabase, name: string): boolean {
  const upper = name.toUpperCase();
  if (
    ['BYLAYER', 'BYBLOCK', 'CONTINUOUS'].includes(upper) ||
    String(database.getVariable('CELTYPE') ?? 'BYLAYER').toUpperCase() === upper
  )
    return false;
  const all = database.all();
  if (all.some((object) => String(object.fields.linetype ?? '').toUpperCase() === upper))
    return false;
  const target = all.find(
    (object) => object.type === 'LTYPE' && object.name?.toUpperCase() === upper,
  );
  if (!target) return false;
  database.transaction('LINETYPE', (tx) => tx.erase(target.handle));
  return true;
}
export function matchesLinetype(name: string, patterns: string): boolean {
  return patterns.split(',').some((pattern) => {
    const source = pattern
      .trim()
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${source}$`, 'i').test(name);
  });
}
