// One-time audit (2026-10-15): numeric ranges quoted from each variable's Autodesk 2026 help page.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const directory = 'packages/sysvars/src/catalog/';
const ranges = {
  BGRIPOBJSIZE: [1, 255],
  BPARAMETERSIZE: [1, 255],
  CBARTRANSPARENCY: [10, 90],
  CLIPROMPTLINES: [0, 50],
  FACETERGRIDRATIO: [0, 100],
  FACETERMAXGRID: [0, 4096],
  FACETERMINUGRID: [0, 1023],
  FACETERMINVGRID: [0, 1023],
  GRIPOBJLIMIT: [0, 32767],
  HPGAPTOL: [0, 5000],
  HPMAXAREAS: [0, 10000000],
  HPMAXLINES: [100, 10000000],
  IBLENVIRONMENT: [-11, 11],
  INPUTSEARCHDELAY: [100, 10000],
  LAYLOCKFADECTL: [-90, 90],
  PLINEGCENMAX: [0, 10000000],
  PREVIEWCREATIONTRANSPARENCY: [0, 90],
  PROPOBJLIMIT: [0, 32767],
  RASTERDPI: [100, 32767],
  // Documented initial value 0 plus documented ACI range 1-255.
  SELECTIONEFFECTCOLOR: [0, 255],
  SMOOTHMESHMAXFACE: [108, 16000000],
  STEPSPERSEC: [1, 30],
  SURFU: [0, 200],
  SURFV: [0, 200],
  TEXTQLTY: [0, 100],
  VSEDGESMOOTH: [0, 180],
  VSFACEHIGHLIGHT: [-100, 100],
  VSHALOGAP: [0, 100],
};
const typeOnly =
  'Audited 2026-10-15: the Autodesk topic documents no rejecting numeric range; only the type is enforced.';
let ranged = 0;
for (const file of readdirSync(directory).filter((name) => name.startsWith('variables'))) {
  const path = directory + file;
  const variables = JSON.parse(readFileSync(path, 'utf8'));
  for (const variable of variables) {
    if (!variable.validationNote?.startsWith('Only the documented type')) continue;
    const range = ranges[variable.name];
    if (range) {
      [variable.min, variable.max] = range;
      delete variable.validationNote;
      ranged++;
    } else variable.validationNote = typeOnly;
  }
  writeFileSync(path, `${JSON.stringify(variables, null, 2)}\n`);
}
console.log(`ranged ${ranged}`);
