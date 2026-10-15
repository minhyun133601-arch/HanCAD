import { entityDxfReferences } from './dxf-reference-entity';
import { objectDxfReferences } from './dxf-reference-object';
import { tableDxfReferences } from './dxf-reference-table';
import { dxfGroupValueType } from './dxf-value-types';
import type { DxfValueType } from './dxf-value-types';

export interface DxfDocumentedGroup {
  codes: readonly number[];
  ranges?: readonly (readonly number[])[];
  excluded?: readonly number[];
  subclasses: readonly string[];
  context: string;
  repeated: boolean;
  source?: string;
  valueTypes?: readonly DxfValueType[];
}
export interface DxfReferenceDocument {
  title: string;
  source: string;
  section: string;
  documentedGroups: readonly DxfDocumentedGroup[];
  children: readonly string[];
}

const chunks: readonly DxfReferenceDocument[] = [
  ...entityDxfReferences,
  ...objectDxfReferences,
  ...tableDxfReferences,
];
const documents = new Map<string, DxfReferenceDocument>();
for (const chunk of chunks) {
  const prior = documents.get(chunk.source);
  documents.set(
    chunk.source,
    prior
      ? { ...prior, documentedGroups: [...prior.documentedGroups, ...chunk.documentedGroups] }
      : chunk,
  );
}
export const dxfReferenceDocuments: readonly DxfReferenceDocument[] = Object.freeze([
  ...documents.values(),
]);

const titleAliases: Readonly<Record<string, string>> = {
  MULTILEADER: 'MLEADER',
  ACAD_TABLE: 'TABLE',
  PDFUNDERLAY: 'UNDERLAY',
  DGNUNDERLAY: 'UNDERLAY',
  DWFUNDERLAY: 'UNDERLAY',
  PDFDEFINITION: 'UNDERLAYDEFINITION',
  DGNDEFINITION: 'UNDERLAYDEFINITION',
  DWFDEFINITION: 'UNDERLAYDEFINITION',
  EXTRUDEDSURFACE: 'Extruded Surface',
  LOFTEDSURFACE: 'Lofted Surface',
  REVOLVEDSURFACE: 'Revolved Surface',
  SWEPTSURFACE: 'Swept Surface',
  SECTIONOBJECT: 'SECTION',
  SECTION_MANAGER: 'Section Manager',
  SECTION_SETTINGS: 'Section Settings',
  ACDBNAVISWORKSMODEL: 'COORDINATION MODEL',
};
const nestedTitles: Readonly<Record<string, RegExp>> = {
  DIMENSION: /Dimension.*Group Codes|Dimension Style Overrides/,
  HATCH: /Boundary Path Data|Pattern Data/,
  MLEADER: /MLeader.*Group Codes/,
  MULTILEADER: /MLeader.*Group Codes/,
  SURFACE: /(?:Extruded|Lofted|Revolved|Swept) Surface/,
  RENDER: /RENDERSETTINGS|RENDERENVIRONMENT|RENDERGLOBAL/,
  SECTION: /Section (?:Manager|Settings|Type Settings|Geometry Settings)/,
  SECTION_MANAGER: /Section (?:Settings|Type Settings|Geometry Settings)/,
  SECTION_SETTINGS: /Section (?:Type Settings|Geometry Settings)/,
};

export function getDxfTypeDocumentation(
  type: string,
  section: string,
): readonly DxfReferenceDocument[] {
  const title = `${titleAliases[type] ?? type} (DXF)`;
  const candidates = dxfReferenceDocuments.filter((document) => document.title === title);
  const direct = candidates.find((document) => document.section === section) ?? candidates[0];
  const commonTitle =
    section === 'entity' || section === 'block'
      ? 'Common Group Codes for Entities (DXF)'
      : section === 'table'
        ? 'Common Group Codes for Symbol Table Entries (DXF)'
        : 'Common Group Codes for Objects (DXF)';
  const common = dxfReferenceDocuments.find((document) => document.title === commonTitle);
  const result: DxfReferenceDocument[] = [...(common ? [common] : []), ...(direct ? [direct] : [])];
  const pattern = nestedTitles[type];
  if (direct && pattern) {
    const queue = [...direct.children];
    const seen = new Set(result.map((document) => document.source));
    while (queue.length) {
      const source = queue.shift()!;
      const document = documents.get(source);
      if (!document || seen.has(source) || !pattern.test(document.title)) continue;
      seen.add(source);
      result.push(document);
      queue.push(...document.children);
    }
  }
  return result;
}

export function getDocumentedDxfGroups(
  type: string,
  section: string,
): readonly DxfDocumentedGroup[] {
  return getDxfTypeDocumentation(type, section).flatMap((document) =>
    document.documentedGroups.map((group) => ({
      ...group,
      source: document.source,
      valueTypes: group.codes.map(dxfGroupValueType),
    })),
  );
}
