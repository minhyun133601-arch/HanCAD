(function createCadExportersModule(Tool) {
  "use strict";

  const TAU = Math.PI * 2;
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const point = (value) => ({ x: number(value && value.x), y: number(value && value.y), ...(value?.z === undefined ? {} : { z: number(value.z) }) });
  const cleanNumber = (value) => String(Math.round(number(value) * 1000000) / 1000000);
  const escapeXml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
  const normalAngle = (angle) => ((number(angle) % TAU) + TAU) % TAU;
  let textMeasureContext = null;
  let measurementAttempted = false;

  function color(value, readable = false) {
    let hex = /^#[a-f0-9]{6}$/i.test(String(value)) ? String(value) : "#26364c";
    if (/^#[a-f0-9]{3}$/i.test(String(value))) hex = `#${String(value).slice(1).split("").map((digit) => digit + digit).join("")}`;
    if (!readable) return hex;
    if (hex.toLowerCase() === "#ffffff") return "#000000";
    const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    const luminance = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255;
    if (luminance > 0.65) return `#${rgb.map((channel) => Math.round(channel * 0.42).toString(16).padStart(2, "0")).join("")}`;
    return hex;
  }

  function layerName(entity) {
    return String(entity.layer == null ? "0" : entity.layer);
  }

  function layerOf(snapshot, entity) {
    return (Array.isArray(snapshot.layers) ? snapshot.layers : []).find((layer) => String(layer.name == null ? layer.id : layer.name) === layerName(entity));
  }

  function entitiesOf(snapshot, visibleOnly = false) {
    const hidden = new Set(), known = new Set();
    if (visibleOnly) for (const layer of Array.isArray(snapshot.layers) ? snapshot.layers : []) {
      const name = String(layer.name == null ? layer.id : layer.name);
      if (known.has(name)) continue;
      known.add(name); if (layer.visible === false) hidden.add(name);
    }
    return (Array.isArray(snapshot.entities) ? snapshot.entities : []).filter((entity) => entity && (!visibleOnly || !hidden.has(layerName(entity))));
  }

  function entityColor(snapshot, entity, readable = false) {
    const layer = layerOf(snapshot, entity);
    return color(entity.color || (layer && layer.color) || "#26364c", readable);
  }

  function polygonPoints(entity) {
    if (Array.isArray(entity.points)) return entity.points.map(point);
    if (entity.type === "rect" && entity.a && entity.b) {
      const a = point(entity.a), b = point(entity.b);
      return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    }
    return [];
  }

  function arcSweep(entity) {
    const start = number(entity.startAngle), end = number(entity.endAngle);
    if (Math.abs(end - start) >= TAU - 1e-9) return entity.clockwise ? TAU : -TAU;
    return entity.clockwise ? normalAngle(end - start) : -normalAngle(start - end);
  }

  function dimensionGeometry(entity, unit) {
    return Tool.core.cadEngine.dimensionGeometry(entity, unit);
  }

  function drawText(context, value, at, textSize, rotation, centered = false) {
    context.save();
    context.translate(at.x, at.y);
    context.rotate(number(rotation));
    context.font = `${textSize}px Arial, "Malgun Gothic", sans-serif`;
    context.textAlign = centered ? "center" : "left";
    context.textBaseline = centered ? "middle" : "alphabetic";
    String(value || "").split(/\r?\n/).forEach((line, index) => context.fillText(line, 0, index * textSize * 1.25));
    context.restore();
  }

  function drawEntity(context, entity, options = {}) {
    if (!context || !entity) return;
    const scale = Math.max(0.000001, Math.abs(number(options.scale, 1)));
    context.save();
    context.strokeStyle = color(options.selected ? "#38bdf8" : (options.color || entity.color));
    context.fillStyle = context.strokeStyle;
    context.lineWidth = Math.max(0.25, number(options.lineWidth, number(entity.lineWidth, 1.5))) / scale;
    context.lineCap = "round";
    context.lineJoin = "round";
    const line = (a, b) => { context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke(); };
    if (entity.type === "line") line(point(entity.a), point(entity.b));
    if (entity.type === "polyline" || entity.type === "rect") {
      const points = polygonPoints(entity);
      if (points.length) {
        context.beginPath(); context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((at) => context.lineTo(at.x, at.y));
        if (entity.closed || entity.type === "rect") context.closePath();
        context.stroke();
      }
    }
    if (entity.type === "circle" || entity.type === "arc") {
      const center = point(entity.center);
      const radius = Math.abs(number(entity.radius));
      if (radius > 0) {
        context.beginPath();
        context.arc(center.x, center.y, radius, entity.type === "circle" ? 0 : number(entity.startAngle), entity.type === "circle" ? TAU : number(entity.startAngle) + arcSweep(entity), entity.type === "arc" && !entity.clockwise);
        context.stroke();
      }
    }
    if (entity.type === "text") drawText(context, entity.text, point(entity.point), Math.max(0.1, number(entity.textSize, 12)), entity.rotation);
    if (entity.type === "dimension") {
      const dimension = dimensionGeometry(entity, options.unit);
      if (!dimension) { context.restore(); return; }
      dimension.lines.forEach(([a, b]) => line(a, b));
      dimension.arcs.forEach((arc) => {
        context.beginPath(); context.arc(arc.center.x, arc.center.y, arc.radius, arc.startAngle, arc.endAngle, !arc.clockwise); context.stroke();
      });
      dimension.arrows.forEach((points) => {
        context.beginPath(); context.moveTo(points[0].x, points[0].y); points.slice(1).forEach((at) => context.lineTo(at.x, at.y)); context.closePath(); context.fill();
      });
      drawText(context, dimension.label, dimension.textPoint, dimension.textSize, dimension.rotation, true);
    }
    context.restore();
  }

  function textBounds(at, value, textSize, rotation, centered = false) {
    const lines = String(value || "").split(/\r?\n/);
    if (!measurementAttempted && typeof document !== "undefined") {
      measurementAttempted = true;
      try { textMeasureContext = document.createElement("canvas").getContext("2d"); } catch (_) { textMeasureContext = null; }
    }
    if (textMeasureContext) textMeasureContext.font = `${textSize}px Arial, "Malgun Gothic", sans-serif`;
    const width = Math.max(textSize, ...lines.map((line) => {
      const measurement = textMeasureContext && textMeasureContext.measureText(line);
      // A conservative cell width also keeps Korean text inside nonbrowser exports.
      return measurement && Number.isFinite(measurement.width) ? measurement.width + textSize * 0.1 : Math.max(1, Array.from(line).length) * textSize * 1.15;
    }));
    const left = centered ? -width / 2 : 0, top = centered ? -textSize / 2 : -textSize;
    const height = textSize * Math.max(1, lines.length) * 1.25;
    const cosine = Math.cos(number(rotation)), sine = Math.sin(number(rotation));
    return [[left, top], [left + width, top], [left + width, top + height], [left, top + height]].map(([x, y]) => ({ x: at.x + x * cosine - y * sine, y: at.y + x * sine + y * cosine }));
  }

  function boundsOf(snapshot, visibleOnly = true) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = false;
    const include = (at) => {
      minX = Math.min(minX, at.x); minY = Math.min(minY, at.y);
      maxX = Math.max(maxX, at.x); maxY = Math.max(maxY, at.y); found = true;
    };
    const includeAll = (points) => { for (const at of points) include(at); };
    entitiesOf(snapshot, visibleOnly).forEach((entity) => {
      if (entity.type === "line") { include(point(entity.a)); include(point(entity.b)); }
      if (entity.type === "polyline" || entity.type === "rect") includeAll(polygonPoints(entity));
      if (entity.type === "circle" || entity.type === "arc") {
        const center = point(entity.center), radius = Math.abs(number(entity.radius));
        include({ x: center.x - radius, y: center.y - radius }); include({ x: center.x + radius, y: center.y + radius });
      }
      if (entity.type === "text") includeAll(textBounds(point(entity.point), entity.text, Math.max(0.1, number(entity.textSize, 12)), entity.rotation));
      if (entity.type === "dimension") {
        const dimension = dimensionGeometry(entity, snapshot.settings && snapshot.settings.unit);
        if (dimension) includeAll(dimension.points);
      }
    });
    if (!found) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  function toSvg(snapshot = {}) {
    const bounds = boundsOf(snapshot), margin = Math.max(10, Math.max(bounds.width, bounds.height) * 0.04);
    const width = bounds.width + margin * 2, height = bounds.height + margin * 2;
    const viewportScale = 2400 / Math.max(width, height);
    const viewportWidth = Math.max(128, Math.round(width * viewportScale)), viewportHeight = Math.max(128, Math.round(height * viewportScale));
    const vectorStroke = ' vector-effect="non-scaling-stroke"';
    const lines = [`<?xml version="1.0" encoding="UTF-8"?>`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cleanNumber(bounds.minX - margin)} ${cleanNumber(bounds.minY - margin)} ${cleanNumber(width)} ${cleanNumber(height)}" width="${viewportWidth}" height="${viewportHeight}">`, `<title>${escapeXml(snapshot.name || "CAD drawing")}</title>`, `<rect x="${cleanNumber(bounds.minX - margin)}" y="${cleanNumber(bounds.minY - margin)}" width="${cleanNumber(width)}" height="${cleanNumber(height)}" fill="#ffffff"/>`];
    const xy = (at) => `${cleanNumber(at.x)},${cleanNumber(at.y)}`;
    const text = (value, at, size, rotation, fill, centered = false) => {
      const content = String(value || "").split(/\r?\n/).map((line, index) => `<tspan x="0" dy="${index ? cleanNumber(size * 1.25) : "0"}">${escapeXml(line)}</tspan>`).join("");
      return `<text transform="translate(${cleanNumber(at.x)} ${cleanNumber(at.y)}) rotate(${cleanNumber(number(rotation) * 180 / Math.PI)})" fill="${fill}" stroke="none" font-family="Arial, Malgun Gothic, sans-serif" font-size="${cleanNumber(size)}"${centered ? ' text-anchor="middle" dominant-baseline="central"' : ""}>${content}</text>`;
    };
    entitiesOf(snapshot, true).forEach((entity) => {
      const stroke = entityColor(snapshot, entity, true);
      lines.push(`<g data-layer="${escapeXml(layerName(entity))}" stroke="${stroke}" stroke-width="${cleanNumber(Math.max(1, Math.min(6, number(entity.lineWidth, 1.5))))}" stroke-linecap="round" stroke-linejoin="round" fill="none">`);
      const line = (a, b) => `<line x1="${cleanNumber(a.x)}" y1="${cleanNumber(a.y)}" x2="${cleanNumber(b.x)}" y2="${cleanNumber(b.y)}"${vectorStroke}/>`;
      if (entity.type === "line") lines.push(line(point(entity.a), point(entity.b)));
      if (entity.type === "polyline" || entity.type === "rect") lines.push(`<${entity.closed || entity.type === "rect" ? "polygon" : "polyline"} points="${polygonPoints(entity).map(xy).join(" ")}"${vectorStroke}/>`);
      if (entity.type === "circle") lines.push(`<circle cx="${cleanNumber(point(entity.center).x)}" cy="${cleanNumber(point(entity.center).y)}" r="${cleanNumber(Math.abs(number(entity.radius)))}"${vectorStroke}/>`);
      if (entity.type === "arc") {
        const center = point(entity.center), radius = Math.abs(number(entity.radius)), start = number(entity.startAngle), sweep = arcSweep(entity);
        const at = (angle) => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
        if (Math.abs(sweep) >= TAU - 1e-9) lines.push(`<circle cx="${cleanNumber(center.x)}" cy="${cleanNumber(center.y)}" r="${cleanNumber(radius)}"${vectorStroke}/>`);
        else lines.push(`<path d="M ${xy(at(start))} A ${cleanNumber(radius)} ${cleanNumber(radius)} 0 ${Math.abs(sweep) > Math.PI ? 1 : 0} ${entity.clockwise ? 1 : 0} ${xy(at(start + sweep))}"${vectorStroke}/>`);
      }
      if (entity.type === "text") lines.push(text(entity.text, point(entity.point), Math.max(0.1, number(entity.textSize, 12)), entity.rotation, stroke));
      if (entity.type === "dimension") {
        const dimension = dimensionGeometry(entity, snapshot.settings && snapshot.settings.unit);
        if (!dimension) { lines.push("</g>"); return; }
        dimension.lines.forEach(([a, b]) => lines.push(line(a, b)));
        dimension.arcs.forEach((arc) => {
          const at = (angle) => ({ x: arc.center.x + arc.radius * Math.cos(angle), y: arc.center.y + arc.radius * Math.sin(angle) });
          lines.push(`<path d="M ${xy(at(arc.startAngle))} A ${cleanNumber(arc.radius)} ${cleanNumber(arc.radius)} 0 ${Math.abs(arc.endAngle - arc.startAngle) > Math.PI ? 1 : 0} ${arc.clockwise ? 1 : 0} ${xy(at(arc.endAngle))}"${vectorStroke}/>`);
        });
        dimension.arrows.forEach((points) => lines.push(`<polygon points="${points.map(xy).join(" ")}" fill="${stroke}" stroke="none"${vectorStroke}/>`));
        lines.push(text(dimension.label, dimension.textPoint, dimension.textSize, dimension.rotation, stroke, true));
      }
      lines.push("</g>");
    });
    lines.push("</svg>");
    return lines.join("\n");
  }

  function toDxf(snapshot = {}) {
    // Keep stored doubles intact; screen/export preview rounding must not change coordinates.
    const cleanNumber = (value) => String(number(value));
    const output = [], push = (code, value) => output.push(String(code), String(value));
    const safeString = (value) => String(value == null ? "" : value).replace(/[\r\n\u0000-\u001f]/g, " ");
    let handleCounter = 16;
    const handle = () => (handleCounter++).toString(16).toUpperCase();
    const layers = new Map([["0", { name: "0", color: "#26364c", visible: true }]]);
    (Array.isArray(snapshot.layers) ? snapshot.layers : []).forEach((layer) => layers.set(String(layer.name == null ? layer.id : layer.name), layer));
    entitiesOf(snapshot).forEach((entity) => { if (!layers.has(layerName(entity))) layers.set(layerName(entity), { name: layerName(entity) }); });
    const layerNames = new Map(), usedNames = new Set();
    layers.forEach((layer, name) => {
      const base = safeString(name).replace(/[<>/\\":;?*|=]/g, "_") || "0";
      let candidate = base, suffix = 2;
      while (usedNames.has(candidate.toUpperCase())) candidate = `${base}_${suffix++}`;
      layerNames.set(name, candidate); usedNames.add(candidate.toUpperCase());
    });
    const dxfLayer = (value) => layerNames.get(String(value)) || "0";
    const bounds = boundsOf(snapshot, false), unit = snapshot.settings && snapshot.settings.unit;
    const tableHandles = Object.fromEntries(["LTYPE", "LAYER", "STYLE", "DIMSTYLE", "BLOCK_RECORD"].map((name) => [name, handle()]));
    const textStyleHandle = handle();
    const blockRecords = [{ name: "*Model_Space", handle: handle() }, { name: "*Paper_Space", handle: handle() }];
    const dimStyles = new Map(), dimensions = new Map();
    entitiesOf(snapshot).filter((entity) => entity.type === "dimension").forEach((raw, index) => {
      const entity = Tool.core.cadEngine.normalizeEntity(raw, snapshot.settings || Tool.core.cadEngine.DEFAULT_SETTINGS);
      if (!entity) return;
      const styleUnit = entity.kind === "angular" ? "" : entity.unit;
      const key = JSON.stringify([entity.dimScale, entity.textSize, entity.arrowSize, entity.extensionGap, entity.extensionOvershoot, entity.precision, styleUnit, entity.textGap, entity.measurementFactor, entity.zeroSuppression, entity.post]);
      if (!dimStyles.has(key)) dimStyles.set(key, { name: `CAD_DIM_${dimStyles.size + 1}`, handle: handle(), entity: { ...entity, unit: styleUnit } });
      const block = { name: `*D${index + 1}`, handle: handle(), entity, geometry: dimensionGeometry(entity, unit) };
      blockRecords.push(block); dimensions.set(raw, { ...block, style: dimStyles.get(key) });
    });
    push(0, "SECTION"); push(2, "HEADER"); push(9, "$ACADVER"); push(1, "AC1021"); push(9, "$INSUNITS"); push(70, ({ mm: 4, cm: 5, m: 6, in: 1, ft: 2 })[unit] || 0);
    // Definitions are editable, but no AcDbDimAssoc geometry links are written yet.
    push(9, "$DIMASSOC"); push(280, 1);
    push(9, "$HANDSEED"); push(5, "__HANDSEED__");
    push(9, "$EXTMIN"); push(10, cleanNumber(bounds.minX)); push(20, cleanNumber(-bounds.maxY)); push(30, 0);
    push(9, "$EXTMAX"); push(10, cleanNumber(bounds.maxX)); push(20, cleanNumber(-bounds.minY)); push(30, 0); push(0, "ENDSEC");
    const table = (name, count) => { push(0, "TABLE"); push(2, name); push(5, tableHandles[name]); push(330, "0"); push(100, "AcDbSymbolTable"); push(70, count); };
    const record = (type, owner, subclass, recordHandle = handle(), handleCode = 5) => { push(0, type); push(handleCode, recordHandle); push(330, owner); push(100, "AcDbSymbolTableRecord"); push(100, subclass); };
    push(0, "SECTION"); push(2, "TABLES");
    table("LTYPE", 1); record("LTYPE", tableHandles.LTYPE, "AcDbLinetypeTableRecord"); push(2, "CONTINUOUS"); push(70, 0); push(3, "Solid line"); push(72, 65); push(73, 0); push(40, 0); push(0, "ENDTAB");
    table("LAYER", layers.size);
    layers.forEach((layer, name) => { record("LAYER", tableHandles.LAYER, "AcDbLayerTableRecord"); push(2, dxfLayer(name)); push(70, layer.locked ? 4 : 0); push(62, layer.visible === false ? -7 : 7); push(420, parseInt(color(layer.color).slice(1), 16)); push(6, "CONTINUOUS"); });
    push(0, "ENDTAB"); table("STYLE", 1); record("STYLE", tableHandles.STYLE, "AcDbTextStyleTableRecord", textStyleHandle); push(2, "STANDARD"); push(70, 0); push(40, 0); push(41, 1); push(50, 0); push(71, 0); push(42, 3.5); push(3, "arial.ttf"); push(4, ""); push(0, "ENDTAB");
    table("DIMSTYLE", dimStyles.size);
    dimStyles.forEach((style) => {
      const entity = style.entity;
      record("DIMSTYLE", tableHandles.DIMSTYLE, "AcDbDimStyleTableRecord", style.handle, 105); push(2, style.name); push(70, 0);
      const post = entity.post ? (entity.post.includes("<>") ? entity.post : `<>${entity.post}`) : "<>";
      push(3, entity.post || entity.unit ? safeString(post.replace(/<>/g, entity.unit ? `<>${entity.unit}` : "<>")) : "");
      push(40, entity.dimScale); push(41, entity.arrowSize); push(42, entity.extensionGap); push(44, entity.extensionOvershoot);
      push(140, entity.textSize); push(144, entity.measurementFactor ?? 1); push(147, entity.textGap ?? entity.textSize * 0.25);
      push(73, 0); push(74, 0); push(77, 1); push(78, entity.zeroSuppression || 0); push(179, entity.precision);
      push(271, entity.precision); push(275, 0); push(277, 2); push(278, 46); push(279, 2); push(289, 3); push(340, textStyleHandle);
    });
    push(0, "ENDTAB"); table("BLOCK_RECORD", blockRecords.length);
    blockRecords.forEach((block) => { record("BLOCK_RECORD", tableHandles.BLOCK_RECORD, "AcDbBlockTableRecord", block.handle); push(2, block.name); push(70, 0); push(280, 1); push(281, 0); });
    push(0, "ENDTAB"); push(0, "ENDSEC");
    const position = (at, code = 10) => { push(code, cleanNumber(at.x)); push(code + 10, cleanNumber(-at.y)); push(code + 20, cleanNumber(at.z || 0)); };
    const start = (type, entity, owner) => { const id = handle(); push(0, type); push(5, id); push(330, owner); push(100, "AcDbEntity"); push(8, dxfLayer(layerName(entity))); if (entity.color) { push(62, 7); push(420, parseInt(color(entity.color).slice(1), 16)); } return id; };
    const line = (entity, a, b, owner) => { start("LINE", entity, owner); push(100, "AcDbLine"); position(a); position(b, 11); };
    const polyline = (entity, points, closed, owner) => {
      const elevation = points[0]?.z || 0;
      if (points.some(at => (at.z || 0) !== elevation)) {
        const polyOwner = start("POLYLINE", entity, owner); push(100, "AcDb3dPolyline"); push(66, 1); position({x:0,y:0}); push(70, 8 | (closed ? 1 : 0));
        points.forEach(at => { start("VERTEX", entity, polyOwner); push(100, "AcDbVertex"); push(100, "AcDb3dPolylineVertex"); position(at); push(70, 32); });
        start("SEQEND", entity, polyOwner);
        return;
      }
      start("LWPOLYLINE", entity, owner); push(100, "AcDbPolyline"); push(90, points.length); push(70, closed ? 1 : 0);
      if (elevation) push(38, cleanNumber(elevation));
      points.forEach((at) => { push(10, cleanNumber(at.x)); push(20, cleanNumber(-at.y)); });
    };
    const text = (entity, value, at, size, rotation, owner, centered = false) => {
      start("TEXT", entity, owner); push(100, "AcDbText"); position(at); push(40, cleanNumber(size)); push(1, safeString(value)); push(50, cleanNumber(normalAngle(-number(rotation)) * 180 / Math.PI)); push(7, "STANDARD");
      if (centered) { push(72, 1); position(at, 11); }
      push(100, "AcDbText"); if (centered) push(73, 2);
    };
    const circleArc = (entity, owner) => {
      const full = entity.type === "circle" || Math.abs(arcSweep(entity)) >= TAU - 1e-9;
      start(full ? "CIRCLE" : "ARC", entity, owner); push(100, "AcDbCircle"); position(point(entity.center)); push(40, cleanNumber(Math.abs(number(entity.radius))));
      if (!full) {
        const startAngle = entity.clockwise ? -number(entity.endAngle) : -number(entity.startAngle);
        const endAngle = entity.clockwise ? -number(entity.startAngle) : -number(entity.endAngle);
        push(100, "AcDbArc"); push(50, cleanNumber(normalAngle(startAngle) * 180 / Math.PI)); push(51, cleanNumber(normalAngle(endAngle) * 180 / Math.PI));
      }
    };
    push(0, "SECTION"); push(2, "BLOCKS");
    blockRecords.forEach((block) => {
      const entity = block.entity || { layer: "0" };
      start("BLOCK", { layer: "0" }, block.handle); push(100, "AcDbBlockBegin"); push(2, block.name); push(70, block.entity ? 1 : 0); position({ x: 0, y: 0 }); push(3, block.name); push(1, "");
      if (block.geometry) {
        const geometry = block.geometry;
        geometry.lines.forEach(([a, b]) => line(entity, a, b, block.handle));
        geometry.arcs.forEach((arc) => circleArc({ ...entity, ...arc, type: "arc" }, block.handle));
        geometry.arrows.forEach((triangle) => {
          start("SOLID", entity, block.handle); push(100, "AcDbTrace"); position(triangle[0]); position(triangle[1], 11); position(triangle[2], 12); position(triangle[2], 13);
        });
        text(entity, geometry.label, geometry.textPoint, geometry.textSize, geometry.rotation, block.handle, true);
      }
      start("ENDBLK", { layer: "0" }, block.handle); push(100, "AcDbBlockEnd");
    });
    push(0, "ENDSEC"); push(0, "SECTION"); push(2, "ENTITIES");
    const modelOwner = blockRecords[0].handle;
    entitiesOf(snapshot).forEach((entity) => {
      if (entity.type === "line") line(entity, point(entity.a), point(entity.b), modelOwner);
      if (entity.type === "polyline" || entity.type === "rect") polyline(entity, polygonPoints(entity), entity.closed || entity.type === "rect", modelOwner);
      if (entity.type === "circle" || entity.type === "arc") circleArc(entity, modelOwner);
      if (entity.type === "text") text(entity, entity.text, point(entity.point), Math.max(0.1, number(entity.textSize, 3.5)), entity.rotation, modelOwner);
      if (entity.type === "dimension" && dimensions.has(entity)) {
        const dimension = dimensions.get(entity), normalized = dimension.entity, geometry = dimension.geometry;
        const kind = normalized.kind;
        const dimensionType = ({ horizontal: 0, vertical: 0, aligned: 1, diameter: 3, radius: 4, angular: 5 })[kind];
        start("DIMENSION", normalized, modelOwner); push(100, "AcDbDimension"); push(2, dimension.name);
        position(kind === "radius" ? normalized.center : kind === "angular" ? geometry.labelPoint : kind === "diameter" ? geometry.q1 : geometry.q2);
        position(geometry.textPoint, 11); push(70, dimensionType + 32); push(71, 5); push(42, cleanNumber(kind === "angular" ? geometry.measurement * Math.PI / 180 : geometry.measurement)); push(1, safeString(normalized.text || "<>")); push(3, dimension.style.name);
        if (normalized.textRotation !== undefined) push(53, cleanNumber(normalAngle(-normalized.textRotation) * 180 / Math.PI));
        if (["aligned", "horizontal", "vertical"].includes(kind)) {
          push(100, "AcDbAlignedDimension"); position(normalized.a, 13); position(normalized.b, 14);
          const angle = kind === "aligned" ? Math.atan2(normalized.b.y - normalized.a.y, normalized.b.x - normalized.a.x) : (normalized.axisAngle ?? (kind === "vertical" ? -Math.PI / 2 : 0));
          push(50, cleanNumber(normalAngle(-angle) * 180 / Math.PI));
          if (kind !== "aligned") push(100, "AcDbRotatedDimension");
        } else if (["radius", "diameter"].includes(kind)) {
          push(100, kind === "radius" ? "AcDbRadialDimension" : "AcDbDiametricDimension"); position(geometry.q2, 15); push(40, cleanNumber(Math.max(0, Math.hypot(normalized.placement.x - normalized.center.x, normalized.placement.y - normalized.center.y) - normalized.radius)));
        } else {
          // DXF angular dimensions measure counterclockwise in CAD's upward Y axis.
          push(100, "AcDb3PointAngularDimension"); position(normalized.clockwise ? normalized.b : normalized.a, 13); position(normalized.clockwise ? normalized.a : normalized.b, 14); position(normalized.center, 15);
        }
      }
    });
    push(0, "ENDSEC"); push(0, "EOF");
    const seedIndex = output.indexOf("__HANDSEED__"); output[seedIndex] = handleCounter.toString(16).toUpperCase();
    return `${output.join("\r\n")}\r\n`;
  }

  async function download(snapshot = {}, format = "json") {
    const exporter = Tool.core.drawingExporters;
    if (!exporter || typeof exporter.downloadBlob !== "function") throw new Error("파일 다운로드 기능을 불러오지 못했습니다.");
    const name = exporter.baseName(snapshot.name || "cad-drawing");
    if (format === "dxf") return exporter.downloadBlob(new Blob([toDxf(snapshot)], { type: "application/dxf;charset=utf-8" }), `${name}.dxf`);
    if (format === "svg") return exporter.downloadBlob(new Blob([toSvg(snapshot)], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
    if (format === "json") return exporter.downloadBlob(new Blob([JSON.stringify({ ...snapshot, format: "heechang-cad", version: 1 }, null, 2)], { type: "application/json;charset=utf-8" }), `${name}.json`);
    if (format !== "png") throw new Error(`지원하지 않는 도면 형식입니다: ${format}`);
    const bounds = boundsOf(snapshot), margin = 32;
    const scale = Math.min(4, 2400 / Math.max(bounds.width, bounds.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(128, Math.ceil(bounds.width * scale + margin * 2));
    canvas.height = Math.max(128, Math.ceil(bounds.height * scale + margin * 2));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG 이미지를 만들 수 없습니다.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(margin - bounds.minX * scale, margin - bounds.minY * scale); context.scale(scale, scale);
    entitiesOf(snapshot, true).forEach((entity) => drawEntity(context, entity, { color: entityColor(snapshot, entity, true), lineWidth: Math.max(1, number(entity.lineWidth, 1.5) * scale), scale, unit: snapshot.settings && snapshot.settings.unit }));
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 이미지를 만들지 못했습니다.")), "image/png"));
    return exporter.downloadBlob(blob, `${name}.png`);
  }

  Tool.core.cadExporters = Object.freeze({ drawEntity, toDxf, toSvg, download, boundsOf });
})(window.HeechangTool);
