import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: { HeechangTool: { core: {} } }, Blob });
for (const name of ['cad-engine.js', 'cad-exporters.js']) {
  vm.runInContext(fs.readFileSync(new URL(`../packages/legacy-bridge/runtime/${name}`, import.meta.url), 'utf8'), context, { filename: name });
}
const { cadEngine: engine, cadExporters: exporters } = context.window.HeechangTool.core;
const plain = (value) => JSON.parse(JSON.stringify(value));
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const at = (actual, expected) => { near(actual.x, expected.x); near(actual.y, expected.y); };
const linear = (kind, patch = {}) => engine.normalizeEntity({ type: 'dimension', kind, a: { x: 0, y: 0 }, b: { x: 100, y: 50 }, offset: 20, ...patch });
const radial = (kind, patch = {}) => engine.normalizeEntity({ type: 'dimension', kind, center: { x: 10, y: 20 }, radius: 30, placement: { x: 60, y: 20 }, ...patch });
const angular = (patch = {}) => engine.normalizeEntity({ type: 'dimension', kind: 'angular', center: { x: 0, y: 0 }, a: { x: 30, y: 0 }, b: { x: 0, y: 30 }, offset: 20, clockwise: true, ...patch });

test('linear dimensions use projected engineering measurements and real extension gaps', () => {
  const horizontal = engine.dimensionGeometry(linear('horizontal'));
  const vertical = engine.dimensionGeometry(linear('vertical'));
  const aligned = engine.dimensionGeometry(linear('aligned'));
  assert.equal(horizontal.label, '100.00');
  assert.equal(vertical.label, '50.00');
  near(aligned.measurement, Math.hypot(100, 50));
  at(horizontal.q1, { x: 0, y: 20 }); at(horizontal.q2, { x: 100, y: 20 });
  at(vertical.q1, { x: 20, y: 0 }); at(vertical.q2, { x: 20, y: 50 });
  at(horizontal.lines[0][0], { x: 0, y: 1 }); at(horizontal.lines[0][1], { x: 0, y: 22 });
  at(horizontal.lines[1][0], { x: 100, y: 49 }); at(horizontal.lines[1][1], { x: 100, y: 18 });
  assert.equal(horizontal.textSize, 3.5); assert.equal(horizontal.arrowSize, 2.5);
});

test('radius, diameter and angular dimensions include symbols, leaders, arcs and user overrides', () => {
  const radius = engine.dimensionGeometry(radial('radius', { unit: 'mm', precision: 1 }));
  const diameter = engine.dimensionGeometry(radial('diameter'));
  const angle = engine.dimensionGeometry(angular());
  assert.equal(radius.label, 'R30.0mm'); assert.equal(diameter.label, '⌀60.00');
  assert.equal(radius.arrows.length, 1); assert.equal(diameter.arrows.length, 2);
  assert.equal(radius.lines.length, 2); at(radius.q2, { x: 40, y: 20 });
  assert.equal(angle.label, '90.00°'); assert.equal(angle.arcs.length, 1);
  near(angle.arcs[0].endAngle - angle.arcs[0].startAngle, Math.PI / 2);
  assert.equal(engine.dimensionGeometry(linear('horizontal', { text: '길이 <> ±0.1', unit: 'mm', precision: 0 })).label, '길이 100mm ±0.1');
  assert.equal(engine.dimensionGeometry(linear('horizontal', { text: '검사 치수' })).label, '검사 치수');
  assert.equal(engine.dimensionGeometry(angular({ clockwise: false })).label, '270.00°');
});

test('normalization validates geometry and style; project settings propagate only to selected dimensions', () => {
  assert.equal(linear('horizontal', { b: { x: 0, y: 50 } }), null);
  assert.equal(radial('radius', { radius: 0 }), null);
  assert.equal(angular({ center: { x: 30, y: 0 } }), null);
  assert.equal(angular({ offset: 0 }), null);
  const model = engine.create();
  const one = model.add(linear('horizontal'));
  const two = model.add(linear('vertical'));
  const line = model.add({ type: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
  model.select([one.id, line.id]);
  model.applyProperties({ dimPrecision: 3, dimScale: 2, dimTextSize: 5, arrowSize: 4, extensionGap: 2, extensionOvershoot: 3, dimUnit: 'mm' });
  const changed = model.state.entities.find((entity) => entity.id === one.id);
  assert.equal(changed.precision, 3); assert.equal(changed.unit, 'mm');
  assert.equal(engine.dimensionGeometry(changed).textSize, 10);
  assert.equal(engine.dimensionGeometry(changed).arrowSize, 8);
  assert.equal(model.state.entities.find((entity) => entity.id === two.id).precision, 2);
  assert.equal(model.state.entities.find((entity) => entity.id === line.id).textSize, undefined);
  model.undo(); assert.equal(model.state.entities.find((entity) => entity.id === one.id).precision, 2);
  model.redo(); assert.equal(model.state.entities.find((entity) => entity.id === one.id).precision, 3);
  model.applyProperties({ dimUnit: '' }, [one.id]); assert.equal(model.state.entities.find((entity) => entity.id === one.id).unit, '');
});

test('drawing names survive snapshots, project loading and undo/redo of a new drawing', () => {
  const model = engine.create({ initialState: { name: '  검사 도면 A  ' } });
  assert.equal(model.snapshot().name, '검사 도면 A');
  model.load({ name: '배관 치수', entities: [linear('horizontal')] });
  assert.equal(model.snapshot().name, '배관 치수');
  model.clear(); assert.equal(model.state.name, '새 도면');
  model.undo(); assert.equal(model.state.name, '배관 치수');
  model.redo(); assert.equal(model.state.name, '새 도면');
  assert.equal(engine.normalizeState({ name: 'a'.repeat(150) }).name.length, 120);
});

test('rotation, mirror, translation and scale preserve appropriate dimension geometry', () => {
  const source = linear('horizontal');
  const rotated = engine.transformEntity(source, { type: 'rotate', angle: 37, base: { x: 0, y: 0 } });
  near(engine.dimensionGeometry(rotated).measurement, 100);
  const mirrored = engine.transformEntity(source, { type: 'mirror', axisA: { x: 0, y: 0 }, axisB: { x: 1, y: 0 } });
  at(engine.dimensionGeometry(mirrored).q1, { x: 0, y: -20 }); near(engine.dimensionGeometry(mirrored).measurement, 100);
  const moved = engine.transformEntity(radial('diameter'), { type: 'move', delta: { x: 5, y: -10 } });
  at(moved.placement, { x: 65, y: 10 }); at(moved.center, { x: 15, y: 10 });
  const scaled = engine.transformEntity(source, { type: 'scale', factor: 2 });
  near(engine.dimensionGeometry(scaled).measurement, 200); assert.equal(scaled.arrowSize, 5); assert.equal(scaled.extensionGap, 2);
  const reflectedAngle = engine.transformEntity(angular(), { type: 'mirror', axisA: { x: 0, y: 0 }, axisB: { x: 1, y: 0 } });
  assert.equal(reflectedAngle.clockwise, false); near(engine.dimensionGeometry(reflectedAngle).measurement, 90);
});

test('dimension selection, bounds and object snaps include arcs, arrowheads and text', () => {
  const angle = { ...angular(), id: 'angle' }, radius = { ...radial('radius'), id: 'radius' };
  const geometry = engine.dimensionGeometry(angle);
  const arcPoint = { x: 20 * Math.cos(Math.PI / 6), y: 20 * Math.sin(Math.PI / 6) };
  assert.equal(engine.hitTest([angle], arcPoint, 0.001).id, 'angle');
  assert.equal(engine.hitTest([radius], engine.dimensionGeometry(radius).textPoint, 0.001).id, 'radius');
  const snap = engine.snap([radius], { x: 10.01, y: 20.01 }, 0.1); assert.equal(snap.type, 'center');
  const bounds = engine.bounds(angle);
  geometry.points.forEach((point) => assert.ok(point.x >= bounds.minX - 1e-7 && point.x <= bounds.maxX + 1e-7 && point.y >= bounds.minY - 1e-7 && point.y <= bounds.maxY + 1e-7));
  assert.deepEqual(plain(engine.boxSelect([angle], { x: bounds.minX - 1, y: bounds.minY - 1 }, { x: bounds.maxX + 1, y: bounds.maxY + 1 })), ['angle']);
  assert.deepEqual(plain(engine.boxSelect([angle], { x: arcPoint.x - 0.1, y: arcPoint.y - 0.1 }, { x: arcPoint.x + 0.1, y: arcPoint.y + 0.1 }, true)), ['angle']);
});

function dxfRecords(source) {
  const rows = source.trimEnd().split(/\r?\n/), records = [];
  let record = null, section = '';
  for (let index = 0; index < rows.length; index += 2) {
    const code = Number(rows[index]), value = rows[index + 1];
    if (code === 0) {
      if (record) records.push(record);
      record = { type: value, section, tags: [] };
      if (value === 'ENDSEC') section = '';
    }
    if (record.type === 'SECTION' && code === 2) { section = value; record.section = section; }
    record.tags.push([code, value]);
  }
  if (record) records.push(record);
  return records;
}
const tag = (record, code) => record.tags.find(([key]) => key === code)?.[1];

test('DXF exports actual editable DIMENSION entities with linked graphics blocks and style records', () => {
  const entities = [linear('horizontal'), linear('vertical'), linear('aligned'), radial('radius'), radial('diameter'), angular()].map((entity, index) => ({ ...entity, id: `dim-${index}`, unit: 'mm', precision: 3, dimScale: 2 }));
  const source = exporters.toDxf({ entities, settings: { unit: 'mm' } });
  const records = dxfRecords(source);
  const dimensions = records.filter((record) => record.type === 'DIMENSION' && record.section === 'ENTITIES');
  assert.equal(dimensions.length, 6);
  assert.deepEqual(dimensions.map((record) => Number(tag(record, 70))), [32, 32, 33, 36, 35, 37]);
  const style = records.find((record) => record.type === 'DIMSTYLE');
  assert.equal(tag(style, 40), '2'); assert.equal(tag(style, 140), '3.5'); assert.equal(tag(style, 271), '3'); assert.equal(tag(style, 3), '<>mm');
  const blocks = records.filter((record) => record.type === 'BLOCK');
  dimensions.forEach((dimension) => {
    assert.ok(blocks.some((block) => tag(block, 2) === tag(dimension, 2)));
    assert.ok(records.some((record) => record.type === 'DIMSTYLE' && tag(record, 2) === tag(dimension, 3)));
    assert.equal(tag(dimension, 1), '<>');
  });
  assert.equal(tag(dimensions[0], 14), '100'); assert.equal(tag(dimensions[0], 24), '-50');
  assert.equal(tag(dimensions[1], 50), '90');
  near(Number(tag(dimensions[2], 50)), 360 - Math.atan2(50, 100) * 180 / Math.PI, 1e-6);
  assert.equal(tag(dimensions[5], 13), '0'); assert.equal(tag(dimensions[5], 23), '-30');
  const angularStyle = records.find((record) => record.type === 'DIMSTYLE' && tag(record, 2) === tag(dimensions[5], 3));
  assert.equal(tag(angularStyle, 3), '');
  assert.ok(dimensions[2].tags.some(([code, value]) => code === 100 && value === 'AcDbAlignedDimension'));
  assert.equal(records.filter((record) => record.type === 'ARC' && record.section === 'BLOCKS').length, 1);
  assert.equal(records.filter((record) => record.type === 'SOLID' && record.section === 'BLOCKS').length, 11);
  assert.equal(records.filter((record) => record.type === 'LINE' && record.section === 'ENTITIES').length, 0);
  const handles = records.flatMap((record) => record.tags.filter(([code]) => code === 5 || code === 105).filter(([, value]) => /^[0-9A-F]+$/.test(value)).map(([, value]) => value));
  assert.equal(new Set(handles).size, handles.length);
  assert.ok(!source.includes('NaN') && !source.includes('undefined'));
});

test('SVG and canvas use the shared dimension geometry including angular arcs', () => {
  const entity = angular({ text: '측정 <>' });
  const svg = exporters.toSvg({ entities: [entity], settings: { unit: 'mm' } });
  assert.ok(svg.includes('<path d="M ')); assert.ok(svg.includes('측정 90.00°'));
  const calls = [];
  const canvas = new Proxy({}, { get: (_, key) => (...values) => calls.push([key, ...values]), set: () => true });
  exporters.drawEntity(canvas, entity);
  const arc = calls.find(([name]) => name === 'arc');
  near(arc[3], 20); near(arc[5], Math.PI / 2); assert.equal(arc[6], false);
  assert.ok(calls.some(([name, value]) => name === 'fillText' && value === '측정 90.00°'));
});
