import { describe, expect, it } from 'vitest';
import { dxfObjectSchemas, getDxfObjectSchema } from './dxf-schema';
import { dxfReferenceDocuments } from './dxf-reference';
import { dxfGroupValueType } from './dxf-value-types';

describe('published DXF factual group metadata', () => {
  it('provides traceable numeric definitions for every indexed family while retaining opaque editing status', () => {
    for (const schema of dxfObjectSchemas) {
      expect(schema.documentedGroups.length, schema.type).toBeGreaterThan(0);
      expect(schema.source, schema.type).toMatch(
        /^https:\/\/help\.autodesk\.com\/cloudhelp\/2026\/ENU\/AutoCAD-DXF\/files\/GUID-/,
      );
    }
    expect(dxfReferenceDocuments).toHaveLength(157);
    expect(
      dxfReferenceDocuments.reduce((sum, document) => sum + document.documentedGroups.length, 0),
    ).toBe(2318);
    for (const document of dxfReferenceDocuments)
      for (const group of document.documentedGroups) {
        expect(group.codes.every(Number.isSafeInteger)).toBe(true);
        expect(group.subclasses.every((name) => /^AcDb/.test(name))).toBe(true);
        expect(typeof group.repeated).toBe('boolean');
        expect(['record', 'application', 'xdata']).toContain(group.context);
        for (const range of group.ranges ?? []) {
          expect(range).toHaveLength(2);
          expect(range.every(Number.isSafeInteger)).toBe(true);
          expect(range[1]).toBeGreaterThanOrEqual(range[0]!);
        }
      }
    expect(getDxfObjectSchema('ACAD_PROXY_OBJECT')?.status).toBe('opaque');
    expect(getDxfObjectSchema('SCALE')?.documentationStatus).toBe('common-only');
  });

  it('covers annotation, hatch, surface, material and object definitions with repeated/subclass context', () => {
    const groups = (type: string, code: number) =>
      getDxfObjectSchema(type)!.documentedGroups.filter((group) => group.codes.includes(code));
    expect(groups('DIMENSION', 70).length).toBeGreaterThan(0);
    expect(groups('MULTILEADER', 302).length).toBeGreaterThan(0);
    expect(groups('HATCH', 72).length).toBeGreaterThan(0);
    expect(groups('SURFACE', 310).length).toBeGreaterThan(0);
    expect(groups('ACAD_TABLE', 171).some((group) => group.repeated)).toBe(true);
    expect(groups('MATERIAL', 40).length).toBeGreaterThan(0);
    expect(groups('MTEXT', 3).some((group) => group.repeated)).toBe(true);
    expect(
      getDxfObjectSchema('XRECORD')!.documentedGroups.some((group) =>
        group.ranges?.some((range) => range[0] === 1 && range[1] === 369),
      ),
    ).toBe(true);
    expect(groups('LAYOUT', 330).some((group) => group.subclasses.includes('AcDbLayout'))).toBe(
      true,
    );
  });

  it('classifies published value widths without coercing opaque 64-bit or binary values', () => {
    expect(dxfGroupValueType(10)).toBe('point-component');
    expect(dxfGroupValueType(40)).toBe('real');
    expect(dxfGroupValueType(70)).toBe('int16');
    expect(dxfGroupValueType(90)).toBe('int32');
    expect(dxfGroupValueType(160)).toBe('int64');
    expect(dxfGroupValueType(290)).toBe('boolean');
    expect(dxfGroupValueType(310)).toBe('binary');
    expect(dxfGroupValueType(330)).toBe('handle');
    expect(dxfGroupValueType(9999)).toBe('unknown');
  });
});
