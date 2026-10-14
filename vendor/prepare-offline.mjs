import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
let core = fs.readFileSync(path.join(dir, 'cadview-core/package/dist/index.js'), 'utf8');
// Only expose parsing/colors; renderer SpatialIndex is never instantiated.
core = core.replace(/^import RBush from 'rbush';\s*/, '');
// Retain metadata and unsupported objects so the importer can report omissions.
core = core.replace('case 60:\n        base.visible', 'case 67:\n        base.paperSpace = tag.value === "1";\n        break;\n      case 60:\n        base.visible');
const anchor = '      case "POLYLINE": {\n        const polyline = parsePolyline(entityTags);';
core = core.replace(anchor, `      case "SOLID":\n      case "TRACE":\n      case "3DFACE": {\n        const solid = { ...parseBaseEntity(entityTags), type, points: [] };\n        for (let n = 0; n < 4; n++) {\n          const x = entityTags.find(t => t.code === 10 + n);\n          const y = entityTags.find(t => t.code === 20 + n);\n          if (x) solid.points.push({ x: Number(x.value), y: y ? Number(y.value) : 0 });\n        }\n        entities.push(solid);\n        break;\n      }\n      default:\n        entities.push({ ...parseBaseEntity(entityTags), type });\n        break;\n` + anchor);
core = core.replace(/export \{[^\n]+\};/, 'globalThis.CadDxf = { parseDxf, aciToHex, trueColorToHex };');
core = `(function () {\n${core}\n})();\n`;
fs.writeFileSync(path.join(dir, 'cad-dxf.js'), core);
let dwg = fs.readFileSync(path.join(dir, 'cadview-dwg/package/dist/index.js'), 'utf8');
dwg = dwg.replaceAll('import.meta.url', '"file:///libredwg.js"');
dwg = dwg.replace('const moduleOpts = {', 'const moduleOpts = {\n          wasmBinary: options?.wasmBinary,\n          print: () => {},\n          printErr: () => {},');
// Upstream fixNegativeLayerColors would discard the original off-layer state.
dwg = dwg.replace('return fixNegativeLayerColors(dxfContent);', 'return dxfContent;');
dwg = dwg.replace(/export \{[^\n]+\};/, 'globalThis.CadDwg = { convertDwgToDxf, getDwgVersion };');
dwg += `\nself.onmessage = async function (event) {\n  try {\n    const { buffer, wasmBinary } = event.data;\n    const dxf = await CadDwg.convertDwgToDxf(buffer, { wasmBinary, timeout: 0 });\n    self.postMessage({ ok: true, dxf });\n  } catch (error) { self.postMessage({ ok: false, message: String(error?.cause?.message || error?.message || error) }); }\n};\n`;
fs.writeFileSync(path.join(dir, 'cad-dwg-worker.js'), dwg);
const wasmBase64 = fs.readFileSync(path.join(dir, 'cadview-dwg/package/dist/libredwg.wasm')).toString('base64');
fs.writeFileSync(path.join(dir, 'cad-offline.js'), core + '\nglobalThis.CadOfflineAssets = ' + JSON.stringify({ workerSource: dwg, wasmBase64 }) + ';\n');
console.log('Offline DWG/DXF assets regenerated.');
