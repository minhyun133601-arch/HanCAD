(function createCadModifyModule(Tool) {
  "use strict";

  const EPSILON = 1e-8;
  const MAX_ENTITIES = 20000;
  const TAU = Math.PI * 2;
  const engine = Tool.core.cadEngine;
  const isPoint = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) <= 1e12 && Math.abs(value.y) <= 1e12;
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const modulo = (value) => ((value % TAU) + TAU) % TAU;
  const idsSet = (model, ids) => new Set(ids === undefined ? model.state.selectedIds : Array.isArray(ids) ? ids : [ids]);
  const layerFor = (model, entity) => model.state.layers.find((layer) => layer.name === entity.layer);
  const visible = (model, entity) => layerFor(model, entity)?.visible !== false;
  const editable = (model, entity) => visible(model, entity) && !layerFor(model, entity)?.locked;

  function arcContains(entity, angle) {
    if (Math.abs(entity.endAngle - entity.startAngle) >= TAU - EPSILON) return true;
    const span = entity.clockwise ? modulo(entity.endAngle - entity.startAngle) : modulo(entity.startAngle - entity.endAngle);
    const offset = entity.clockwise ? modulo(angle - entity.startAngle) : modulo(entity.startAngle - angle);
    return offset <= span + EPSILON;
  }

  // Distances along an infinite ray, bounded only by the boundary geometry.
  function rayIntersections(origin, direction, boundary) {
    if (boundary.type === "circle" || boundary.type === "arc") {
      const relative = subtract(origin, boundary.center);
      const projection = dot(relative, direction);
      const perpendicular = cross(relative, direction);
      const discriminant = boundary.radius ** 2 - perpendicular ** 2;
      if (discriminant < -EPSILON) return [];
      const root = Math.sqrt(Math.max(0, discriminant));
      const candidates = root < EPSILON ? [-projection] : [-projection - root, -projection + root];
      return candidates.filter((along) => {
        if (along <= EPSILON) return false;
        if (boundary.type === "circle") return true;
        const x = origin.x + along * direction.x - boundary.center.x;
        const y = origin.y + along * direction.y - boundary.center.y;
        return arcContains(boundary, Math.atan2(y, x));
      });
    }
    if (!["line", "rect", "polyline"].includes(boundary.type)) return [];
    return engine.segments(boundary).flatMap(([a, b]) => {
      const segment = subtract(b, a);
      const denominator = cross(direction, segment);
      if (Math.abs(denominator) < EPSILON) return [];
      const relative = subtract(a, origin);
      const along = cross(relative, segment) / denominator;
      const portion = cross(relative, direction) / denominator;
      return along > EPSILON && portion >= -EPSILON && portion <= 1 + EPSILON ? [along] : [];
    });
  }

  function extend(model, id, clickPoint) {
    const entity = model.state.entities.find((candidate) => candidate.id === id);
    if (!entity || entity.type !== "line" || !editable(model, entity) || !isPoint(clickPoint)) return null;
    const endpoint = distance(clickPoint, entity.a) < distance(clickPoint, entity.b) ? "a" : "b";
    const origin = entity[endpoint];
    const opposite = entity[endpoint === "a" ? "b" : "a"];
    const length = distance(origin, opposite);
    if (length < EPSILON) return null;
    const direction = { x: (origin.x - opposite.x) / length, y: (origin.y - opposite.y) / length };
    let nearest = Infinity;
    model.state.entities.forEach((boundary) => {
      if (boundary.id === id || !visible(model, boundary)) return;
      rayIntersections(origin, direction, boundary).forEach((along) => { nearest = Math.min(nearest, along); });
    });
    if (!Number.isFinite(nearest)) return null;
    const end = { x: origin.x + nearest * direction.x, y: origin.y + nearest * direction.y };
    if (!isPoint(end)) return null;
    return model.update(id, { [endpoint]: end });
  }

  function explode(model, ids) {
    const wanted = idsSet(model, ids);
    const originals = model.state.entities.filter((entity) => wanted.has(entity.id) && editable(model, entity) && ["rect", "polyline"].includes(entity.type));
    if (!originals.length) return [];
    const originalIds = new Set(originals.map((entity) => entity.id));
    const reserved = new Set(model.state.entities.map((entity) => entity.id));
    const result = [];
    let sequence = 1;
    const replacements = new Map();
    originals.forEach((entity) => {
      const lines = engine.segments(entity).filter(([a, b]) => distance(a, b) >= EPSILON).map(([a, b]) => {
        while (reserved.has(`cad-explode-${sequence}`)) sequence += 1;
        const line = { id: `cad-explode-${sequence++}`, type: "line", layer: entity.layer, color: entity.color, lineWidth: entity.lineWidth, a: { ...a }, b: { ...b } };
        reserved.add(line.id); result.push(line); return line;
      });
      replacements.set(entity.id, lines);
    });
    if (!result.length || model.state.entities.length - originals.length + result.length > MAX_ENTITIES) return [];
    const snapshot = model.snapshot();
    snapshot.entities = snapshot.entities.flatMap((entity) => replacements.get(entity.id) || [entity]);
    snapshot.selectedIds = [...snapshot.selectedIds.filter((id) => !originalIds.has(id)), ...result.map((entity) => entity.id)];
    model.load(snapshot);
    return result;
  }

  // rows/columns include the original cell; spacing uses the model's x/y axes.
  function array(model, options = {}, ids) {
    const { rows = 1, columns = 1, spacingX = 0, spacingY = 0 } = options;
    if (![rows, columns].every((value) => Number.isInteger(value) && value >= 1 && value <= MAX_ENTITIES)) return [];
    if (![spacingX, spacingY].every((value) => Number.isFinite(value) && Math.abs(value) <= 1e12)) return [];
    const cells = rows * columns;
    if (cells <= 1 || cells > MAX_ENTITIES) return [];
    const wanted = idsSet(model, ids);
    const originals = model.state.entities.filter((entity) => wanted.has(entity.id) && editable(model, entity));
    if (!originals.length || model.state.entities.length + originals.length * (cells - 1) > MAX_ENTITIES) return [];
    const copies = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (row === 0 && column === 0) continue;
        const delta = { x: column * spacingX, y: row * spacingY };
        for (const entity of originals) {
          const copy = engine.transformEntity(entity, { type: "move", delta });
          if (!copy) return [];
          copy.id = "";
          copies.push(copy);
        }
      }
    }
    return model.add(copies);
  }

  function measureDistance(a, b) {
    if (!isPoint(a) || !isPoint(b)) return null;
    const deltaX = b.x - a.x;
    const deltaY = a.y - b.y;
    const length = Math.hypot(deltaX, deltaY);
    return { distance: length, deltaX, deltaY, angleDegrees: length < EPSILON ? 0 : ((Math.atan2(deltaY, deltaX) * 180 / Math.PI) + 360) % 360 };
  }

  function measureArea(value) {
    if (value?.type === "circle") {
      if (!isPoint(value.center) || !Number.isFinite(value.radius) || value.radius <= 0) return null;
      return { area: Math.PI * value.radius ** 2, perimeter: TAU * value.radius };
    }
    const points = Array.isArray(value) ? value : ["rect", "polyline"].includes(value?.type) && (value.type === "rect" || value.closed) ? value.points : null;
    if (!Array.isArray(points) || points.length < 3 || points.length > 10000 || points.some((entry) => !isPoint(entry))) return null;
    // Translate before the shoelace sum to preserve precision on distant drawings.
    const origin = points[0];
    let signedArea = 0; let perimeter = 0;
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length];
      signedArea += cross(subtract(a, origin), subtract(b, origin));
      perimeter += distance(a, b);
    });
    return { area: Math.abs(signedArea) / 2, perimeter };
  }

  Tool.core.cadModify = Object.freeze({ extend, explode, array, measureDistance, measureArea });
})(window.HeechangTool);
