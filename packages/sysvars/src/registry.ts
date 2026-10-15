import { catalogData, headerData } from './catalog';
import { loadDxfHeaderDefinition, loadSystemVariableDefinition } from './definition';
import { systemVariableMarkdown } from './markdown';
export type {
  SysvarValue,
  SysvarScope,
  SystemVariableDefinition,
  DxfHeaderVariableDefinition,
} from './definition';

/** Registration provides typed storage; a later-phase feature must still consume its variables. */
export const systemVariableDefinitions = Object.freeze(
  catalogData.map(loadSystemVariableDefinition),
);
export const dxfHeaderVariableDefinitions = Object.freeze(headerData.map(loadDxfHeaderDefinition));
const definitions = new Map(
  systemVariableDefinitions.map((definition) => [definition.name, definition]),
);
if (definitions.size !== systemVariableDefinitions.length)
  throw new Error('Duplicate system-variable catalog name');

export function getSystemVariableDefinition(name: string) {
  return definitions.get(name.toUpperCase());
}
export function generateSystemVariableMarkdown(): string {
  return systemVariableMarkdown(systemVariableDefinitions, dxfHeaderVariableDefinitions);
}
