import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: { HeechangTool: { core: {} } } });
for (const name of ["cad-engine.js", "cad-modify.js"]) {
  vm.runInContext(fs.readFileSync(new URL(`../packages/legacy-bridge/runtime/${name}`, import.meta.url), "utf8"), context);
}
const { cadEngine: engine, cadModify: modify } = context.window.HeechangTool.core;
const plain = (value) => JSON.parse(JSON.stringify(value));
const line = (id, a, b, layer = "0") => ({ id, type: "line", a, b, layer });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test("extend chooses the clicked endpoint and nearest visible finite boundary with one undo", () => {
  const model = engine.create({ initialState: { layers: [{ name: "hidden", visible: false }, { name: "locked", locked: true }], entities: [
    line("source", { x: 0, y: 0 }, { x: 10, y: 0 }),
    line("hidden", { x: 15, y: -1 }, { x: 15, y: 1 }, "hidden"),
    line("boundary", { x: 20, y: -1 }, { x: 20, y: 1 }, "locked"),
    line("far", { x: 30, y: -1 }, { x: 30, y: 1 }),
    line("miss", { x: 11, y: 1 }, { x: 11, y: 2 }),
    line("left", { x: -8, y: -1 }, { x: -8, y: 1 }),
  ] } });
  assert.equal(modify.extend(model, "source", { x: 9, y: 0 }).b.x, 20);
  assert.ok(model.undo());
  assert.equal(model.state.entities[0].b.x, 10);
  assert.equal(model.undo(), false);
  assert.equal(modify.extend(model, "source", { x: 1, y: 0 }).a.x, -8);
  assert.equal(modify.extend(model, "boundary", { x: 20, y: 1 }), null);
});

test("extend intersects circles and honors an arc's drawn span", () => {
  const model = engine.create({ initialState: { entities: [
    line("source", { x: 0, y: 0 }, { x: 5, y: 0 }),
    { id: "circle", type: "circle", center: { x: 20, y: 0 }, radius: 5 },
    { id: "arc", type: "arc", center: { x: 10, y: 0 }, radius: 2, startAngle: -Math.PI / 4, endAngle: Math.PI / 4, clockwise: true },
  ] } });
  near(modify.extend(model, "source", { x: 5, y: 0 }).b.x, 12);
  assert.ok(model.undo());
  model.remove("arc");
  near(modify.extend(model, "source", { x: 5, y: 0 }).b.x, 15);
  const distant = engine.create({ initialState: { entities: [
    line("source", { x: 0, y: 0 }, { x: 5, y: 0 }),
    { id: "circle", type: "circle", center: { x: 1e10, y: 0 }, radius: 5 },
  ] } });
  assert.equal(modify.extend(distant, "source", { x: 5, y: 0 }).b.x, 1e10 - 5);
});

test("explode produces exact independent edges, preserves style and selection, and is atomic", () => {
  const model = engine.create({ initialState: { selectedIds: ["box", "circle"], entities: [
    { id: "box", type: "rect", a: { x: 0, y: 0 }, b: { x: 40, y: 20 }, color: "#123456", lineWidth: 2.5 },
    { id: "circle", type: "circle", center: { x: 80, y: 0 }, radius: 5 },
  ] } });
  const edges = modify.explode(model);
  assert.equal(edges.length, 4);
  assert.equal(model.state.entities.length, 5);
  assert.ok(edges.every((entity) => entity.type === "line" && entity.color === "#123456" && entity.lineWidth === 2.5));
  assert.deepEqual(plain(edges[3].b), { x: 0, y: 0 });
  assert.ok(model.state.selectedIds.includes("circle"));
  assert.equal(new Set(model.state.entities.map((entity) => entity.id)).size, 5);
  assert.ok(model.undo());
  assert.equal(model.state.entities.length, 2);
  assert.equal(model.state.entities[0].type, "rect");
  assert.equal(model.undo(), false);
  assert.ok(model.redo());
  assert.equal(model.state.entities.length, 5);
});

test("explode leaves hidden and locked geometry untouched and respects open polylines", () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const model = engine.create({ initialState: { layers: [{ name: "hidden", visible: false }, { name: "locked", locked: true }], entities: [
    { id: "open", type: "polyline", points },
    { id: "hidden", type: "polyline", points, layer: "hidden" },
    { id: "locked", type: "polyline", points, layer: "locked" },
  ] } });
  assert.equal(modify.explode(model, ["open", "hidden", "locked"]).length, 2);
  assert.equal(model.state.entities.filter((entity) => entity.type === "polyline").length, 2);
});

test("rectangular array copies editable selection by row/column spacing with one undo", () => {
  const model = engine.create({ initialState: { layers: [{ name: "locked", locked: true }], selectedIds: ["source"], entities: [
    line("source", { x: 1, y: 2 }, { x: 11, y: 2 }),
    line("locked", { x: 0, y: 0 }, { x: 10, y: 0 }, "locked"),
  ] } });
  const copies = modify.array(model, { rows: 2, columns: 3, spacingX: 20, spacingY: -15 }, ["source", "locked"]);
  assert.equal(copies.length, 5);
  assert.deepEqual(plain(copies.at(-1).a), { x: 41, y: -13 });
  assert.equal(new Set(model.state.entities.map((entity) => entity.id)).size, 7);
  assert.ok(model.undo());
  assert.equal(model.state.entities.length, 2);
  assert.equal(model.undo(), false);
  assert.ok(model.redo());
  assert.equal(model.state.entities.length, 7);
  const before = plain(model.snapshot());
  assert.equal(modify.array(model, { rows: 1.5, columns: 3 }).length, 0);
  assert.equal(modify.array(model, { rows: 200, columns: 200 }).length, 0);
  assert.deepEqual(plain(model.snapshot()), before);
});

test("measurement reports CAD axes, polygon/circle area, and excludes unclosed outlines", () => {
  const measured = modify.measureDistance({ x: 0, y: 0 }, { x: 3, y: -4 });
  near(measured.distance, 5); near(measured.angleDegrees, 53.13010235415598);
  assert.equal(measured.deltaY, 4);
  const points = [{ x: 1e10, y: 1e10 }, { x: 1e10 + 40, y: 1e10 }, { x: 1e10 + 40, y: 1e10 + 20 }, { x: 1e10, y: 1e10 + 20 }];
  assert.deepEqual(plain(modify.measureArea(points)), { area: 800, perimeter: 120 });
  assert.deepEqual(plain(modify.measureArea([...points].reverse())), { area: 800, perimeter: 120 });
  assert.equal(modify.measureArea({ type: "polyline", points }), null);
  near(modify.measureArea({ type: "circle", center: { x: 0, y: 0 }, radius: 5 }).area, Math.PI * 25);
  assert.equal(modify.measureDistance({ x: NaN, y: 0 }, { x: 0, y: 0 }), null);
});
