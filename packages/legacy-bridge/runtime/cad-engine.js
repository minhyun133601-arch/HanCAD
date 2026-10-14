(function createCadEngineModule(Tool) {
  "use strict";

  const EPSILON = 1e-8;
  const TAU = Math.PI * 2;
  const ENTITY_LIMIT = 500000;
  const TYPES = new Set(["line", "polyline", "rect", "circle", "arc", "text", "dimension"]);
  const DEFAULT_SETTINGS = Object.freeze({
    unit: "mm", grid: true, gridSnap: false, ortho: false, objectSnap: true,
    gridSize: 10, color: "#e2e8f0", lineWidth: 1.5, layer: "0", textSize: 3.5,
    dimPrecision: 2, dimScale: 1, dimTextSize: 3.5, arrowSize: 2.5,
    extensionGap: 1, extensionOvershoot: 2, dimUnit: "",
  });
  const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?";
  const CARTESIAN = new RegExp(`^(@)?\\s*(${NUMBER})\\s*,\\s*(${NUMBER})$`, "i");
  const POLAR = new RegExp(`^@\\s*(${NUMBER})\\s*<\\s*(${NUMBER})$`, "i");
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const finite = (value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12;
  const point = (value) => value && finite(value.x) && finite(value.y) ? { x: value.x, y: value.y } : null;
  const addPoint = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const multiply = (a, value) => ({ x: a.x * value, y: a.y * value });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const modulo = (angle) => ((angle % TAU) + TAU) % TAU;
  const color = (value, fallback = DEFAULT_SETTINGS.color) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
  const layerName = (value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : "0";
  const positive = (value, fallback, maximum = 1e6) => finite(value) && value > EPSILON ? Math.min(value, maximum) : fallback;
  const nonnegative = (value, fallback, maximum = 1e6) => finite(value) && value >= 0 ? Math.min(value, maximum) : fallback;
  const DIMENSION_KINDS = new Set(["aligned", "horizontal", "vertical", "radius", "diameter", "angular"]);
  const precision = (value, fallback = 2) => Number.isInteger(value) ? Math.max(0, Math.min(8, value)) : fallback;

  function parsePoint(input, base = { x: 0, y: 0 }) {
    if (typeof input !== "string") return null;
    const text = input.trim();
    const cartesian = text.match(CARTESIAN);
    if (cartesian) {
      const x = Number(cartesian[2]);
      const y = -Number(cartesian[3]);
      const origin = cartesian[1] ? point(base) : { x: 0, y: 0 };
      return origin ? point({ x: origin.x + x, y: origin.y + y }) : null;
    }
    const polar = text.match(POLAR);
    if (!polar || !point(base)) return null;
    const length = Number(polar[1]);
    const angle = Number(polar[2]) * Math.PI / 180;
    if (!finite(length) || length < 0 || !finite(angle)) return null;
    return point({ x: base.x + length * Math.cos(angle), y: base.y - length * Math.sin(angle) });
  }

  function normalizeSettings(raw = {}) {
    const settings = { ...DEFAULT_SETTINGS };
    ["grid", "gridSnap", "ortho", "objectSnap"].forEach((name) => {
      if (typeof raw[name] === "boolean") settings[name] = raw[name];
    });
    settings.unit = ["", "mm", "cm", "m"].includes(raw.unit) ? raw.unit : settings.unit;
    settings.gridSize = positive(raw.gridSize, settings.gridSize);
    settings.color = color(raw.color);
    settings.lineWidth = positive(raw.lineWidth, settings.lineWidth, 100);
    settings.textSize = positive(raw.textSize, settings.textSize, 1000);
    settings.dimPrecision = precision(raw.dimPrecision);
    settings.dimScale = positive(raw.dimScale, settings.dimScale, 10000);
    settings.dimTextSize = positive(raw.dimTextSize, settings.dimTextSize, 1000);
    settings.arrowSize = positive(raw.arrowSize, settings.arrowSize, 1000);
    settings.extensionGap = nonnegative(raw.extensionGap, settings.extensionGap);
    settings.extensionOvershoot = nonnegative(raw.extensionOvershoot, settings.extensionOvershoot);
    settings.dimUnit = ["", "mm", "cm", "m"].includes(raw.dimUnit) ? raw.dimUnit : settings.dimUnit;
    settings.layer = layerName(raw.layer);
    return settings;
  }

  function normalizeEntity(raw, settings = DEFAULT_SETTINGS) {
    if (!raw || !TYPES.has(raw.type)) return null;
    const entity = {
      id: typeof raw.id === "string" && raw.id.length <= 120 ? raw.id : "",
      type: raw.type, layer: layerName(raw.layer || settings.layer),
      color: color(raw.color, settings.color), lineWidth: positive(raw.lineWidth, settings.lineWidth, 100),
    };
    if (raw.type === "line") {
      entity.a = point(raw.a); entity.b = point(raw.b);
      if (!entity.a || !entity.b || distance(entity.a, entity.b) < EPSILON) return null;
    } else if (raw.type === "dimension") {
      entity.kind = DIMENSION_KINDS.has(raw.kind) ? raw.kind : "aligned";
      entity.precision = precision(raw.precision, settings.dimPrecision ?? 2);
      entity.dimScale = positive(raw.dimScale, settings.dimScale ?? 1, 10000);
      entity.textSize = positive(raw.textSize, settings.dimTextSize ?? 3.5, 1000);
      entity.arrowSize = positive(raw.arrowSize, settings.arrowSize ?? 2.5, 1000);
      entity.extensionGap = nonnegative(raw.extensionGap, settings.extensionGap ?? 1);
      entity.extensionOvershoot = nonnegative(raw.extensionOvershoot, settings.extensionOvershoot ?? 2);
      entity.unit = typeof raw.unit === "string" ? raw.unit.slice(0, 32) : (settings.dimUnit ?? "");
      if (typeof raw.text === "string") entity.text = raw.text.slice(0, 2000);
      if (["radius", "diameter"].includes(entity.kind)) {
        entity.center = point(raw.center); entity.radius = raw.radius;
        if (!entity.center || !finite(entity.radius) || entity.radius <= EPSILON) return null;
        entity.placement = point(raw.placement) || { x: entity.center.x + entity.radius * 1.4, y: entity.center.y };
        if (distance(entity.center, entity.placement) <= EPSILON) return null;
      } else {
        entity.a = point(raw.a); entity.b = point(raw.b);
        if (!entity.a || !entity.b || distance(entity.a, entity.b) < EPSILON) return null;
        entity.offset = finite(raw.offset) ? raw.offset : 20;
        if (entity.kind === "angular") {
          entity.center = point(raw.center);
          if (!entity.center || distance(entity.center, entity.a) < EPSILON || distance(entity.center, entity.b) < EPSILON || entity.offset <= EPSILON) return null;
          const start = Math.atan2(entity.a.y - entity.center.y, entity.a.x - entity.center.x);
          const end = Math.atan2(entity.b.y - entity.center.y, entity.b.x - entity.center.x);
          entity.clockwise = typeof raw.clockwise === "boolean" ? raw.clockwise : modulo(end - start) <= Math.PI;
          if (modulo(end - start) < EPSILON || TAU - modulo(end - start) < EPSILON) return null;
        } else if (entity.kind !== "aligned") {
          if (finite(raw.axisAngle)) entity.axisAngle = raw.axisAngle;
          const angle = entity.axisAngle ?? (entity.kind === "vertical" ? -Math.PI / 2 : 0);
          if (Math.abs((entity.b.x - entity.a.x) * Math.cos(angle) + (entity.b.y - entity.a.y) * Math.sin(angle)) < EPSILON) return null;
        }
      }
    } else if (["polyline", "rect"].includes(raw.type)) {
      if (raw.type === "rect" && point(raw.a) && point(raw.b) && !Array.isArray(raw.points)) {
        const a = point(raw.a); const b = point(raw.b);
        entity.points = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      } else {
        if (!Array.isArray(raw.points) || raw.points.length > 10000) return null;
        entity.points = raw.points.map(point);
      }
      if (entity.points.some((entry) => !entry) || entity.points.length < 2 || (raw.type === "rect" && entity.points.length !== 4)) return null;
      if (raw.type === "rect" && (distance(entity.points[0], entity.points[1]) < EPSILON || distance(entity.points[1], entity.points[2]) < EPSILON)) return null;
      entity.closed = raw.type === "rect" || raw.closed === true;
    } else if (["circle", "arc"].includes(raw.type)) {
      entity.center = point(raw.center); entity.radius = raw.radius;
      if (!entity.center || !finite(raw.radius) || raw.radius < EPSILON) return null;
      if (raw.type === "arc") {
        if (!finite(raw.startAngle) || !finite(raw.endAngle)) return null;
        entity.startAngle = raw.startAngle; entity.endAngle = raw.endAngle;
        entity.clockwise = raw.clockwise === true;
      }
    } else if (raw.type === "text") {
      entity.point = point(raw.point);
      if (!entity.point || typeof raw.text !== "string" || !raw.text.trim()) return null;
      entity.text = raw.text.slice(0, 2000);
      entity.textSize = positive(raw.textSize, settings.textSize, 1000);
      entity.rotation = finite(raw.rotation) ? raw.rotation : 0;
    }
    return entity;
  }

  function normalizeState(raw = {}) {
    if (!raw || typeof raw !== "object") raw = {};
    const settings = normalizeSettings(raw.settings || {});
    const layers = [{ name: "0", color: DEFAULT_SETTINGS.color, visible: true, locked: false }];
    const seenLayers = new Set(["0"]);
    (Array.isArray(raw.layers) ? raw.layers.slice(0, 256) : []).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const name = layerName(entry.name);
      const layer = { name, color: color(entry.color), visible: entry.visible !== false, locked: entry.locked === true };
      if (name === "0") Object.assign(layers[0], layer);
      else if (!seenLayers.has(name)) { layers.push(layer); seenLayers.add(name); }
    });
    if (!seenLayers.has(settings.layer)) settings.layer = "0";
    const ids = new Set();
    let counter = 1;
    if (Array.isArray(raw.entities) && raw.entities.length > ENTITY_LIMIT) throw new Error(`도면 객체가 지원 한도 ${ENTITY_LIMIT.toLocaleString()}개를 초과합니다.`);
    const entities = (Array.isArray(raw.entities) ? raw.entities : []).map((entry) => normalizeEntity(entry, settings)).filter(Boolean);
    const reservedIds = new Set(entities.map((entity) => entity.id).filter(Boolean));
    entities.forEach((entity) => {
      if (!entity.id || ids.has(entity.id)) {
        while (ids.has(`cad-${counter}`) || reservedIds.has(`cad-${counter}`)) counter += 1;
        entity.id = `cad-${counter++}`;
      }
      ids.add(entity.id);
      if (!seenLayers.has(entity.layer)) {
        layers.push({ name: entity.layer, color: entity.color, visible: true, locked: false });
        seenLayers.add(entity.layer);
      }
    });
    if (!seenLayers.has(settings.layer)) settings.layer = "0";
    const selectedIds = [...new Set(Array.isArray(raw.selectedIds) ? raw.selectedIds : [])].filter((id) => ids.has(id));
    const name = typeof raw.name === "string" ? raw.name.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120) : "";
    return { version: 1, name: name || "새 도면", entities, layers, selectedIds, settings };
  }

  function arcContains(entity, angle) {
    if (Math.abs(entity.endAngle - entity.startAngle) >= TAU - EPSILON) return true;
    const span = entity.clockwise ? modulo(entity.endAngle - entity.startAngle) : modulo(entity.startAngle - entity.endAngle);
    const offset = entity.clockwise ? modulo(angle - entity.startAngle) : modulo(entity.startAngle - angle);
    return offset <= span + EPSILON;
  }

  function circlePoint(entity, angle) {
    return { x: entity.center.x + entity.radius * Math.cos(angle), y: entity.center.y + entity.radius * Math.sin(angle) };
  }

  function dimensionGeometry(raw, unit) {
    const entity = normalizeEntity(raw);
    if (!entity || entity.type !== "dimension") return null;
    const kind = entity.kind;
    const scale = entity.dimScale;
    const textSize = entity.textSize * scale, arrowSize = entity.arrowSize * scale;
    const gap = entity.extensionGap * scale, overshoot = entity.extensionOvershoot * scale;
    const lines = [], arrows = [], arcs = [], snapPoints = [];
    let q1, q2, normal, labelPoint, textPoint, rotation, measurement, direction;
    const arrow = (tip, into) => {
      const side = { x: -into.y, y: into.x };
      const base = addPoint(tip, multiply(into, arrowSize));
      arrows.push([tip, addPoint(base, multiply(side, arrowSize * 0.32)), addPoint(base, multiply(side, -arrowSize * 0.32))]);
    };
    const extension = (from, to) => {
      const vector = subtract(to, from), length = Math.hypot(vector.x, vector.y);
      if (length <= EPSILON) return;
      const along = multiply(vector, 1 / length);
      lines.push([addPoint(from, multiply(along, Math.min(gap, length))), addPoint(to, multiply(along, overshoot))]);
    };
    const readable = (angle) => {
      angle = Math.atan2(Math.sin(angle), Math.cos(angle));
      return angle > Math.PI / 2 || angle < -Math.PI / 2 ? angle + Math.PI : angle;
    };
    if (["aligned", "horizontal", "vertical"].includes(kind)) {
      const vector = subtract(entity.b, entity.a);
      if (kind === "aligned") {
        direction = multiply(vector, 1 / distance(entity.a, entity.b));
        measurement = distance(entity.a, entity.b);
      } else {
        const axis = entity.axisAngle ?? (kind === "vertical" ? -Math.PI / 2 : 0);
        direction = { x: Math.cos(axis), y: Math.sin(axis) };
        measurement = Math.abs(dot(vector, direction));
      }
      normal = { x: -direction.y, y: direction.x };
      q1 = addPoint(entity.a, multiply(normal, entity.offset));
      q2 = kind === "aligned" ? addPoint(entity.b, multiply(normal, entity.offset)) : addPoint(q1, multiply(direction, dot(vector, direction)));
      direction = multiply(subtract(q2, q1), 1 / (distance(q1, q2) || 1));
      extension(entity.a, q1); extension(entity.b, q2);
      labelPoint = midpoint(q1, q2);
      textPoint = addPoint(labelPoint, multiply(normal, (entity.offset < 0 ? -1 : 1) * textSize * 0.85));
      rotation = readable(Math.atan2(direction.y, direction.x));
      const outside = measurement < arrowSize * 3;
      lines.push([outside ? addPoint(q1, multiply(direction, -arrowSize * 1.8)) : q1, outside ? addPoint(q2, multiply(direction, arrowSize * 1.8)) : q2]);
      arrow(q1, multiply(direction, outside ? -1 : 1)); arrow(q2, multiply(direction, outside ? 1 : -1));
      snapPoints.push(entity.a, entity.b, q1, q2, labelPoint);
    } else if (["radius", "diameter"].includes(kind)) {
      direction = multiply(subtract(entity.placement, entity.center), 1 / distance(entity.placement, entity.center));
      normal = { x: -direction.y, y: direction.x };
      q1 = kind === "radius" ? entity.center : addPoint(entity.center, multiply(direction, -entity.radius));
      q2 = addPoint(entity.center, multiply(direction, entity.radius));
      measurement = entity.radius * (kind === "diameter" ? 2 : 1);
      labelPoint = entity.placement;
      textPoint = addPoint(labelPoint, multiply(normal, -textSize * 0.85));
      rotation = readable(Math.atan2(direction.y, direction.x));
      lines.push([q1, q2]);
      if (distance(entity.placement, entity.center) > entity.radius) lines.push([q2, entity.placement]);
      arrow(q2, multiply(direction, -1));
      if (kind === "diameter") arrow(q1, direction);
      snapPoints.push(entity.center, q1, q2, entity.placement);
    } else {
      const startAngle = Math.atan2(entity.a.y - entity.center.y, entity.a.x - entity.center.x);
      const endAngle = Math.atan2(entity.b.y - entity.center.y, entity.b.x - entity.center.x);
      const sweep = entity.clockwise ? modulo(endAngle - startAngle) : -modulo(startAngle - endAngle);
      const arc = { center: entity.center, radius: entity.offset, startAngle, endAngle: startAngle + sweep, clockwise: entity.clockwise };
      arcs.push(arc);
      q1 = circlePoint(arc, startAngle); q2 = circlePoint(arc, startAngle + sweep);
      extension(entity.a, q1); extension(entity.b, q2);
      const midAngle = startAngle + sweep / 2;
      normal = { x: Math.cos(midAngle), y: Math.sin(midAngle) };
      labelPoint = circlePoint(arc, midAngle);
      textPoint = addPoint(labelPoint, multiply(normal, textSize * 0.85));
      rotation = readable(midAngle + Math.PI / 2);
      measurement = Math.abs(sweep) * 180 / Math.PI;
      const tangent = (angle) => ({ x: -Math.sin(angle) * Math.sign(sweep), y: Math.cos(angle) * Math.sign(sweep) });
      arrow(q1, tangent(startAngle)); arrow(q2, multiply(tangent(startAngle + sweep), -1));
      snapPoints.push(entity.center, entity.a, entity.b, q1, q2, labelPoint);
    }
    const suffix = kind === "angular" ? "°" : (Object.prototype.hasOwnProperty.call(raw, "unit") ? entity.unit : (unit ?? entity.unit));
    const prefix = kind === "radius" ? "R" : kind === "diameter" ? "⌀" : "";
    const measured = `${prefix}${measurement.toFixed(entity.precision)}${suffix}`;
    const label = entity.text ? entity.text.replace(/<>/g, measured) : measured;
    const points = [...snapPoints, ...lines.flat(), ...arrows.flat()];
    arcs.forEach((arc) => points.push(...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].filter((angle) => arcContains(arc, angle)).map((angle) => circlePoint(arc, angle))));
    const labelCorners = textCorners({ point: textPoint, text: label, textSize, rotation }, true);
    points.push(...labelCorners);
    return { kind, q1, q2, a: entity.a || q1, b: entity.b || q2, normal, direction, length: measurement, measurement,
      labelPoint, textPoint, textSize, arrowSize, rotation, label, lines, arrows, arcs, points, snapPoints, textCorners: labelCorners };
  }

  function textCorners(entity, centered = false) {
    const size = entity.textSize || 16;
    const lines = String(entity.text || "").split(/\r?\n/);
    const width = Math.max(size * 0.6, ...lines.map((line) => Array.from(line).reduce((sum, character) => sum + (character.charCodeAt(0) > 127 ? 1.05 : 0.85) * size, 0)));
    const angle = entity.rotation || 0;
    const cosine = Math.cos(angle); const sine = Math.sin(angle);
    const left = centered ? -width / 2 : 0;
    const top = centered ? -size * 0.6 : -size;
    const bottom = top + size * 1.2 + (lines.length - 1) * size * 1.25;
    return [{ x: left, y: top }, { x: left + width, y: top }, { x: left + width, y: bottom }, { x: left, y: bottom }].map((entry) => ({
      x: entity.point.x + entry.x * cosine - entry.y * sine,
      y: entity.point.y + entry.x * sine + entry.y * cosine,
    }));
  }

  function dimensionTextCorners(entity) {
    const geometry = dimensionGeometry(entity);
    return geometry.textCorners;
  }

  function entityPoints(entity) {
    if (entity.type === "line") return [entity.a, entity.b];
    if (entity.type === "dimension") {
      const geometry = dimensionGeometry(entity);
      return geometry.points;
    }
    if (["rect", "polyline"].includes(entity.type)) return entity.points;
    if (entity.type === "text") return textCorners(entity);
    if (entity.type === "circle") return [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => circlePoint(entity, angle));
    if (entity.type === "arc") return [entity.startAngle, entity.endAngle, ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].filter((angle) => arcContains(entity, angle))].map((angle) => circlePoint(entity, angle));
    return [];
  }

  function bounds(value) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = false;
    for (const entity of Array.isArray(value) ? value : value ? [value] : []) {
      for (const entry of entityPoints(entity)) {
        minX = Math.min(minX, entry.x); minY = Math.min(minY, entry.y);
        maxX = Math.max(maxX, entry.x); maxY = Math.max(maxY, entry.y); found = true;
      }
    }
    if (!found) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function segments(entity) {
    if (entity.type === "line") return [[entity.a, entity.b]];
    if (entity.type === "dimension") {
      const geometry = dimensionGeometry(entity);
      const arcSegments = geometry.arcs.flatMap((arc) => {
        const sweep = arc.endAngle - arc.startAngle, steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 90)));
        return Array.from({ length: steps }, (_, index) => [circlePoint(arc, arc.startAngle + sweep * index / steps), circlePoint(arc, arc.startAngle + sweep * (index + 1) / steps)]);
      });
      const arrowSegments = geometry.arrows.flatMap((triangle) => triangle.map((entry, index) => [entry, triangle[(index + 1) % 3]]));
      return [...geometry.lines, ...arrowSegments, ...arcSegments];
    }
    if (["rect", "polyline", "text"].includes(entity.type)) {
      const points = entity.type === "text" ? textCorners(entity) : entity.points;
      const result = points.slice(1).map((entry, index) => [points[index], entry]);
      if (entity.closed || entity.type === "text") result.push([points[points.length - 1], points[0]]);
      return result;
    }
    return [];
  }

  function segmentParameter(testPoint, a, b) {
    const vector = subtract(b, a);
    return dot(subtract(testPoint, a), vector) / (dot(vector, vector) || 1);
  }

  function distanceToSegment(testPoint, a, b) {
    return distance(testPoint, addPoint(a, multiply(subtract(b, a), Math.max(0, Math.min(1, segmentParameter(testPoint, a, b))))));
  }

  function insidePolygon(testPoint, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]; const b = points[j];
      if ((a.y > testPoint.y) !== (b.y > testPoint.y) && testPoint.x < (b.x - a.x) * (testPoint.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function hitDistance(entity, testPoint) {
    if (entity.type === "circle") return Math.abs(distance(testPoint, entity.center) - entity.radius);
    if (entity.type === "arc") {
      const angle = Math.atan2(testPoint.y - entity.center.y, testPoint.x - entity.center.x);
      return arcContains(entity, angle) ? Math.abs(distance(testPoint, entity.center) - entity.radius) : Math.min(distance(testPoint, circlePoint(entity, entity.startAngle)), distance(testPoint, circlePoint(entity, entity.endAngle)));
    }
    if (entity.type === "text" && insidePolygon(testPoint, textCorners(entity))) return 0;
    if (entity.type === "dimension") {
      const geometry = dimensionGeometry(entity);
      if (insidePolygon(testPoint, dimensionTextCorners(entity)) || geometry.arrows.some((triangle) => insidePolygon(testPoint, triangle))) return 0;
      const arcDistance = geometry.arcs.map((arc) => arcContains(arc, Math.atan2(testPoint.y - arc.center.y, testPoint.x - arc.center.x)) ? Math.abs(distance(testPoint, arc.center) - arc.radius) : Math.min(distance(testPoint, circlePoint(arc, arc.startAngle)), distance(testPoint, circlePoint(arc, arc.endAngle))));
      return Math.min(...geometry.lines.map(([a, b]) => distanceToSegment(testPoint, a, b)), ...geometry.arrows.flatMap((triangle) => triangle.map((a, index) => distanceToSegment(testPoint, a, triangle[(index + 1) % 3]))), ...arcDistance);
    }
    return Math.min(...segments(entity).map(([a, b]) => distanceToSegment(testPoint, a, b)));
  }

  function hitTest(entities, testPoint, tolerance = 6) {
    let result = null; let nearest = tolerance;
    for (let index = entities.length - 1; index >= 0; index -= 1) {
      const entity = entities[index];
      const candidateDistance = hitDistance(entity, testPoint);
      if (candidateDistance <= nearest && (!result || candidateDistance < nearest - EPSILON)) {
        result = entity; nearest = candidateDistance;
      }
    }
    return result;
  }

  function lineIntersection(a, b, c, d, bounded = true) {
    const ab = subtract(b, a); const cd = subtract(d, c);
    const denominator = cross(ab, cd);
    if (Math.abs(denominator) < EPSILON) return null;
    const ac = subtract(c, a);
    const t = cross(ac, cd) / denominator; const u = cross(ac, ab) / denominator;
    if (bounded && (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON)) return null;
    return addPoint(a, multiply(ab, t));
  }

  function lineCircleIntersections(a, b, circle) {
    const vector = subtract(b, a); const offset = subtract(a, circle.center);
    const qa = dot(vector, vector); const qb = 2 * dot(offset, vector); const qc = dot(offset, offset) - circle.radius ** 2;
    if (qa < EPSILON) return [];
    const discriminant = qb * qb - 4 * qa * qc;
    if (discriminant < -EPSILON) return [];
    const root = Math.sqrt(Math.max(0, discriminant));
    const candidates = root < EPSILON ? [-qb / (2 * qa)] : [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)];
    return candidates.filter((t) => t >= -EPSILON && t <= 1 + EPSILON).map((t) => addPoint(a, multiply(vector, t))).filter((entry) => circle.type !== "arc" || arcContains(circle, Math.atan2(entry.y - circle.center.y, entry.x - circle.center.x)));
  }

  function circleIntersections(a, b) {
    const length = distance(a.center, b.center);
    if (length < EPSILON || length > a.radius + b.radius + EPSILON || length < Math.abs(a.radius - b.radius) - EPSILON) return [];
    const along = (a.radius ** 2 - b.radius ** 2 + length ** 2) / (2 * length);
    const height = Math.sqrt(Math.max(0, a.radius ** 2 - along ** 2));
    const unit = multiply(subtract(b.center, a.center), 1 / length);
    const center = addPoint(a.center, multiply(unit, along));
    const normal = { x: -unit.y, y: unit.x };
    return (height < EPSILON ? [center] : [addPoint(center, multiply(normal, height)), addPoint(center, multiply(normal, -height))]).filter((entry) => [a, b].every((entity) => entity.type !== "arc" || arcContains(entity, Math.atan2(entry.y - entity.center.y, entry.x - entity.center.x))));
  }

  function intersections(a, b) {
    const aCircle = ["circle", "arc"].includes(a.type); const bCircle = ["circle", "arc"].includes(b.type);
    if (aCircle && bCircle) return circleIntersections(a, b);
    if (aCircle) return segments(b).flatMap(([p, q]) => lineCircleIntersections(p, q, a));
    if (bCircle) return segments(a).flatMap(([p, q]) => lineCircleIntersections(p, q, b));
    return segments(a).flatMap(([p, q]) => segments(b).map(([r, s]) => lineIntersection(p, q, r, s)).filter(Boolean));
  }

  function snap(entities, testPoint, tolerance = 6) {
    const candidates = [];
    entities.forEach((entity) => {
      if (["circle", "arc"].includes(entity.type)) {
        candidates.push({ point: entity.center, type: "center", entityId: entity.id });
        if (entity.type === "arc") [entity.startAngle, entity.endAngle].forEach((angle) => candidates.push({ point: circlePoint(entity, angle), type: "endpoint", entityId: entity.id }));
        else [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((angle) => candidates.push({ point: circlePoint(entity, angle), type: "quadrant", entityId: entity.id }));
      } else if (entity.type === "text") candidates.push({ point: entity.point, type: "endpoint", entityId: entity.id });
      else if (entity.type === "dimension") dimensionGeometry(entity).snapPoints.forEach((at) => candidates.push({ point: at, type: entity.center && distance(at, entity.center) < EPSILON ? "center" : "endpoint", entityId: entity.id }));
      else segments(entity).forEach(([a, b]) => {
        candidates.push({ point: a, type: "endpoint", entityId: entity.id }, { point: b, type: "endpoint", entityId: entity.id }, { point: midpoint(a, b), type: "midpoint", entityId: entity.id });
      });
    });
    // Spatially limit intersection work to objects near the cursor.
    const nearby = entities.filter((entity) => hitDistance(entity, testPoint) <= tolerance).slice(-80);
    nearby.forEach((entity, index) => nearby.slice(index + 1).forEach((other) => intersections(entity, other).forEach((entry) => candidates.push({ point: entry, type: "intersection", entityId: entity.id, otherId: other.id }))));
    let nearest = null;
    candidates.forEach((candidate) => {
      const length = distance(candidate.point, testPoint);
      if (length <= tolerance && (!nearest || length < nearest.distance - EPSILON || (Math.abs(length - nearest.distance) < EPSILON && candidate.type === "intersection"))) nearest = { ...candidate, x: candidate.point.x, y: candidate.point.y, distance: length };
    });
    return nearest;
  }

  function boxSelect(entities, a, b, crossing = false) {
    const minX = Math.min(a.x, b.x); const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y); const maxY = Math.max(a.y, b.y);
    const inside = (entry) => entry.x >= minX && entry.x <= maxX && entry.y >= minY && entry.y <= maxY;
    const box = { type: "rect", points: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }], closed: true };
    return entities.filter((entity) => {
      const extent = bounds(entity);
      if (!extent || extent.maxX < minX || extent.minX > maxX || extent.maxY < minY || extent.minY > maxY) return false;
      if (!crossing) return extent.minX >= minX && extent.maxX <= maxX && extent.minY >= minY && extent.maxY <= maxY;
      return entityPoints(entity).some(inside) || intersections(entity, box).length > 0 || (entity.type === "text" && insidePolygon(box.points[0], textCorners(entity))) || (entity.type === "dimension" && insidePolygon(box.points[0], dimensionTextCorners(entity)));
    }).map((entity) => entity.id);
  }

  function transformEntity(entity, options) {
    const result = clone(entity);
    const type = options.type === "copy" ? "move" : options.type;
    const base = point(options.base) || { x: 0, y: 0 };
    const delta = point(options.delta) || { x: 0, y: 0 };
    const angle = -(finite(options.angle) ? options.angle : 0) * Math.PI / 180;
    const factor = finite(options.factor) && options.factor > EPSILON ? options.factor : 1;
    const axisA = point(options.axisA) || base; const axisB = point(options.axisB) || { x: base.x, y: base.y + 1 };
    const axis = subtract(axisB, axisA); const denominator = dot(axis, axis);
    if (type === "mirror" && denominator < EPSILON) return null;
    if (!["move", "rotate", "scale", "mirror"].includes(type)) return null;
    const apply = (entry) => {
      if (type === "move") return addPoint(entry, delta);
      if (type === "scale") return addPoint(base, multiply(subtract(entry, base), factor));
      if (type === "mirror") {
        const projection = addPoint(axisA, multiply(axis, dot(subtract(entry, axisA), axis) / denominator));
        return subtract(multiply(projection, 2), entry);
      }
      const relative = subtract(entry, base);
      return addPoint(base, { x: relative.x * Math.cos(angle) - relative.y * Math.sin(angle), y: relative.x * Math.sin(angle) + relative.y * Math.cos(angle) });
    };
    ["a", "b", "point", "center", "placement"].forEach((name) => { if (result[name]) result[name] = apply(result[name]); });
    if (result.points) result.points = result.points.map(apply);
    if (type === "scale") {
      if (result.radius) result.radius *= factor;
      if (result.textSize) result.textSize *= factor;
      if (result.offset !== undefined) result.offset *= factor;
      if (result.type === "dimension") ["arrowSize", "extensionGap", "extensionOvershoot"].forEach((name) => { if (result[name] !== undefined) result[name] *= factor; });
    }
    if (result.type === "arc" && ["rotate", "mirror"].includes(type)) {
      const start = apply(circlePoint(entity, entity.startAngle)); const end = apply(circlePoint(entity, entity.endAngle));
      result.startAngle = Math.atan2(start.y - result.center.y, start.x - result.center.x);
      result.endAngle = Math.atan2(end.y - result.center.y, end.x - result.center.x);
      if (type === "mirror") result.clockwise = !result.clockwise;
      if (Math.abs(entity.endAngle - entity.startAngle) >= TAU - EPSILON) result.endAngle = result.startAngle + (result.clockwise ? TAU : -TAU);
    }
    if (result.type === "text") {
      if (type === "rotate") result.rotation += angle;
      if (type === "mirror") result.rotation = 2 * Math.atan2(axis.y, axis.x) - result.rotation;
    }
    if (result.type === "dimension") {
      if (["horizontal", "vertical"].includes(result.kind) && ["rotate", "mirror"].includes(type)) {
        const originalAngle = entity.axisAngle ?? (entity.kind === "vertical" ? -Math.PI / 2 : 0);
        const from = apply(entity.a), to = apply(addPoint(entity.a, { x: Math.cos(originalAngle), y: Math.sin(originalAngle) }));
        result.axisAngle = Math.atan2(to.y - from.y, to.x - from.x);
      }
      if (type === "mirror") {
        if (result.kind === "angular") result.clockwise = !result.clockwise;
        else if (result.offset !== undefined) result.offset *= -1;
      }
    }
    return normalizeEntity(result, DEFAULT_SETTINGS);
  }

  function offsetEntity(entity, amount, sidePoint) {
    if (!finite(amount) || Math.abs(amount) < EPSILON) return null;
    const result = clone(entity);
    if (["circle", "arc"].includes(entity.type)) {
      let sign = Math.sign(amount);
      if (point(sidePoint)) sign = distance(sidePoint, entity.center) < entity.radius ? -1 : 1;
      result.radius += Math.abs(amount) * sign;
      return result.radius > EPSILON ? result : null;
    }
    if (!["line", "rect", "polyline"].includes(entity.type)) return null;
    const lines = segments(entity);
    if (!lines.length || lines.some(([a, b]) => distance(a, b) < EPSILON)) return null;
    let signedAmount = amount;
    if (point(sidePoint)) {
      const nearest = lines.reduce((best, line) => distanceToSegment(sidePoint, ...line) < distanceToSegment(sidePoint, ...best) ? line : best, lines[0]);
      signedAmount = Math.abs(amount) * (cross(subtract(nearest[1], nearest[0]), subtract(sidePoint, nearest[0])) >= 0 ? 1 : -1);
    }
    const shifted = lines.map(([a, b]) => {
      const direction = subtract(b, a); const length = distance(a, b);
      const normal = { x: -direction.y / length * signedAmount, y: direction.x / length * signedAmount };
      return [addPoint(a, normal), addPoint(b, normal)];
    });
    if (entity.type === "line") { result.a = shifted[0][0]; result.b = shifted[0][1]; return result; }
    const closed = entity.closed;
    const points = entity.points.map((entry, index) => {
      if (!closed && index === 0) return shifted[0][0];
      if (!closed && index === entity.points.length - 1) return shifted[shifted.length - 1][1];
      const before = shifted[(index - 1 + shifted.length) % shifted.length]; const after = shifted[index % shifted.length];
      return lineIntersection(...before, ...after, false) || midpoint(before[1], after[0]);
    });
    if (points.some((entry) => !point(entry))) return null;
    // Avoid inverted edges when a closed outline collapses under an inward offset.
    if (closed && points.some((entry, index) => dot(subtract(points[(index + 1) % points.length], entry), subtract(entity.points[(index + 1) % points.length], entity.points[index])) <= EPSILON)) return null;
    result.points = points;
    return result;
  }

  function create(options = {}) {
    const state = normalizeState(options.initialState);
    const history = []; const future = [];
    let idCounter = 1;
    const layerFor = (entity) => state.layers.find((layer) => layer.name === entity.layer);
    const visible = (entity) => layerFor(entity)?.visible !== false;
    const editable = (entity) => visible(entity) && !layerFor(entity)?.locked;
    const emit = (reason) => { if (typeof options.onChange === "function") options.onChange(snapshot(), reason); };
    const snapshot = () => clone(state);
    const restore = (raw) => Object.assign(state, normalizeState(raw));
    function nextId(reservedIds = []) {
      const used = new Set([...state.entities.map((entity) => entity.id), ...reservedIds]);
      while (used.has(`cad-${idCounter}`)) idCounter += 1;
      return `cad-${idCounter++}`;
    }
    function commit(reason, action) {
      const before = snapshot();
      const result = action();
      state.selectedIds = state.selectedIds.filter((id) => state.entities.some((entity) => entity.id === id && editable(entity)));
      if (JSON.stringify(before) !== JSON.stringify(state)) {
        history.push(before); if (history.length > 200) history.shift();
        future.length = 0; emit(reason);
      }
      return result;
    }
    function idsList(ids) { return ids === undefined ? state.selectedIds : Array.isArray(ids) ? ids : [ids]; }
    function add(raw) {
      const isArray = Array.isArray(raw);
      const values = (isArray ? raw : [raw]).map((entry) => normalizeEntity(entry, state.settings));
      if (!values.length || values.some((entry) => !entry)) return isArray ? [] : null;
      if (values.some((entity) => state.layers.some((layer) => layer.name === entity.layer && (layer.locked || !layer.visible)))) return isArray ? [] : null;
      return commit("add", () => {
        const reservedIds = values.map((entity) => entity.id).filter(Boolean);
        values.forEach((entity) => {
          if (!entity.id || state.entities.some((entry) => entry.id === entity.id)) entity.id = nextId(reservedIds);
          if (!state.layers.some((layer) => layer.name === entity.layer)) state.layers.push({ name: entity.layer, color: entity.color, visible: true, locked: false });
          state.entities.push(entity);
        });
        return isArray ? values : values[0];
      });
    }
    function update(id, patch) {
      const current = state.entities.find((entity) => entity.id === id);
      if (!current || !editable(current)) return null;
      const value = normalizeEntity({ ...current, ...patch, id: current.id }, state.settings);
      if (!value) return null;
      if (state.layers.some((layer) => layer.name === value.layer && (layer.locked || !layer.visible))) return null;
      return commit("update", () => {
        if (!state.layers.some((layer) => layer.name === value.layer)) state.layers.push({ name: value.layer, color: value.color, visible: true, locked: false });
        state.entities[state.entities.indexOf(current)] = value; return value;
      });
    }
    function remove(ids) {
      const selected = new Set(idsList(ids));
      return commit("remove", () => {
        const count = state.entities.length;
        state.entities = state.entities.filter((entity) => !selected.has(entity.id) || !editable(entity));
        return count - state.entities.length;
      });
    }
    function clear() {
      return commit("clear", () => { const count = state.entities.length; state.entities = []; state.selectedIds = []; state.name = "새 도면"; return count; });
    }
    function select(ids) {
      const wanted = new Set(idsList(ids));
      state.selectedIds = state.entities.filter((entity) => wanted.has(entity.id) && editable(entity)).map((entity) => entity.id);
      emit("selection"); return state.selectedIds;
    }
    function setSettings(patch) {
      return commit("settings", () => {
        state.settings = normalizeSettings({ ...state.settings, ...patch });
        if (!state.layers.some((layer) => layer.name === state.settings.layer)) state.settings.layer = "0";
        return state.settings;
      });
    }
    function applyProperties(patch = {}, ids) {
      const wanted = new Set(idsList(ids));
      return commit("properties", () => {
        state.settings = normalizeSettings({ ...state.settings, ...patch });
        if (!state.layers.some((layer) => layer.name === state.settings.layer)) state.settings.layer = "0";
        const style = {};
        ["color", "lineWidth", "textSize"].forEach((name) => {
          if (Object.prototype.hasOwnProperty.call(patch, name)) style[name] = state.settings[name];
        });
        const dimensionStyle = {};
        const dimensionSettings = { dimPrecision: "precision", dimScale: "dimScale", dimTextSize: "textSize", arrowSize: "arrowSize", extensionGap: "extensionGap", extensionOvershoot: "extensionOvershoot", dimUnit: "unit" };
        Object.entries(dimensionSettings).forEach(([setting, property]) => {
          if (Object.prototype.hasOwnProperty.call(patch, setting)) dimensionStyle[property] = state.settings[setting];
        });
        state.entities = state.entities.map((entity) => wanted.has(entity.id) && editable(entity)
          ? normalizeEntity({ ...entity, ...style, ...(entity.type === "dimension" ? dimensionStyle : {}) }, state.settings)
          : entity);
        return state.settings;
      });
    }
    function setLayer(name, patch = {}) {
      name = layerName(name);
      return commit("layer", () => {
        let layer = state.layers.find((entry) => entry.name === name);
        if (!layer) { layer = { name, color: state.settings.color, visible: true, locked: false }; state.layers.push(layer); }
        if ("color" in patch) layer.color = color(patch.color, layer.color);
        if (typeof patch.visible === "boolean") layer.visible = patch.visible;
        if (typeof patch.locked === "boolean") layer.locked = patch.locked;
        return layer;
      });
    }
    function transform(ids, transformOptions = {}) {
      const wanted = new Set(idsList(ids));
      const originals = state.entities.filter((entity) => wanted.has(entity.id) && editable(entity));
      const transformed = originals.map((entity) => transformEntity(entity, transformOptions));
      if (!transformed.length || transformed.some((entity) => !entity)) return [];
      return commit("transform", () => {
        const copying = transformOptions.type === "copy" || transformOptions.copy === true;
        transformed.forEach((entity, index) => {
          if (copying) { entity.id = nextId(); state.entities.push(entity); }
          else state.entities[state.entities.indexOf(originals[index])] = entity;
        });
        state.selectedIds = transformed.map((entity) => entity.id); return transformed;
      });
    }
    function offset(id, amount, sidePoint) {
      const entity = state.entities.find((entry) => entry.id === id);
      if (!entity || !editable(entity)) return null;
      const value = offsetEntity(entity, amount, sidePoint);
      if (!value) return null;
      value.id = "";
      return add(value);
    }
    function trim(id, clickPoint) {
      const entity = state.entities.find((entry) => entry.id === id);
      if (!entity || entity.type !== "line" || !editable(entity) || !point(clickPoint)) return false;
      const cuts = state.entities.filter((other) => other.id !== id && visible(other)).flatMap((other) => intersections(entity, other)).map((entry) => segmentParameter(entry, entity.a, entity.b)).filter((t) => t > EPSILON && t < 1 - EPSILON).sort((a, b) => a - b);
      const parameters = [0, ...cuts.filter((t, index) => index === 0 || Math.abs(t - cuts[index - 1]) > EPSILON), 1];
      if (parameters.length < 3) return false;
      const t = Math.max(0, Math.min(1, segmentParameter(clickPoint, entity.a, entity.b)));
      let cutIndex = parameters.findIndex((entry, index) => index < parameters.length - 1 && t >= entry - EPSILON && t <= parameters[index + 1] + EPSILON);
      if (cutIndex < 0) cutIndex = parameters.length - 2;
      const vector = subtract(entity.b, entity.a);
      const kept = [];
      if (parameters[cutIndex] > EPSILON) kept.push({ ...clone(entity), b: addPoint(entity.a, multiply(vector, parameters[cutIndex])) });
      if (parameters[cutIndex + 1] < 1 - EPSILON) kept.push({ ...clone(entity), a: addPoint(entity.a, multiply(vector, parameters[cutIndex + 1])) });
      return commit("trim", () => {
        const index = state.entities.indexOf(entity);
        kept.forEach((value, valueIndex) => { if (valueIndex > 0) value.id = nextId(); });
        state.entities.splice(index, 1, ...kept); return true;
      });
    }
    function undo() {
      if (!history.length) return false;
      future.push(snapshot()); restore(history.pop()); emit("undo"); return true;
    }
    function redo() {
      if (!future.length) return false;
      history.push(snapshot()); restore(future.pop()); emit("redo"); return true;
    }
    function load(raw) {
      const normalized = normalizeState(raw);
      return commit("load", () => { restore(normalized); return snapshot(); });
    }
    return Object.freeze({
      state, add, update, remove, clear, select, setSettings, applyProperties, setLayer, transform, offset, trim,
      undo, redo, load, snapshot,
      get canUndo() { return history.length > 0; },
      get canRedo() { return future.length > 0; },
      bounds(ids) { const selected = ids === undefined ? null : new Set(idsList(ids)); return bounds(state.entities.filter((entity) => visible(entity) && (!selected || selected.has(entity.id)))); },
      hitTest(testPoint, tolerance) { return hitTest(state.entities.filter(editable), testPoint, tolerance); },
      snap(testPoint, tolerance, excluded = []) { const ids = new Set(idsList(excluded)); return snap(state.entities.filter((entity) => visible(entity) && !ids.has(entity.id)), testPoint, tolerance); },
      boxSelect(a, b, crossing) { return boxSelect(state.entities.filter(editable), a, b, crossing); },
    });
  }

  Tool.core.cadEngine = Object.freeze({
    DEFAULT_SETTINGS, ENTITY_LIMIT, create, normalizeState, hydrate: normalizeState, normalizeEntity,
    parsePoint, bounds, entityPoints, segments, hitTest, snap, boxSelect,
    intersections, dimensionGeometry, transformEntity, offsetEntity,
  });
})(window.HeechangTool);
