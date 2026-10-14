(function () {
// src/parser/tokenizer.ts
function tokenize(content) {
  const text = content.replace(/\r\n?/g, "\n");
  const tokens = [];
  const len = text.length;
  let pos = 0;
  while (pos < len) {
    while (pos < len && text.charCodeAt(pos) === 10) pos++;
    if (pos >= len) break;
    let lineEnd = text.indexOf("\n", pos);
    if (lineEnd === -1) lineEnd = len;
    const codeLine = text.substring(pos, lineEnd).trim();
    pos = lineEnd + 1;
    const code = parseInt(codeLine, 10);
    if (isNaN(code)) {
      if (pos < len) {
        lineEnd = text.indexOf("\n", pos);
        if (lineEnd === -1) lineEnd = len;
        pos = lineEnd + 1;
      }
      continue;
    }
    if (pos >= len) break;
    lineEnd = text.indexOf("\n", pos);
    if (lineEnd === -1) lineEnd = len;
    const value = text.substring(pos, lineEnd).replace(/\s+$/, "");
    pos = lineEnd + 1;
    tokens.push({ code, value });
  }
  return tokens;
}

// src/parser/sections/header.ts
function parseHeader(tokens, i, header) {
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.code === 0 && token.value === "ENDSEC") return i + 1;
    if (token.code === 9) {
      const varName = token.value;
      i++;
      switch (varName) {
        case "$ACADVER":
          if (i < tokens.length) {
            header.acadVersion = tokens[i].value;
            i++;
          }
          break;
        case "$EXTMIN":
          if (i < tokens.length) {
            const result = readHeaderPoint3D(tokens, i);
            header.extMin = result.point;
            i = result.nextIndex;
          }
          break;
        case "$EXTMAX":
          if (i < tokens.length) {
            const result = readHeaderPoint3D(tokens, i);
            header.extMax = result.point;
            i = result.nextIndex;
          }
          break;
        case "$INSUNITS":
          if (i < tokens.length) {
            header.insUnits = parseInt(tokens[i].value, 10);
            i++;
          }
          break;
        case "$MEASUREMENT":
          if (i < tokens.length) {
            header.measurement = parseInt(tokens[i].value, 10);
            i++;
          }
          break;
        case "$LTSCALE":
          if (i < tokens.length) {
            header.ltScale = parseFloat(tokens[i].value);
            i++;
          }
          break;
        case "$DWGCODEPAGE":
          if (i < tokens.length) {
            header.dwgCodePage = tokens[i].value;
            i++;
          }
          break;
        case "$HANDSEED":
          if (i < tokens.length) {
            header.handleSeed = tokens[i].value;
            i++;
          }
          break;
        default:
          while (i < tokens.length && tokens[i].code !== 9 && tokens[i].code !== 0) {
            header[varName] = tokens[i].value;
            i++;
          }
      }
    } else {
      i++;
    }
  }
  return i;
}
function readHeaderPoint3D(tokens, i) {
  const point = { x: 0, y: 0, z: 0 };
  while (i < tokens.length) {
    const code = tokens[i].code;
    if (code === 10) {
      point.x = parseFloat(tokens[i].value);
      i++;
    } else if (code === 20) {
      point.y = parseFloat(tokens[i].value);
      i++;
    } else if (code === 30) {
      point.z = parseFloat(tokens[i].value);
      i++;
    } else break;
  }
  return { point, nextIndex: i };
}

// src/parser/sections/tables.ts
function parseTables(tokens, i, doc) {
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.code === 0 && token.value === "ENDSEC") return i + 1;
    if (token.code === 0 && token.value === "TABLE") {
      i++;
      if (i >= tokens.length) break;
      const tableType = tokens[i].value;
      i++;
      switch (tableType) {
        case "LAYER":
          i = parseLayerTable(tokens, i, doc.layers);
          break;
        case "LTYPE":
          i = parseLTypeTable(tokens, i, doc.lineTypes);
          break;
        case "STYLE":
          i = parseStyleTable(tokens, i, doc.styles);
          break;
        default:
          i = skipTable(tokens, i);
          break;
      }
    } else {
      i++;
    }
  }
  return i;
}
function skipTable(tokens, i) {
  while (i < tokens.length) {
    if (tokens[i].code === 0 && tokens[i].value === "ENDTAB") return i + 1;
    i++;
  }
  return i;
}
function parseLayerTable(tokens, i, layers) {
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.code === 0 && token.value === "ENDTAB") return i + 1;
    if (token.code === 0 && token.value === "LAYER") {
      i++;
      const layer = {
        name: "0",
        color: 7,
        lineType: "Continuous",
        flags: 0,
        lineWeight: -3,
        isOff: false,
        isFrozen: false,
        isLocked: false
      };
      while (i < tokens.length && tokens[i].code !== 0) {
        const tag = tokens[i];
        switch (tag.code) {
          case 2:
            layer.name = tag.value;
            break;
          case 6:
            layer.lineType = tag.value;
            break;
          case 62:
            layer.color = parseInt(tag.value, 10);
            break;
          case 70:
            layer.flags = parseInt(tag.value, 10);
            break;
          case 370:
            layer.lineWeight = parseInt(tag.value, 10);
            break;
          case 420:
            layer.trueColor = parseInt(tag.value, 10);
            break;
        }
        i++;
      }
      layers.set(layer.name, layer);
    } else {
      i++;
    }
  }
  return i;
}
function parseLTypeTable(tokens, i, lineTypes) {
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.code === 0 && token.value === "ENDTAB") return i + 1;
    if (token.code === 0 && token.value === "LTYPE") {
      i++;
      const lt = {
        name: "",
        description: "",
        pattern: [],
        totalLength: 0
      };
      while (i < tokens.length && tokens[i].code !== 0) {
        const tag = tokens[i];
        switch (tag.code) {
          case 2:
            lt.name = tag.value;
            break;
          case 3:
            lt.description = tag.value;
            break;
          case 40:
            lt.totalLength = parseFloat(tag.value);
            break;
          case 49:
            lt.pattern.push(parseFloat(tag.value));
            break;
        }
        i++;
      }
      if (lt.name) lineTypes.set(lt.name, lt);
    } else {
      i++;
    }
  }
  return i;
}
function parseStyleTable(tokens, i, styles) {
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.code === 0 && token.value === "ENDTAB") return i + 1;
    if (token.code === 0 && token.value === "STYLE") {
      i++;
      const style = {
        name: "",
        fontName: "",
        bigFontName: "",
        height: 0,
        widthFactor: 1,
        obliqueAngle: 0
      };
      while (i < tokens.length && tokens[i].code !== 0) {
        const tag = tokens[i];
        switch (tag.code) {
          case 2:
            style.name = tag.value;
            break;
          case 3:
            style.fontName = tag.value;
            break;
          case 4:
            style.bigFontName = tag.value;
            break;
          case 40:
            style.height = parseFloat(tag.value);
            break;
          case 41:
            style.widthFactor = parseFloat(tag.value);
            break;
          case 50:
            style.obliqueAngle = parseFloat(tag.value);
            break;
        }
        i++;
      }
      if (style.name) styles.set(style.name, style);
    } else {
      i++;
    }
  }
  return i;
}

// src/parser/entities/base.ts
function parseBaseEntity(tags) {
  const base = {
    type: "",
    layer: "0",
    color: 256,
    // BYLAYER
    lineType: "BYLAYER",
    lineTypeScale: 1,
    lineWeight: -1,
    // BYLAYER
    visible: true,
    extrusion: { x: 0, y: 0, z: 1 }
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 5:
        base.handle = tag.value;
        break;
      case 8:
        base.layer = tag.value;
        break;
      case 6:
        base.lineType = tag.value;
        break;
      case 48:
        base.lineTypeScale = parseFloat(tag.value);
        break;
      case 67:
        base.paperSpace = tag.value === "1";
        break;
      case 60:
        base.visible = tag.value === "0" || tag.value === "";
        break;
      case 62:
        base.color = parseInt(tag.value, 10);
        break;
      case 370:
        base.lineWeight = parseInt(tag.value, 10);
        break;
      case 420:
        base.trueColor = parseInt(tag.value, 10);
        break;
      case 210:
        base.extrusion.x = parseFloat(tag.value);
        break;
      case 220:
        base.extrusion.y = parseFloat(tag.value);
        break;
      case 230:
        base.extrusion.z = parseFloat(tag.value);
        break;
    }
  }
  return base;
}

// src/parser/entities/line.ts
function parseLine(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "LINE",
    start: { x: 0, y: 0, z: 0 },
    end: { x: 0, y: 0, z: 0 }
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 10:
        entity.start.x = parseFloat(tag.value);
        break;
      case 20:
        entity.start.y = parseFloat(tag.value);
        break;
      case 30:
        entity.start.z = parseFloat(tag.value);
        break;
      case 11:
        entity.end.x = parseFloat(tag.value);
        break;
      case 21:
        entity.end.y = parseFloat(tag.value);
        break;
      case 31:
        entity.end.z = parseFloat(tag.value);
        break;
    }
  }
  return entity;
}

// src/parser/entities/circle.ts
function parseCircle(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "CIRCLE",
    center: { x: 0, y: 0, z: 0 },
    radius: 0
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 10:
        entity.center.x = parseFloat(tag.value);
        break;
      case 20:
        entity.center.y = parseFloat(tag.value);
        break;
      case 30:
        entity.center.z = parseFloat(tag.value);
        break;
      case 40:
        entity.radius = parseFloat(tag.value);
        break;
    }
  }
  return entity;
}

// src/parser/entities/arc.ts
function parseArc(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "ARC",
    center: { x: 0, y: 0, z: 0 },
    radius: 0,
    startAngle: 0,
    endAngle: 360
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 10:
        entity.center.x = parseFloat(tag.value);
        break;
      case 20:
        entity.center.y = parseFloat(tag.value);
        break;
      case 30:
        entity.center.z = parseFloat(tag.value);
        break;
      case 40:
        entity.radius = parseFloat(tag.value);
        break;
      case 50:
        entity.startAngle = parseFloat(tag.value);
        break;
      case 51:
        entity.endAngle = parseFloat(tag.value);
        break;
    }
  }
  return entity;
}

// src/parser/entities/lwpolyline.ts
function parseLwPolyline(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "LWPOLYLINE",
    vertices: [],
    closed: false,
    constantWidth: 0,
    elevation: 0
  };
  let currentVertex = null;
  for (const tag of tags) {
    switch (tag.code) {
      case 70:
        entity.closed = (parseInt(tag.value, 10) & 1) !== 0;
        break;
      case 38:
        entity.elevation = parseFloat(tag.value);
        break;
      case 43:
        entity.constantWidth = parseFloat(tag.value);
        break;
      case 10:
        if (currentVertex) entity.vertices.push(currentVertex);
        currentVertex = { x: parseFloat(tag.value), y: 0, bulge: 0, startWidth: 0, endWidth: 0 };
        break;
      case 20:
        if (currentVertex) currentVertex.y = parseFloat(tag.value);
        break;
      case 40:
        if (currentVertex) currentVertex.startWidth = parseFloat(tag.value);
        break;
      case 41:
        if (currentVertex) currentVertex.endWidth = parseFloat(tag.value);
        break;
      case 42:
        if (currentVertex) currentVertex.bulge = parseFloat(tag.value);
        break;
    }
  }
  if (currentVertex) entity.vertices.push(currentVertex);
  return entity;
}

// src/parser/entities/polyline.ts
function parsePolyline(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "POLYLINE",
    vertices: [],
    // filled in by entities dispatcher from VERTEX entities
    closed: false,
    is3d: false
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 70: {
        const flags = parseInt(tag.value, 10);
        entity.closed = (flags & 1) !== 0;
        entity.is3d = (flags & 8) !== 0;
        break;
      }
    }
  }
  return entity;
}

// src/parser/entities/ellipse.ts
function parseEllipse(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "ELLIPSE",
    center: { x: 0, y: 0, z: 0 },
    majorAxis: { x: 1, y: 0, z: 0 },
    minorRatio: 1,
    startParam: 0,
    endParam: Math.PI * 2
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 10:
        entity.center.x = parseFloat(tag.value);
        break;
      case 20:
        entity.center.y = parseFloat(tag.value);
        break;
      case 30:
        entity.center.z = parseFloat(tag.value);
        break;
      case 11:
        entity.majorAxis.x = parseFloat(tag.value);
        break;
      case 21:
        entity.majorAxis.y = parseFloat(tag.value);
        break;
      case 31:
        entity.majorAxis.z = parseFloat(tag.value);
        break;
      case 40:
        entity.minorRatio = parseFloat(tag.value);
        break;
      case 41:
        entity.startParam = parseFloat(tag.value);
        break;
      case 42:
        entity.endParam = parseFloat(tag.value);
        break;
    }
  }
  return entity;
}

// src/parser/entities/spline.ts
function parseSpline(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "SPLINE",
    degree: 3,
    flags: 0,
    knots: [],
    controlPoints: [],
    fitPoints: [],
    weights: []
  };
  let currentCP = null;
  let currentFP = null;
  for (const tag of tags) {
    switch (tag.code) {
      case 70:
        entity.flags = parseInt(tag.value, 10);
        break;
      case 71:
        entity.degree = parseInt(tag.value, 10);
        break;
      // 72 = knot count, 73 = control point count, 74 = fit point count — informational, skip
      case 40:
        entity.knots.push(parseFloat(tag.value));
        break;
      case 41:
        entity.weights.push(parseFloat(tag.value));
        break;
      case 10:
        if (currentCP) entity.controlPoints.push(currentCP);
        currentCP = { x: parseFloat(tag.value), y: 0, z: 0 };
        break;
      case 20:
        if (currentCP) currentCP.y = parseFloat(tag.value);
        break;
      case 30:
        if (currentCP) currentCP.z = parseFloat(tag.value);
        break;
      case 11:
        if (currentFP) entity.fitPoints.push(currentFP);
        currentFP = { x: parseFloat(tag.value), y: 0, z: 0 };
        break;
      case 21:
        if (currentFP) currentFP.y = parseFloat(tag.value);
        break;
      case 31:
        if (currentFP) currentFP.z = parseFloat(tag.value);
        break;
      case 12:
        if (!entity.startTangent) entity.startTangent = { x: 0, y: 0, z: 0 };
        entity.startTangent.x = parseFloat(tag.value);
        break;
      case 22:
        if (entity.startTangent) entity.startTangent.y = parseFloat(tag.value);
        break;
      case 32:
        if (entity.startTangent) entity.startTangent.z = parseFloat(tag.value);
        break;
      case 13:
        if (!entity.endTangent) entity.endTangent = { x: 0, y: 0, z: 0 };
        entity.endTangent.x = parseFloat(tag.value);
        break;
      case 23:
        if (entity.endTangent) entity.endTangent.y = parseFloat(tag.value);
        break;
      case 33:
        if (entity.endTangent) entity.endTangent.z = parseFloat(tag.value);
        break;
    }
  }
  if (currentCP) entity.controlPoints.push(currentCP);
  if (currentFP) entity.fitPoints.push(currentFP);
  return entity;
}

// src/parser/entities/text.ts
function parseText(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "TEXT",
    text: "",
    insertionPoint: { x: 0, y: 0, z: 0 },
    height: 1,
    rotation: 0,
    widthFactor: 1,
    obliqueAngle: 0,
    style: "STANDARD",
    hAlign: 0,
    vAlign: 0,
    generationFlags: 0
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 1:
        entity.text = tag.value;
        break;
      case 10:
        entity.insertionPoint.x = parseFloat(tag.value);
        break;
      case 20:
        entity.insertionPoint.y = parseFloat(tag.value);
        break;
      case 30:
        entity.insertionPoint.z = parseFloat(tag.value);
        break;
      case 11:
        if (!entity.alignmentPoint) entity.alignmentPoint = { x: 0, y: 0, z: 0 };
        entity.alignmentPoint.x = parseFloat(tag.value);
        break;
      case 21:
        if (!entity.alignmentPoint) entity.alignmentPoint = { x: 0, y: 0, z: 0 };
        entity.alignmentPoint.y = parseFloat(tag.value);
        break;
      case 31:
        if (!entity.alignmentPoint) entity.alignmentPoint = { x: 0, y: 0, z: 0 };
        entity.alignmentPoint.z = parseFloat(tag.value);
        break;
      case 40:
        entity.height = parseFloat(tag.value);
        break;
      case 41:
        entity.widthFactor = parseFloat(tag.value);
        break;
      case 50:
        entity.rotation = parseFloat(tag.value);
        break;
      case 51:
        entity.obliqueAngle = parseFloat(tag.value);
        break;
      case 7:
        entity.style = tag.value;
        break;
      case 71:
        entity.generationFlags = parseInt(tag.value, 10);
        break;
      case 72:
        entity.hAlign = parseInt(tag.value, 10);
        break;
      case 73:
        entity.vAlign = parseInt(tag.value, 10);
        break;
    }
  }
  return entity;
}

// src/parser/entities/mtext.ts
function parseMText(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "MTEXT",
    text: "",
    insertionPoint: { x: 0, y: 0, z: 0 },
    height: 1,
    width: 0,
    attachmentPoint: 1,
    drawingDirection: 1,
    rotation: 0,
    lineSpacingStyle: 1,
    lineSpacingFactor: 1,
    style: "STANDARD",
    bgFill: 0,
    bgFillScale: 1.5
  };
  const textChunks = [];
  for (const tag of tags) {
    switch (tag.code) {
      case 1:
        textChunks.push(tag.value);
        break;
      case 3:
        textChunks.push(tag.value);
        break;
      case 7:
        entity.style = tag.value;
        break;
      case 10:
        entity.insertionPoint.x = parseFloat(tag.value);
        break;
      case 20:
        entity.insertionPoint.y = parseFloat(tag.value);
        break;
      case 30:
        entity.insertionPoint.z = parseFloat(tag.value);
        break;
      case 11:
        if (!entity.textDirection) entity.textDirection = { x: 0, y: 0, z: 0 };
        entity.textDirection.x = parseFloat(tag.value);
        break;
      case 21:
        if (!entity.textDirection) entity.textDirection = { x: 0, y: 0, z: 0 };
        entity.textDirection.y = parseFloat(tag.value);
        break;
      case 31:
        if (!entity.textDirection) entity.textDirection = { x: 0, y: 0, z: 0 };
        entity.textDirection.z = parseFloat(tag.value);
        break;
      case 40:
        entity.height = parseFloat(tag.value);
        break;
      case 41:
        entity.width = parseFloat(tag.value);
        break;
      case 44:
        entity.lineSpacingFactor = parseFloat(tag.value);
        break;
      case 50:
        entity.rotation = parseFloat(tag.value);
        break;
      case 71:
        entity.attachmentPoint = parseInt(tag.value, 10);
        break;
      case 72:
        entity.drawingDirection = parseInt(tag.value, 10);
        break;
      case 73:
        entity.lineSpacingStyle = parseInt(tag.value, 10);
        break;
      case 90:
        entity.bgFill = parseInt(tag.value, 10);
        break;
    }
  }
  entity.text = textChunks.join("");
  return entity;
}

// src/parser/entities/insert.ts
function parseInsert(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "INSERT",
    blockName: "",
    insertionPoint: { x: 0, y: 0, z: 0 },
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rotation: 0,
    columnCount: 1,
    rowCount: 1,
    columnSpacing: 0,
    rowSpacing: 0,
    attribs: []
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 2:
        entity.blockName = tag.value;
        break;
      case 10:
        entity.insertionPoint.x = parseFloat(tag.value);
        break;
      case 20:
        entity.insertionPoint.y = parseFloat(tag.value);
        break;
      case 30:
        entity.insertionPoint.z = parseFloat(tag.value);
        break;
      case 41:
        entity.scaleX = parseFloat(tag.value);
        break;
      case 42:
        entity.scaleY = parseFloat(tag.value);
        break;
      case 43:
        entity.scaleZ = parseFloat(tag.value);
        break;
      case 44:
        entity.columnSpacing = parseFloat(tag.value);
        break;
      case 45:
        entity.rowSpacing = parseFloat(tag.value);
        break;
      case 50:
        entity.rotation = parseFloat(tag.value);
        break;
      case 70:
        entity.columnCount = parseInt(tag.value, 10) || 1;
        break;
      case 71:
        entity.rowCount = parseInt(tag.value, 10) || 1;
        break;
    }
  }
  return entity;
}

// src/parser/entities/dimension.ts
function parseDimension(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "DIMENSION",
    blockName: "",
    dimStyle: "STANDARD",
    dimType: 0,
    defPoint: { x: 0, y: 0, z: 0 },
    textMidpoint: { x: 0, y: 0, z: 0 },
    textOverride: "",
    rotation: 0,
    textRotation: 0,
    leaderLength: 0
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 1:
        entity.textOverride = tag.value;
        break;
      case 2:
        entity.blockName = tag.value;
        break;
      case 3:
        entity.dimStyle = tag.value;
        break;
      case 10:
        entity.defPoint.x = parseFloat(tag.value);
        break;
      case 20:
        entity.defPoint.y = parseFloat(tag.value);
        break;
      case 30:
        entity.defPoint.z = parseFloat(tag.value);
        break;
      case 11:
        entity.textMidpoint.x = parseFloat(tag.value);
        break;
      case 21:
        entity.textMidpoint.y = parseFloat(tag.value);
        break;
      case 31:
        entity.textMidpoint.z = parseFloat(tag.value);
        break;
      case 13:
        if (!entity.defPoint2) entity.defPoint2 = { x: 0, y: 0, z: 0 };
        entity.defPoint2.x = parseFloat(tag.value);
        break;
      case 23:
        if (!entity.defPoint2) entity.defPoint2 = { x: 0, y: 0, z: 0 };
        entity.defPoint2.y = parseFloat(tag.value);
        break;
      case 33:
        if (!entity.defPoint2) entity.defPoint2 = { x: 0, y: 0, z: 0 };
        entity.defPoint2.z = parseFloat(tag.value);
        break;
      case 14:
        if (!entity.defPoint3) entity.defPoint3 = { x: 0, y: 0, z: 0 };
        entity.defPoint3.x = parseFloat(tag.value);
        break;
      case 24:
        if (!entity.defPoint3) entity.defPoint3 = { x: 0, y: 0, z: 0 };
        entity.defPoint3.y = parseFloat(tag.value);
        break;
      case 34:
        if (!entity.defPoint3) entity.defPoint3 = { x: 0, y: 0, z: 0 };
        entity.defPoint3.z = parseFloat(tag.value);
        break;
      case 15:
        if (!entity.defPoint4) entity.defPoint4 = { x: 0, y: 0, z: 0 };
        entity.defPoint4.x = parseFloat(tag.value);
        break;
      case 25:
        if (!entity.defPoint4) entity.defPoint4 = { x: 0, y: 0, z: 0 };
        entity.defPoint4.y = parseFloat(tag.value);
        break;
      case 35:
        if (!entity.defPoint4) entity.defPoint4 = { x: 0, y: 0, z: 0 };
        entity.defPoint4.z = parseFloat(tag.value);
        break;
      case 16:
        if (!entity.defPoint5) entity.defPoint5 = { x: 0, y: 0, z: 0 };
        entity.defPoint5.x = parseFloat(tag.value);
        break;
      case 26:
        if (!entity.defPoint5) entity.defPoint5 = { x: 0, y: 0, z: 0 };
        entity.defPoint5.y = parseFloat(tag.value);
        break;
      case 36:
        if (!entity.defPoint5) entity.defPoint5 = { x: 0, y: 0, z: 0 };
        entity.defPoint5.z = parseFloat(tag.value);
        break;
      case 40:
        entity.leaderLength = parseFloat(tag.value);
        break;
      case 50:
        entity.rotation = parseFloat(tag.value);
        break;
      case 53:
        entity.textRotation = parseFloat(tag.value);
        break;
      case 70:
        entity.dimType = parseInt(tag.value, 10);
        break;
    }
  }
  return entity;
}

// src/parser/entities/hatch.ts
function parseHatch(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "HATCH",
    patternName: "",
    solidFill: true,
    associative: false,
    hatchStyle: 0,
    patternType: 1,
    patternAngle: 0,
    patternScale: 1,
    boundaryPaths: []
  };
  let i = 0;
  while (i < tags.length) {
    const tag = tags[i];
    switch (tag.code) {
      case 2:
        entity.patternName = tag.value;
        break;
      case 41:
        entity.patternScale = parseFloat(tag.value);
        break;
      case 52:
        entity.patternAngle = parseFloat(tag.value);
        break;
      case 70:
        entity.solidFill = tag.value === "1";
        break;
      case 71:
        entity.associative = tag.value === "1";
        break;
      case 75:
        entity.hatchStyle = parseInt(tag.value, 10);
        break;
      case 76:
        entity.patternType = parseInt(tag.value, 10);
        break;
      case 91: {
        const pathCount = parseInt(tag.value, 10);
        i++;
        for (let p = 0; p < pathCount && i < tags.length; p++) {
          const result = parseBoundaryPath(tags, i);
          entity.boundaryPaths.push(result.path);
          i = result.nextIndex;
        }
        continue;
      }
    }
    i++;
  }
  return entity;
}
function parseBoundaryPath(tags, i) {
  let flags = 0;
  if (i < tags.length && tags[i].code === 92) {
    flags = parseInt(tags[i].value, 10);
    i++;
  }
  const isPolyline = (flags & 2) !== 0;
  if (isPolyline) {
    return parsePolylinePath(tags, i, flags);
  } else {
    return parseEdgePath(tags, i, flags);
  }
}
function parsePolylinePath(tags, i, flags) {
  const path = {
    type: "polyline",
    vertices: [],
    bulges: [],
    flags
  };
  let hasBulge = false;
  if (i < tags.length && tags[i].code === 72) {
    hasBulge = tags[i].value === "1";
    i++;
  }
  if (i < tags.length && tags[i].code === 73) {
    path.isClosed = tags[i].value === "1";
    i++;
  }
  let vertexCount = 0;
  if (i < tags.length && tags[i].code === 93) {
    vertexCount = parseInt(tags[i].value, 10);
    i++;
  }
  for (let v = 0; v < vertexCount && i < tags.length; v++) {
    const vertex = { x: 0, y: 0 };
    if (tags[i].code === 10) {
      vertex.x = parseFloat(tags[i].value);
      i++;
    }
    if (i < tags.length && tags[i].code === 20) {
      vertex.y = parseFloat(tags[i].value);
      i++;
    }
    path.vertices.push(vertex);
    if (hasBulge && i < tags.length && tags[i].code === 42) {
      path.bulges.push(parseFloat(tags[i].value));
      i++;
    } else if (hasBulge) {
      path.bulges.push(0);
    }
  }
  while (i < tags.length && (tags[i].code === 97 || tags[i].code === 330)) {
    if (tags[i].code === 97) {
      const count = parseInt(tags[i].value, 10);
      i++;
      for (let s = 0; s < count && i < tags.length && tags[i].code === 330; s++) {
        i++;
      }
    } else {
      i++;
    }
  }
  return { path, nextIndex: i };
}
function parseEdgePath(tags, i, flags) {
  const path = {
    type: "edges",
    edges: [],
    flags
  };
  let edgeCount = 0;
  if (i < tags.length && tags[i].code === 93) {
    edgeCount = parseInt(tags[i].value, 10);
    i++;
  }
  for (let e = 0; e < edgeCount && i < tags.length; e++) {
    if (tags[i].code !== 72) break;
    const edgeType = parseInt(tags[i].value, 10);
    i++;
    switch (edgeType) {
      case 1: {
        const edge = {
          type: "line",
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 }
        };
        if (i < tags.length && tags[i].code === 10) {
          edge.start.x = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 20) {
          edge.start.y = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 11) {
          edge.end.x = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 21) {
          edge.end.y = parseFloat(tags[i].value);
          i++;
        }
        path.edges.push(edge);
        break;
      }
      case 2: {
        const edge = {
          type: "arc",
          center: { x: 0, y: 0 },
          radius: 0,
          startAngle: 0,
          endAngle: 360,
          ccw: true
        };
        if (i < tags.length && tags[i].code === 10) {
          edge.center.x = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 20) {
          edge.center.y = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 40) {
          edge.radius = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 50) {
          edge.startAngle = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 51) {
          edge.endAngle = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 73) {
          edge.ccw = tags[i].value === "1";
          i++;
        }
        path.edges.push(edge);
        break;
      }
      case 3: {
        const edge = {
          type: "ellipse",
          center: { x: 0, y: 0 },
          majorAxis: { x: 1, y: 0 },
          minorRatio: 1,
          startAngle: 0,
          endAngle: Math.PI * 2,
          ccw: true
        };
        if (i < tags.length && tags[i].code === 10) {
          edge.center.x = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 20) {
          edge.center.y = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 11) {
          edge.majorAxis.x = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 21) {
          edge.majorAxis.y = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 40) {
          edge.minorRatio = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 50) {
          edge.startAngle = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 51) {
          edge.endAngle = parseFloat(tags[i].value);
          i++;
        }
        if (i < tags.length && tags[i].code === 73) {
          edge.ccw = tags[i].value === "1";
          i++;
        }
        path.edges.push(edge);
        break;
      }
      case 4: {
        let degree = 3;
        const knots = [];
        const controlPoints = [];
        if (i < tags.length && tags[i].code === 94) {
          degree = parseInt(tags[i].value, 10);
          i++;
        }
        if (i < tags.length && tags[i].code === 73) {
          i++;
        }
        if (i < tags.length && tags[i].code === 74) {
          i++;
        }
        let knotCount = 0;
        if (i < tags.length && tags[i].code === 95) {
          knotCount = parseInt(tags[i].value, 10);
          i++;
        }
        let cpCount = 0;
        if (i < tags.length && tags[i].code === 96) {
          cpCount = parseInt(tags[i].value, 10);
          i++;
        }
        for (let k = 0; k < knotCount && i < tags.length && tags[i].code === 40; k++) {
          knots.push(parseFloat(tags[i].value));
          i++;
        }
        for (let c = 0; c < cpCount && i < tags.length; c++) {
          const pt = { x: 0, y: 0 };
          if (tags[i].code === 10) {
            pt.x = parseFloat(tags[i].value);
            i++;
          }
          if (i < tags.length && tags[i].code === 20) {
            pt.y = parseFloat(tags[i].value);
            i++;
          }
          controlPoints.push(pt);
        }
        path.edges.push({ type: "spline", degree, knots, controlPoints });
        break;
      }
    }
  }
  while (i < tags.length && (tags[i].code === 97 || tags[i].code === 330)) {
    if (tags[i].code === 97) {
      const count = parseInt(tags[i].value, 10);
      i++;
      for (let s = 0; s < count && i < tags.length && tags[i].code === 330; s++) {
        i++;
      }
    } else {
      i++;
    }
  }
  return { path, nextIndex: i };
}

// src/parser/entities/point.ts
function parsePoint(tags) {
  const base = parseBaseEntity(tags);
  const entity = {
    ...base,
    type: "POINT",
    position: { x: 0, y: 0, z: 0 }
  };
  for (const tag of tags) {
    switch (tag.code) {
      case 10:
        entity.position.x = parseFloat(tag.value);
        break;
      case 20:
        entity.position.y = parseFloat(tag.value);
        break;
      case 30:
        entity.position.z = parseFloat(tag.value);
        break;
    }
  }
  return entity;
}

// src/parser/sections/entities.ts
function parseEntities(tokens, i, entities) {
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.code !== 0) {
      i++;
      continue;
    }
    const type = token.value;
    if (type === "ENDSEC" || type === "ENDBLK") return i + 1;
    i++;
    const entityTags = [];
    while (i < tokens.length && tokens[i].code !== 0) {
      entityTags.push(tokens[i]);
      i++;
    }
    switch (type) {
      case "LINE":
        entities.push(parseLine(entityTags));
        break;
      case "CIRCLE":
        entities.push(parseCircle(entityTags));
        break;
      case "ARC":
        entities.push(parseArc(entityTags));
        break;
      case "LWPOLYLINE":
        entities.push(parseLwPolyline(entityTags));
        break;
      case "ELLIPSE":
        entities.push(parseEllipse(entityTags));
        break;
      case "SPLINE":
        entities.push(parseSpline(entityTags));
        break;
      case "TEXT":
        entities.push(parseText(entityTags));
        break;
      case "MTEXT":
        entities.push(parseMText(entityTags));
        break;
      case "INSERT": {
        const insert = parseInsert(entityTags);
        const hasAttribs = entityTags.some((t) => t.code === 66 && t.value === "1");
        if (hasAttribs) {
          i = parseAttribs(tokens, i, insert.attribs);
        }
        entities.push(insert);
        break;
      }
      case "DIMENSION":
        entities.push(parseDimension(entityTags));
        break;
      case "HATCH":
        entities.push(parseHatch(entityTags));
        break;
      case "POINT":
        entities.push(parsePoint(entityTags));
        break;
      case "SOLID":
      case "TRACE":
      case "3DFACE": {
        const solid = { ...parseBaseEntity(entityTags), type, points: [] };
        for (let n = 0; n < 4; n++) {
          const x = entityTags.find(t => t.code === 10 + n);
          const y = entityTags.find(t => t.code === 20 + n);
          if (x) solid.points.push({ x: Number(x.value), y: y ? Number(y.value) : 0 });
        }
        entities.push(solid);
        break;
      }
      default:
        entities.push({ ...parseBaseEntity(entityTags), type });
        break;
      case "POLYLINE": {
        const polyline = parsePolyline(entityTags);
        i = parseVertices(tokens, i, polyline.vertices);
        entities.push(polyline);
        break;
      }
    }
  }
  return i;
}
function parseVertices(tokens, i, vertices) {
  while (i < tokens.length) {
    if (tokens[i].code !== 0) {
      i++;
      continue;
    }
    const type = tokens[i].value;
    if (type === "SEQEND") return i + 1;
    if (type === "ENDSEC" || type === "ENDBLK") return i;
    if (type === "VERTEX") {
      i++;
      const vertex = { x: 0, y: 0, bulge: 0, startWidth: 0, endWidth: 0 };
      while (i < tokens.length && tokens[i].code !== 0) {
        const tag = tokens[i];
        switch (tag.code) {
          case 10:
            vertex.x = parseFloat(tag.value);
            break;
          case 20:
            vertex.y = parseFloat(tag.value);
            break;
          case 42:
            vertex.bulge = parseFloat(tag.value);
            break;
          case 40:
            vertex.startWidth = parseFloat(tag.value);
            break;
          case 41:
            vertex.endWidth = parseFloat(tag.value);
            break;
        }
        i++;
      }
      vertices.push(vertex);
    } else {
      i++;
      while (i < tokens.length && tokens[i].code !== 0) i++;
    }
  }
  return i;
}
function parseAttribs(tokens, i, attribs) {
  while (i < tokens.length) {
    if (tokens[i].code !== 0) {
      i++;
      continue;
    }
    const type = tokens[i].value;
    if (type === "SEQEND") return i + 1;
    if (type === "ENDSEC" || type === "ENDBLK") return i;
    if (type === "ATTRIB") {
      i++;
      const attrib = {
        tag: "",
        text: "",
        insertionPoint: { x: 0, y: 0, z: 0 },
        height: 1,
        rotation: 0,
        style: "STANDARD",
        layer: "0",
        color: 256
      };
      while (i < tokens.length && tokens[i].code !== 0) {
        const tag = tokens[i];
        switch (tag.code) {
          case 1:
            attrib.text = tag.value;
            break;
          case 2:
            attrib.tag = tag.value;
            break;
          case 7:
            attrib.style = tag.value;
            break;
          case 8:
            attrib.layer = tag.value;
            break;
          case 10:
            attrib.insertionPoint.x = parseFloat(tag.value);
            break;
          case 20:
            attrib.insertionPoint.y = parseFloat(tag.value);
            break;
          case 30:
            attrib.insertionPoint.z = parseFloat(tag.value);
            break;
          case 40:
            attrib.height = parseFloat(tag.value);
            break;
          case 50:
            attrib.rotation = parseFloat(tag.value);
            break;
          case 62:
            attrib.color = parseInt(tag.value, 10);
            break;
        }
        i++;
      }
      attribs.push(attrib);
    } else {
      i++;
      while (i < tokens.length && tokens[i].code !== 0) i++;
    }
  }
  return i;
}

// src/parser/sections/blocks.ts
function parseBlocks(tokens, i, blocks) {
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.code === 0 && token.value === "ENDSEC") return i + 1;
    if (token.code === 0 && token.value === "BLOCK") {
      i++;
      const block = {
        name: "",
        basePoint: { x: 0, y: 0, z: 0 },
        entities: [],
        flags: 0
      };
      while (i < tokens.length && tokens[i].code !== 0) {
        const tag = tokens[i];
        switch (tag.code) {
          case 2:
            block.name = tag.value;
            break;
          case 8:
            break;
          case 10:
            block.basePoint.x = parseFloat(tag.value);
            break;
          case 20:
            block.basePoint.y = parseFloat(tag.value);
            break;
          case 30:
            block.basePoint.z = parseFloat(tag.value);
            break;
          case 70:
            block.flags = parseInt(tag.value, 10);
            break;
        }
        i++;
      }
      i = parseEntities(tokens, i, block.entities);
      if (block.name && !block.name.startsWith("*Model_Space") && !block.name.startsWith("*Paper_Space")) {
        blocks.set(block.name, block);
      }
    } else {
      i++;
    }
  }
  return i;
}

// src/parser/index.ts
var BINARY_DXF_SENTINEL = "AutoCAD Binary DXF";
var CODEPAGE_MAP = {
  "ANSI_874": "windows-874",
  "ANSI_932": "shift_jis",
  "ANSI_936": "gbk",
  "ANSI_949": "euc-kr",
  "ANSI_950": "big5",
  "ANSI_1250": "windows-1250",
  "ANSI_1251": "windows-1251",
  "ANSI_1252": "windows-1252",
  "ANSI_1253": "windows-1253",
  "ANSI_1254": "windows-1254",
  "ANSI_1255": "windows-1255",
  "ANSI_1256": "windows-1256",
  "ANSI_1257": "windows-1257",
  "ANSI_1258": "windows-1258"
};
var UTF8_MIN_VERSION = "AC1021";
function createDefaultHeader() {
  return {
    acadVersion: "",
    insUnits: 0,
    measurement: 0,
    ltScale: 1
  };
}
function decodeUnicodeEscapes(text) {
  return text.replace(
    /\\U\+([0-9A-Fa-f]{4})/g,
    (_, hex) => String.fromCodePoint(parseInt(hex, 16))
  );
}
function decodeInput(input) {
  if (typeof input === "string") {
    return decodeUnicodeEscapes(input);
  }
  const bytes = new Uint8Array(input);
  const sentinelBytes = new TextDecoder("ascii").decode(bytes.slice(0, BINARY_DXF_SENTINEL.length));
  if (sentinelBytes === BINARY_DXF_SENTINEL) {
    throw new DxfParseError("Binary DXF format is not supported. Please export as ASCII DXF.");
  }
  let text = new TextDecoder("utf-8").decode(input);
  const versionMatch = text.match(/\$ACADVER[\s\S]*?\n\s*1\s*\n\s*(\S+)/);
  const version = versionMatch?.[1] ?? "";
  if (version && version < UTF8_MIN_VERSION) {
    const cpMatch = text.match(/\$DWGCODEPAGE[\s\S]*?\n\s*3\s*\n\s*(\S+)/);
    const codepage = cpMatch?.[1] ?? "";
    const encoding = CODEPAGE_MAP[codepage] ?? "windows-1252";
    if (encoding !== "utf-8") {
      text = new TextDecoder(encoding).decode(input);
    }
  }
  return decodeUnicodeEscapes(text);
}
function skipSection(tokens, i) {
  while (i < tokens.length) {
    if (tokens[i].code === 0 && tokens[i].value === "ENDSEC") {
      return i + 1;
    }
    i++;
  }
  return i;
}
function ensureDefaultLayer(doc) {
  if (!doc.layers.has("0")) {
    doc.layers.set("0", {
      name: "0",
      color: 7,
      lineType: "Continuous",
      flags: 0,
      lineWeight: -3,
      isOff: false,
      isFrozen: false,
      isLocked: false
    });
  }
}
function computeDerivedLayerFlags(doc) {
  for (const [, layer] of doc.layers) {
    layer.isOff = layer.color < 0;
    if (layer.isOff) {
      layer.color = Math.abs(layer.color);
    }
    layer.isFrozen = (layer.flags & 1) !== 0;
    layer.isLocked = (layer.flags & 4) !== 0;
  }
}
var DxfParseError = class extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "DxfParseError";
  }
};
function parseDxf(input) {
  if (typeof input === "string") {
    if (input.length === 0) {
      throw new DxfParseError("Input is empty. Expected a DXF string or ArrayBuffer.");
    }
  } else if (input instanceof ArrayBuffer) {
    if (input.byteLength === 0) {
      throw new DxfParseError("Input ArrayBuffer is empty.");
    }
  } else {
    throw new DxfParseError("Invalid input type. Expected a string or ArrayBuffer.");
  }
  let text;
  try {
    text = decodeInput(input);
  } catch (err) {
    if (err instanceof DxfParseError) {
      throw err;
    }
    throw new DxfParseError("Failed to decode DXF input.", err);
  }
  let tokens;
  try {
    tokens = tokenize(text);
  } catch (err) {
    throw new DxfParseError("Failed to tokenize DXF content.", err);
  }
  if (tokens.length === 0) {
    throw new DxfParseError("DXF content produced no tokens. The input may not be a valid DXF file.");
  }
  const doc = {
    header: createDefaultHeader(),
    layers: /* @__PURE__ */ new Map(),
    lineTypes: /* @__PURE__ */ new Map(),
    styles: /* @__PURE__ */ new Map(),
    blocks: /* @__PURE__ */ new Map(),
    entities: []
  };
  try {
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.code === 0 && token.value === "SECTION") {
        i++;
        if (i >= tokens.length) break;
        const sectionName = tokens[i].value;
        i++;
        switch (sectionName) {
          case "HEADER":
            i = parseHeader(tokens, i, doc.header);
            break;
          case "TABLES":
            i = parseTables(tokens, i, doc);
            break;
          case "BLOCKS":
            i = parseBlocks(tokens, i, doc.blocks);
            break;
          case "ENTITIES":
            i = parseEntities(tokens, i, doc.entities);
            break;
          default:
            i = skipSection(tokens, i);
            break;
        }
      } else if (token.code === 0 && token.value === "EOF") {
        break;
      } else {
        i++;
      }
    }
  } catch (err) {
    throw new DxfParseError("Failed to parse DXF sections.", err);
  }
  ensureDefaultLayer(doc);
  computeDerivedLayerFlags(doc);
  return doc;
}

// src/parser/colors.ts
var ACI_COLORS = [
  "#000000",
  // 0: BYBLOCK
  "#FF0000",
  // 1: Red
  "#FFFF00",
  // 2: Yellow
  "#00FF00",
  // 3: Green
  "#00FFFF",
  // 4: Cyan
  "#0000FF",
  // 5: Blue
  "#FF00FF",
  // 6: Magenta
  "#FFFFFF",
  // 7: White
  "#808080",
  // 8: Dark gray
  "#C0C0C0",
  // 9: Light gray
  "#FF0000",
  // 10
  "#FF7F7F",
  // 11
  "#A50000",
  // 12
  "#A55252",
  // 13
  "#7F0000",
  // 14
  "#7F3F3F",
  // 15
  "#4C0000",
  // 16
  "#4C2626",
  // 17
  "#260000",
  // 18
  "#261313",
  // 19
  "#FF3F00",
  // 20
  "#FF9F7F",
  // 21
  "#A52900",
  // 22
  "#A56752",
  // 23
  "#7F1F00",
  // 24
  "#7F4F3F",
  // 25
  "#4C1300",
  // 26
  "#4C2F26",
  // 27
  "#260900",
  // 28
  "#261713",
  // 29
  "#FF7F00",
  // 30
  "#FFBF7F",
  // 31
  "#A55200",
  // 32
  "#A57C52",
  // 33
  "#7F3F00",
  // 34
  "#7F5F3F",
  // 35
  "#4C2600",
  // 36
  "#4C3926",
  // 37
  "#261300",
  // 38
  "#261C13",
  // 39
  "#FFBF00",
  // 40
  "#FFDF7F",
  // 41
  "#A57C00",
  // 42
  "#A59152",
  // 43
  "#7F5F00",
  // 44
  "#7F6F3F",
  // 45
  "#4C3900",
  // 46
  "#4C4226",
  // 47
  "#261C00",
  // 48
  "#262113",
  // 49
  "#FFFF00",
  // 50
  "#FFFF7F",
  // 51
  "#A5A500",
  // 52
  "#A5A552",
  // 53
  "#7F7F00",
  // 54
  "#7F7F3F",
  // 55
  "#4C4C00",
  // 56
  "#4C4C26",
  // 57
  "#262600",
  // 58
  "#262613",
  // 59
  "#BFFF00",
  // 60
  "#DFFF7F",
  // 61
  "#7CA500",
  // 62
  "#91A552",
  // 63
  "#5F7F00",
  // 64
  "#6F7F3F",
  // 65
  "#394C00",
  // 66
  "#424C26",
  // 67
  "#1C2600",
  // 68
  "#212613",
  // 69
  "#7FFF00",
  // 70
  "#BFFF7F",
  // 71
  "#52A500",
  // 72
  "#7CA552",
  // 73
  "#3F7F00",
  // 74
  "#5F7F3F",
  // 75
  "#264C00",
  // 76
  "#394C26",
  // 77
  "#132600",
  // 78
  "#1C2613",
  // 79
  "#3FFF00",
  // 80
  "#9FFF7F",
  // 81
  "#29A500",
  // 82
  "#67A552",
  // 83
  "#1F7F00",
  // 84
  "#4F7F3F",
  // 85
  "#134C00",
  // 86
  "#2F4C26",
  // 87
  "#092600",
  // 88
  "#172613",
  // 89
  "#00FF00",
  // 90
  "#7FFF7F",
  // 91
  "#00A500",
  // 92
  "#52A552",
  // 93
  "#007F00",
  // 94
  "#3F7F3F",
  // 95
  "#004C00",
  // 96
  "#264C26",
  // 97
  "#002600",
  // 98
  "#132613",
  // 99
  "#00FF3F",
  // 100
  "#7FFF9F",
  // 101
  "#00A529",
  // 102
  "#52A567",
  // 103
  "#007F1F",
  // 104
  "#3F7F4F",
  // 105
  "#004C13",
  // 106
  "#264C2F",
  // 107
  "#002609",
  // 108
  "#132617",
  // 109
  "#00FF7F",
  // 110
  "#7FFFBF",
  // 111
  "#00A552",
  // 112
  "#52A57C",
  // 113
  "#007F3F",
  // 114
  "#3F7F5F",
  // 115
  "#004C26",
  // 116
  "#264C39",
  // 117
  "#002613",
  // 118
  "#13261C",
  // 119
  "#00FFBF",
  // 120
  "#7FFFDF",
  // 121
  "#00A57C",
  // 122
  "#52A591",
  // 123
  "#007F5F",
  // 124
  "#3F7F6F",
  // 125
  "#004C39",
  // 126
  "#264C42",
  // 127
  "#00261C",
  // 128
  "#132621",
  // 129
  "#00FFFF",
  // 130
  "#7FFFFF",
  // 131
  "#00A5A5",
  // 132
  "#52A5A5",
  // 133
  "#007F7F",
  // 134
  "#3F7F7F",
  // 135
  "#004C4C",
  // 136
  "#264C4C",
  // 137
  "#002626",
  // 138
  "#132626",
  // 139
  "#00BFFF",
  // 140
  "#7FDFFF",
  // 141
  "#007CA5",
  // 142
  "#5291A5",
  // 143
  "#005F7F",
  // 144
  "#3F6F7F",
  // 145
  "#00394C",
  // 146
  "#26424C",
  // 147
  "#001C26",
  // 148
  "#132126",
  // 149
  "#007FFF",
  // 150
  "#7FBFFF",
  // 151
  "#0052A5",
  // 152
  "#527CA5",
  // 153
  "#003F7F",
  // 154
  "#3F5F7F",
  // 155
  "#00264C",
  // 156
  "#26394C",
  // 157
  "#001326",
  // 158
  "#131C26",
  // 159
  "#003FFF",
  // 160
  "#7F9FFF",
  // 161
  "#0029A5",
  // 162
  "#5267A5",
  // 163
  "#001F7F",
  // 164
  "#3F4F7F",
  // 165
  "#00134C",
  // 166
  "#262F4C",
  // 167
  "#000926",
  // 168
  "#131726",
  // 169
  "#0000FF",
  // 170
  "#7F7FFF",
  // 171
  "#0000A5",
  // 172
  "#5252A5",
  // 173
  "#00007F",
  // 174
  "#3F3F7F",
  // 175
  "#00004C",
  // 176
  "#26264C",
  // 177
  "#000026",
  // 178
  "#131326",
  // 179
  "#3F00FF",
  // 180
  "#9F7FFF",
  // 181
  "#2900A5",
  // 182
  "#6752A5",
  // 183
  "#1F007F",
  // 184
  "#4F3F7F",
  // 185
  "#13004C",
  // 186
  "#2F264C",
  // 187
  "#090026",
  // 188
  "#171326",
  // 189
  "#7F00FF",
  // 190
  "#BF7FFF",
  // 191
  "#5200A5",
  // 192
  "#7C52A5",
  // 193
  "#3F007F",
  // 194
  "#5F3F7F",
  // 195
  "#26004C",
  // 196
  "#39264C",
  // 197
  "#130026",
  // 198
  "#1C1326",
  // 199
  "#BF00FF",
  // 200
  "#DF7FFF",
  // 201
  "#7C00A5",
  // 202
  "#9152A5",
  // 203
  "#5F007F",
  // 204
  "#6F3F7F",
  // 205
  "#39004C",
  // 206
  "#42264C",
  // 207
  "#1C0026",
  // 208
  "#211326",
  // 209
  "#FF00FF",
  // 210
  "#FF7FFF",
  // 211
  "#A500A5",
  // 212
  "#A552A5",
  // 213
  "#7F007F",
  // 214
  "#7F3F7F",
  // 215
  "#4C004C",
  // 216
  "#4C264C",
  // 217
  "#260026",
  // 218
  "#261326",
  // 219
  "#FF00BF",
  // 220
  "#FF7FDF",
  // 221
  "#A5007C",
  // 222
  "#A55291",
  // 223
  "#7F005F",
  // 224
  "#7F3F6F",
  // 225
  "#4C0039",
  // 226
  "#4C2642",
  // 227
  "#26001C",
  // 228
  "#261321",
  // 229
  "#FF007F",
  // 230
  "#FF7FBF",
  // 231
  "#A50052",
  // 232
  "#A5527C",
  // 233
  "#7F003F",
  // 234
  "#7F3F5F",
  // 235
  "#4C0026",
  // 236
  "#4C2639",
  // 237
  "#260013",
  // 238
  "#26131C",
  // 239
  "#FF003F",
  // 240
  "#FF7F9F",
  // 241
  "#A50029",
  // 242
  "#A55267",
  // 243
  "#7F001F",
  // 244
  "#7F3F4F",
  // 245
  "#4C0013",
  // 246
  "#4C262F",
  // 247
  "#260009",
  // 248
  "#261317",
  // 249
  "#333333",
  // 250: Gray (darkest)
  "#505050",
  // 251: Gray
  "#696969",
  // 252: Gray
  "#828282",
  // 253: Gray
  "#BEBEBE",
  // 254: Gray
  "#FFFFFF"
  // 255: Gray (lightest)
];
function aciToHex(aci) {
  if (aci === 0 || aci === 256) return void 0;
  if (aci < 0 || aci > 255) return void 0;
  return ACI_COLORS[aci];
}
function aciToDisplayColor(aci, isDarkTheme) {
  if (aci === 7) return isDarkTheme ? "#FFFFFF" : "#000000";
  return ACI_COLORS[Math.abs(aci)] ?? (isDarkTheme ? "#FFFFFF" : "#000000");
}
function trueColorToHex(trueColor) {
  const r = trueColor >> 16 & 255;
  const g = trueColor >> 8 & 255;
  const b = trueColor & 255;
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// src/renderer/theme.ts
var THEMES = {
  dark: {
    backgroundColor: "#1a1a2e",
    defaultEntityColor: "#ffffff",
    selectionColor: "#00ff88",
    measureColor: "#ffaa00",
    gridColor: "#333333",
    crosshairColor: "#555555"
  },
  light: {
    backgroundColor: "#ffffff",
    defaultEntityColor: "#000000",
    selectionColor: "#0066ff",
    measureColor: "#ff6600",
    gridColor: "#dddddd",
    crosshairColor: "#cccccc"
  }
};

// src/renderer/camera.ts
function worldToScreen(vt, wx, wy) {
  return [
    wx * vt.scale + vt.offsetX,
    -wy * vt.scale + vt.offsetY
  ];
}
function screenToWorld(vt, sx, sy) {
  return [
    (sx - vt.offsetX) / vt.scale,
    -(sy - vt.offsetY) / vt.scale
  ];
}
function applyTransform(ctx, vt) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(vt.scale * dpr, 0, 0, -vt.scale * dpr, vt.offsetX * dpr, vt.offsetY * dpr);
}
function fitToView(canvasWidth, canvasHeight, minX, minY, maxX, maxY, padding = 0.05) {
  const worldWidth = maxX - minX;
  const worldHeight = maxY - minY;
  if (worldWidth <= 0 || worldHeight <= 0) {
    return { scale: 1, offsetX: canvasWidth / 2, offsetY: canvasHeight / 2 };
  }
  const scaleX = canvasWidth / worldWidth;
  const scaleY = canvasHeight / worldHeight;
  const scale = Math.min(scaleX, scaleY) * (1 - padding * 2);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const offsetX = canvasWidth / 2 - centerX * scale;
  const offsetY = canvasHeight / 2 + centerY * scale;
  return { scale, offsetX, offsetY };
}
function zoomAtPoint(vt, screenX, screenY, zoomFactor, minScale = 1e-4, maxScale = 1e5) {
  const newScale = Math.max(minScale, Math.min(maxScale, vt.scale * zoomFactor));
  const actualFactor = newScale / vt.scale;
  return {
    scale: newScale,
    offsetX: screenX - (screenX - vt.offsetX) * actualFactor,
    offsetY: screenY - (screenY - vt.offsetY) * actualFactor
  };
}
var Camera = class {
  transform = { scale: 1, offsetX: 0, offsetY: 0 };
  minScale;
  maxScale;
  constructor(options) {
    this.minScale = options.minZoom;
    this.maxScale = options.maxZoom;
  }
  getTransform() {
    return this.transform;
  }
  setTransform(vt) {
    this.transform = vt;
  }
  pan(dx, dy) {
    this.transform = {
      ...this.transform,
      offsetX: this.transform.offsetX + dx,
      offsetY: this.transform.offsetY + dy
    };
  }
  zoom(screenX, screenY, factor) {
    this.transform = zoomAtPoint(
      this.transform,
      screenX,
      screenY,
      factor,
      this.minScale,
      this.maxScale
    );
  }
};

// src/renderer/resolve-color.ts
function getDisplayColor(aciColor, theme) {
  if (aciColor === 7) {
    return theme === "dark" ? "#ffffff" : "#000000";
  }
  return aciToHex(aciColor) ?? "#ffffff";
}
function resolveEntityColor(entity, layers, theme, parentColor) {
  if (entity.trueColor !== void 0) {
    const r = entity.trueColor >> 16 & 255;
    const g = entity.trueColor >> 8 & 255;
    const b = entity.trueColor & 255;
    return `rgb(${r},${g},${b})`;
  }
  if (entity.color === 0) {
    return parentColor ?? THEMES[theme].defaultEntityColor;
  }
  if (entity.color !== 256) {
    return getDisplayColor(entity.color, theme);
  }
  const layer = layers.get(entity.layer);
  if (layer) {
    if (layer.trueColor !== void 0) {
      const r = layer.trueColor >> 16 & 255;
      const g = layer.trueColor >> 8 & 255;
      const b = layer.trueColor & 255;
      return `rgb(${r},${g},${b})`;
    }
    const layerAci = Math.abs(layer.color);
    return getDisplayColor(layerAci, theme);
  }
  return THEMES[theme].defaultEntityColor;
}

// src/renderer/entities/draw-line.ts
function drawLine(ctx, entity) {
  ctx.beginPath();
  ctx.moveTo(entity.start.x, entity.start.y);
  ctx.lineTo(entity.end.x, entity.end.y);
  ctx.stroke();
}

// src/renderer/entities/draw-circle.ts
function drawCircle(ctx, entity) {
  if (entity.radius <= 0) return;
  ctx.beginPath();
  ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
  ctx.stroke();
}

// src/renderer/entities/draw-arc.ts
function drawArc(ctx, entity) {
  if (entity.radius <= 0) return;
  const startRad = entity.startAngle * Math.PI / 180;
  const endRad = entity.endAngle * Math.PI / 180;
  ctx.beginPath();
  ctx.arc(
    entity.center.x,
    entity.center.y,
    entity.radius,
    startRad,
    endRad,
    false
  );
  ctx.stroke();
}

// src/utils/math.ts
function bulgeToArc(x1, y1, x2, y2, bulge) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chord = Math.sqrt(dx * dx + dy * dy);
  if (chord < 1e-10) {
    return { cx: x1, cy: y1, radius: 0, startAngle: 0, endAngle: 0, anticlockwise: false };
  }
  const sagitta = Math.abs(bulge) * chord / 2;
  const radius = ((chord / 2) ** 2 + sagitta ** 2) / (2 * sagitta);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const perpX = -dy / chord;
  const perpY = dx / chord;
  const d = radius - sagitta;
  const sign = bulge > 0 ? 1 : -1;
  const cx = mx + sign * d * perpX;
  const cy = my + sign * d * perpY;
  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  const endAngle = Math.atan2(y2 - cy, x2 - cx);
  const anticlockwise = bulge < 0;
  return { cx, cy, radius, startAngle, endAngle, anticlockwise };
}
function drawBulgeArc(ctx, x1, y1, x2, y2, bulge) {
  const arc = bulgeToArc(x1, y1, x2, y2, bulge);
  if (arc.radius < 1e-10) {
    ctx.lineTo(x2, y2);
    return;
  }
  ctx.arc(arc.cx, arc.cy, arc.radius, arc.startAngle, arc.endAngle, arc.anticlockwise);
}

// src/renderer/entities/draw-polyline.ts
function drawLwPolyline(ctx, entity) {
  const verts = entity.vertices;
  if (verts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  const count = entity.closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i++) {
    const current = verts[i];
    const next = verts[(i + 1) % verts.length];
    if (Math.abs(current.bulge) < 1e-10) {
      ctx.lineTo(next.x, next.y);
    } else {
      drawBulgeArc(ctx, current.x, current.y, next.x, next.y, current.bulge);
    }
  }
  ctx.stroke();
}
function drawPolyline(ctx, entity) {
  const verts = entity.vertices;
  if (verts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  const count = entity.closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i++) {
    const current = verts[i];
    const next = verts[(i + 1) % verts.length];
    const bulge = current.bulge ?? 0;
    if (Math.abs(bulge) < 1e-10) {
      ctx.lineTo(next.x, next.y);
    } else {
      drawBulgeArc(ctx, current.x, current.y, next.x, next.y, bulge);
    }
  }
  ctx.stroke();
}

// src/renderer/entities/draw-ellipse.ts
function drawEllipse(ctx, entity) {
  const majorLength = Math.sqrt(
    entity.majorAxis.x ** 2 + entity.majorAxis.y ** 2 + entity.majorAxis.z ** 2
  );
  if (majorLength < 1e-10 || entity.minorRatio <= 0) return;
  const minorLength = majorLength * entity.minorRatio;
  const rotation = Math.atan2(entity.majorAxis.y, entity.majorAxis.x);
  ctx.beginPath();
  ctx.ellipse(
    entity.center.x,
    entity.center.y,
    majorLength,
    minorLength,
    rotation,
    entity.startParam,
    entity.endParam,
    false
  );
  ctx.stroke();
}

// src/utils/spline.ts
function deBoor(degree, controlPoints, knots, t, weights) {
  const n = controlPoints.length - 1;
  let k = degree;
  while (k < n && knots[k + 1] <= t) k++;
  const d = [];
  const w = [];
  for (let j = 0; j <= degree; j++) {
    const idx = k - degree + j;
    d.push({ ...controlPoints[idx] });
    w.push(weights ? weights[idx] : 1);
  }
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = k - degree + j;
      const denom = knots[i + degree - r + 1] - knots[i];
      if (Math.abs(denom) < 1e-10) continue;
      const alpha = (t - knots[i]) / denom;
      const dj = d[j];
      const djPrev = d[j - 1];
      if (weights) {
        const w0 = w[j - 1] * (1 - alpha);
        const w1 = w[j] * alpha;
        const wSum = w0 + w1;
        if (Math.abs(wSum) < 1e-10) continue;
        dj.x = (djPrev.x * w0 + dj.x * w1) / wSum;
        dj.y = (djPrev.y * w0 + dj.y * w1) / wSum;
        dj.z = (djPrev.z * w0 + dj.z * w1) / wSum;
        w[j] = wSum;
      } else {
        dj.x = (1 - alpha) * djPrev.x + alpha * dj.x;
        dj.y = (1 - alpha) * djPrev.y + alpha * dj.y;
        dj.z = (1 - alpha) * djPrev.z + alpha * dj.z;
      }
    }
  }
  return d[degree] ?? { x: 0, y: 0, z: 0 };
}
function fitPointsToPolyline(fitPoints) {
  if (fitPoints.length < 2) return fitPoints.map((p) => ({ x: p.x, y: p.y }));
  const result = [];
  const n = fitPoints.length;
  const segments = 10;
  for (let i = 0; i < n - 1; i++) {
    const p0 = fitPoints[Math.max(0, i - 1)];
    const p1 = fitPoints[i];
    const p2 = fitPoints[Math.min(n - 1, i + 1)];
    const p3 = fitPoints[Math.min(n - 1, i + 2)];
    for (let j = 0; j <= (i === n - 2 ? segments : segments - 1); j++) {
      const t = j / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      result.push({ x, y });
    }
  }
  return result;
}
function evaluateSpline(entity, pixelSize) {
  if (entity.degree === 1) {
    return entity.controlPoints.map((p) => ({ x: p.x, y: p.y }));
  }
  if (entity.controlPoints.length === 0 && entity.fitPoints.length >= 2) {
    return fitPointsToPolyline(entity.fitPoints);
  }
  if (entity.controlPoints.length < entity.degree + 1) return [];
  if (entity.knots.length < entity.controlPoints.length + entity.degree + 1) return [];
  const points = [];
  const tMin = entity.knots[entity.degree];
  const tMax = entity.knots[entity.knots.length - entity.degree - 1];
  if (tMax <= tMin) return [];
  const numPoints = Math.max(
    entity.controlPoints.length * 10,
    Math.ceil((tMax - tMin) / pixelSize)
  );
  const cappedPoints = Math.min(numPoints, 5e3);
  const weights = entity.weights.length > 0 ? entity.weights : void 0;
  for (let i = 0; i <= cappedPoints; i++) {
    const t = tMin + (tMax - tMin) * (i / cappedPoints);
    const p = deBoor(entity.degree, entity.controlPoints, entity.knots, t, weights);
    points.push({ x: p.x, y: p.y });
  }
  return points;
}

// src/renderer/entities/draw-spline.ts
function drawSpline(ctx, entity, pixelSize) {
  const points = evaluateSpline(entity, pixelSize);
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (entity.flags & 1) {
    ctx.closePath();
  }
  ctx.stroke();
}

// src/renderer/entities/draw-text.ts
var CAD_FONT_MAP = {
  "standard": "Arial, sans-serif",
  "arial": "Arial, sans-serif",
  "arial.ttf": "Arial, sans-serif",
  "romans.shx": '"Courier New", monospace',
  "simplex.shx": '"Courier New", monospace',
  "txt.shx": "monospace",
  "monotxt.shx": "monospace",
  "isocp.shx": '"Courier New", monospace',
  "isocpeur.shx": '"Courier New", monospace',
  "times.ttf": '"Times New Roman", serif',
  "timesnr.ttf": '"Times New Roman", serif',
  "gothic.ttf": '"Century Gothic", sans-serif'
};
function mapCADFont(styleName) {
  const key = styleName.toLowerCase().trim();
  return CAD_FONT_MAP[key] || "sans-serif";
}
function drawText(ctx, entity, pixelSize) {
  if (!entity.text || entity.height < pixelSize * 4) return;
  const useAlignPoint = entity.hAlign !== 0 || entity.vAlign !== 0;
  const px = useAlignPoint && entity.alignmentPoint ? entity.alignmentPoint.x : entity.insertionPoint.x;
  const py = useAlignPoint && entity.alignmentPoint ? entity.alignmentPoint.y : entity.insertionPoint.y;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(1, -1);
  if (entity.rotation) {
    ctx.rotate(-entity.rotation * Math.PI / 180);
  }
  if (entity.widthFactor !== 1) {
    ctx.scale(entity.widthFactor, 1);
  }
  if (entity.obliqueAngle) {
    const skew = Math.tan(entity.obliqueAngle * Math.PI / 180);
    ctx.transform(1, 0, skew, 1, 0, 0);
  }
  const backward = (entity.generationFlags & 2) !== 0;
  const upsideDown = (entity.generationFlags & 4) !== 0;
  if (backward) ctx.scale(-1, 1);
  if (upsideDown) ctx.scale(1, -1);
  const fontName = mapCADFont(entity.style || "Standard");
  ctx.font = `${entity.height}px ${fontName}`;
  switch (entity.hAlign) {
    case 0:
      ctx.textAlign = "left";
      break;
    case 1:
      ctx.textAlign = "center";
      break;
    case 2:
      ctx.textAlign = "right";
      break;
    case 3:
      ctx.textAlign = "left";
      break;
    // ALIGNED
    case 4:
      ctx.textAlign = "center";
      break;
    // MIDDLE
    case 5:
      ctx.textAlign = "left";
      break;
    // FIT
    default:
      ctx.textAlign = "left";
  }
  switch (entity.vAlign) {
    case 0:
      ctx.textBaseline = "alphabetic";
      break;
    case 1:
      ctx.textBaseline = "bottom";
      break;
    case 2:
      ctx.textBaseline = "middle";
      break;
    case 3:
      ctx.textBaseline = "top";
      break;
    default:
      ctx.textBaseline = "alphabetic";
  }
  ctx.fillText(entity.text, 0, 0);
  ctx.restore();
}
function stripMTextFormatting(text) {
  return text.replace(/\\P/g, "\n").replace(/\\[fFHWQTCAaLlOoKk][^;]*;/g, "").replace(/\\\\/g, "\\").replace(/\\~/g, "\xA0").replace(/\{/g, "").replace(/\}/g, "").replace(/\\S[^;]*;/g, "").trim();
}
function drawMText(ctx, entity, pixelSize) {
  if (!entity.text || entity.height < pixelSize * 4) return;
  ctx.save();
  ctx.translate(entity.insertionPoint.x, entity.insertionPoint.y);
  ctx.scale(1, -1);
  const rotation = entity.textDirection ? Math.atan2(entity.textDirection.y, entity.textDirection.x) : (entity.rotation || 0) * Math.PI / 180;
  if (rotation) ctx.rotate(-rotation);
  const plainText = stripMTextFormatting(entity.text);
  const lines = plainText.split("\n");
  const lineHeight = entity.height * (entity.lineSpacingFactor || 1.4);
  const fontName = mapCADFont(entity.style || "Standard");
  ctx.font = `${entity.height}px ${fontName}`;
  const col = (entity.attachmentPoint - 1) % 3;
  const row = Math.floor((entity.attachmentPoint - 1) / 3);
  const alignments = ["left", "center", "right"];
  ctx.textAlign = alignments[col] ?? "left";
  let startY = 0;
  const totalHeight = lines.length * lineHeight;
  switch (row) {
    case 0:
      startY = entity.height;
      break;
    // top: first line baseline
    case 1:
      startY = entity.height - totalHeight / 2;
      break;
    // middle
    case 2:
      startY = entity.height - totalHeight;
      break;
  }
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 0, startY + i * lineHeight);
  }
  ctx.restore();
}

// src/utils/bbox.ts
var MAX_BLOCK_DEPTH = 100;
function computeBlockContentsBBox(blockName, doc, cache, depth = 0) {
  if (depth > MAX_BLOCK_DEPTH) return null;
  if (cache.has(blockName)) return cache.get(blockName);
  const block = doc.blocks.get(blockName);
  if (!block) {
    cache.set(blockName, null);
    return null;
  }
  cache.set(blockName, null);
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let hasAny = false;
  for (const entity of block.entities) {
    let bbox;
    if (entity.type === "INSERT") {
      bbox = computeInsertBBox(entity, doc, cache, depth + 1);
    } else {
      bbox = computeEntityBBox(entity);
    }
    if (!bbox) continue;
    hasAny = true;
    minX = Math.min(minX, bbox.minX);
    minY = Math.min(minY, bbox.minY);
    maxX = Math.max(maxX, bbox.maxX);
    maxY = Math.max(maxY, bbox.maxY);
  }
  const result = hasAny ? { minX, minY, maxX, maxY } : null;
  cache.set(blockName, result);
  return result;
}
function computeInsertBBox(entity, doc, cache, depth = 0) {
  const contentBBox = computeBlockContentsBBox(entity.blockName, doc, cache, depth);
  if (!contentBBox) return null;
  const block = doc.blocks.get(entity.blockName);
  if (!block) return null;
  const bpX = block.basePoint.x;
  const bpY = block.basePoint.y;
  let x0 = contentBBox.minX - bpX;
  let y0 = contentBBox.minY - bpY;
  let x1 = contentBBox.maxX - bpX;
  let y1 = contentBBox.maxY - bpY;
  const sx = entity.scaleX;
  const sy = entity.scaleY;
  let sx0 = x0 * sx, sx1 = x1 * sx;
  let sy0 = y0 * sy, sy1 = y1 * sy;
  if (sx0 > sx1) {
    const t = sx0;
    sx0 = sx1;
    sx1 = t;
  }
  if (sy0 > sy1) {
    const t = sy0;
    sy0 = sy1;
    sy1 = t;
  }
  const rad = (entity.rotation || 0) * Math.PI / 180;
  if (Math.abs(rad) < 1e-10) {
    const ipx2 = entity.insertionPoint.x;
    const ipy2 = entity.insertionPoint.y;
    let rMinX2 = sx0 + ipx2;
    let rMinY2 = sy0 + ipy2;
    let rMaxX2 = sx1 + ipx2;
    let rMaxY2 = sy1 + ipy2;
    const cols2 = Math.max(1, entity.columnCount);
    const rows2 = Math.max(1, entity.rowCount);
    if (cols2 > 1 || rows2 > 1) {
      const gridExtentX = (cols2 - 1) * entity.columnSpacing;
      const gridExtentY = (rows2 - 1) * entity.rowSpacing;
      rMinX2 = Math.min(rMinX2, rMinX2 + gridExtentX);
      rMaxX2 = Math.max(rMaxX2, rMaxX2 + gridExtentX);
      rMinY2 = Math.min(rMinY2, rMinY2 + gridExtentY);
      rMaxY2 = Math.max(rMaxY2, rMaxY2 + gridExtentY);
    }
    return { minX: rMinX2, minY: rMinY2, maxX: rMaxX2, maxY: rMaxY2 };
  }
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: sx0, y: sy0 },
    { x: sx1, y: sy0 },
    { x: sx1, y: sy1 },
    { x: sx0, y: sy1 }
  ];
  const ipx = entity.insertionPoint.x;
  const ipy = entity.insertionPoint.y;
  let rMinX = Infinity, rMinY = Infinity;
  let rMaxX = -Infinity, rMaxY = -Infinity;
  for (const c of corners) {
    const rx = c.x * cos - c.y * sin + ipx;
    const ry = c.x * sin + c.y * cos + ipy;
    rMinX = Math.min(rMinX, rx);
    rMinY = Math.min(rMinY, ry);
    rMaxX = Math.max(rMaxX, rx);
    rMaxY = Math.max(rMaxY, ry);
  }
  const cols = Math.max(1, entity.columnCount);
  const rows = Math.max(1, entity.rowCount);
  if (cols > 1 || rows > 1) {
    const gridExtentX = (cols - 1) * entity.columnSpacing;
    const gridExtentY = (rows - 1) * entity.rowSpacing;
    const gridCorners = [
      { x: 0, y: 0 },
      { x: gridExtentX, y: 0 },
      { x: gridExtentX, y: gridExtentY },
      { x: 0, y: gridExtentY }
    ];
    for (const gc of gridCorners) {
      const grx = gc.x * cos - gc.y * sin;
      const gry = gc.x * sin + gc.y * cos;
      rMinX = Math.min(rMinX, rMinX + grx);
      rMinY = Math.min(rMinY, rMinY + gry);
      rMaxX = Math.max(rMaxX, rMaxX + grx);
      rMaxY = Math.max(rMaxY, rMaxY + gry);
    }
  }
  return { minX: rMinX, minY: rMinY, maxX: rMaxX, maxY: rMaxY };
}
function computeEntitiesBounds(entities, doc) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let hasAny = false;
  const cache = doc ? /* @__PURE__ */ new Map() : void 0;
  for (const entity of entities) {
    const bbox = doc && cache ? computeEntityBBoxWithDoc(entity, doc, cache) : computeEntityBBox(entity);
    if (!bbox) continue;
    hasAny = true;
    minX = Math.min(minX, bbox.minX);
    minY = Math.min(minY, bbox.minY);
    maxX = Math.max(maxX, bbox.maxX);
    maxY = Math.max(maxY, bbox.maxY);
  }
  return hasAny ? { minX, minY, maxX, maxY } : null;
}
function computeEntityBBoxWithDoc(entity, doc, cache) {
  if (entity.type === "INSERT") {
    return computeInsertBBox(entity, doc, cache);
  }
  return computeEntityBBox(entity);
}
var _blockEntityBBoxCache = null;
function buildBlockEntityBBoxCache(doc) {
  const cache = /* @__PURE__ */ new Map();
  for (const [name, block] of doc.blocks) {
    const bboxes = new Array(block.entities.length);
    for (let i = 0; i < block.entities.length; i++) {
      bboxes[i] = computeEntityBBox(block.entities[i]);
    }
    cache.set(name, bboxes);
  }
  return cache;
}
function setBlockEntityBBoxCache(cache) {
  _blockEntityBBoxCache = cache;
}
function clearBlockEntityBBoxCache() {
  _blockEntityBBoxCache = null;
}
function getBlockEntityBBox(blockName, index) {
  if (!_blockEntityBBoxCache) return void 0;
  const arr = _blockEntityBBoxCache.get(blockName);
  if (!arr || index >= arr.length) return void 0;
  return arr[index];
}
function computeEntityBBox(entity) {
  switch (entity.type) {
    case "LINE":
      return {
        minX: Math.min(entity.start.x, entity.end.x),
        minY: Math.min(entity.start.y, entity.end.y),
        maxX: Math.max(entity.start.x, entity.end.x),
        maxY: Math.max(entity.start.y, entity.end.y)
      };
    case "CIRCLE":
      return {
        minX: entity.center.x - entity.radius,
        minY: entity.center.y - entity.radius,
        maxX: entity.center.x + entity.radius,
        maxY: entity.center.y + entity.radius
      };
    case "ARC": {
      return {
        minX: entity.center.x - entity.radius,
        minY: entity.center.y - entity.radius,
        maxX: entity.center.x + entity.radius,
        maxY: entity.center.y + entity.radius
      };
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (entity.vertices.length === 0) return null;
      let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
      for (const v of entity.vertices) {
        pMinX = Math.min(pMinX, v.x);
        pMinY = Math.min(pMinY, v.y);
        pMaxX = Math.max(pMaxX, v.x);
        pMaxY = Math.max(pMaxY, v.y);
      }
      return { minX: pMinX, minY: pMinY, maxX: pMaxX, maxY: pMaxY };
    }
    case "ELLIPSE": {
      const majorLen = Math.sqrt(entity.majorAxis.x ** 2 + entity.majorAxis.y ** 2);
      return {
        minX: entity.center.x - majorLen,
        minY: entity.center.y - majorLen,
        maxX: entity.center.x + majorLen,
        maxY: entity.center.y + majorLen
      };
    }
    case "TEXT":
      return {
        minX: entity.insertionPoint.x,
        minY: entity.insertionPoint.y,
        maxX: entity.insertionPoint.x + entity.height * entity.text.length * 0.6,
        maxY: entity.insertionPoint.y + entity.height
      };
    case "MTEXT":
      return {
        minX: entity.insertionPoint.x,
        minY: entity.insertionPoint.y - entity.height,
        maxX: entity.insertionPoint.x + (entity.width || entity.height * 10),
        maxY: entity.insertionPoint.y + entity.height
      };
    case "SPLINE": {
      if (entity.controlPoints.length === 0) return null;
      let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
      for (const p of entity.controlPoints) {
        sMinX = Math.min(sMinX, p.x);
        sMinY = Math.min(sMinY, p.y);
        sMaxX = Math.max(sMaxX, p.x);
        sMaxY = Math.max(sMaxY, p.y);
      }
      return { minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY };
    }
    case "POINT":
      return {
        minX: entity.position.x,
        minY: entity.position.y,
        maxX: entity.position.x,
        maxY: entity.position.y
      };
    case "INSERT":
      return {
        minX: entity.insertionPoint.x,
        minY: entity.insertionPoint.y,
        maxX: entity.insertionPoint.x,
        maxY: entity.insertionPoint.y
      };
    case "DIMENSION":
      if (entity.defPoint) {
        return {
          minX: Math.min(entity.defPoint.x, entity.defPoint2?.x ?? entity.defPoint.x, entity.defPoint3?.x ?? entity.defPoint.x),
          minY: Math.min(entity.defPoint.y, entity.defPoint2?.y ?? entity.defPoint.y, entity.defPoint3?.y ?? entity.defPoint.y),
          maxX: Math.max(entity.defPoint.x, entity.defPoint2?.x ?? entity.defPoint.x, entity.defPoint3?.x ?? entity.defPoint.x),
          maxY: Math.max(entity.defPoint.y, entity.defPoint2?.y ?? entity.defPoint.y, entity.defPoint3?.y ?? entity.defPoint.y)
        };
      }
      return null;
    case "HATCH": {
      let hMinX = Infinity, hMinY = Infinity, hMaxX = -Infinity, hMaxY = -Infinity;
      let hasPoints = false;
      for (const path of entity.boundaryPaths) {
        if (path.vertices) {
          for (const v of path.vertices) {
            hasPoints = true;
            hMinX = Math.min(hMinX, v.x);
            hMinY = Math.min(hMinY, v.y);
            hMaxX = Math.max(hMaxX, v.x);
            hMaxY = Math.max(hMaxY, v.y);
          }
        }
      }
      return hasPoints ? { minX: hMinX, minY: hMinY, maxX: hMaxX, maxY: hMaxY } : null;
    }
    default:
      return null;
  }
}

// src/renderer/entities/batch-path.ts
var BATCHABLE_TYPES = /* @__PURE__ */ new Set([
  "LINE",
  "ARC",
  "CIRCLE",
  "LWPOLYLINE",
  "POLYLINE",
  "ELLIPSE",
  "SPLINE"
]);
function isBatchableStroke(type) {
  return BATCHABLE_TYPES.has(type);
}
function appendLinePath(ctx, entity) {
  ctx.moveTo(entity.start.x, entity.start.y);
  ctx.lineTo(entity.end.x, entity.end.y);
}
function appendArcPath(ctx, entity) {
  if (entity.radius <= 0) return;
  const startRad = entity.startAngle * Math.PI / 180;
  const endRad = entity.endAngle * Math.PI / 180;
  ctx.moveTo(
    entity.center.x + entity.radius * Math.cos(startRad),
    entity.center.y + entity.radius * Math.sin(startRad)
  );
  ctx.arc(entity.center.x, entity.center.y, entity.radius, startRad, endRad, false);
}
function appendCirclePath(ctx, entity) {
  if (entity.radius <= 0) return;
  ctx.moveTo(entity.center.x + entity.radius, entity.center.y);
  ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
}
function appendLwPolylinePath(ctx, entity) {
  const verts = entity.vertices;
  if (verts.length < 2) return;
  ctx.moveTo(verts[0].x, verts[0].y);
  const count = entity.closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i++) {
    const current = verts[i];
    const next = verts[(i + 1) % verts.length];
    if (Math.abs(current.bulge) < 1e-10) {
      ctx.lineTo(next.x, next.y);
    } else {
      drawBulgeArc(ctx, current.x, current.y, next.x, next.y, current.bulge);
    }
  }
}
function appendPolylinePath(ctx, entity) {
  const verts = entity.vertices;
  if (verts.length < 2) return;
  ctx.moveTo(verts[0].x, verts[0].y);
  const count = entity.closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i++) {
    const current = verts[i];
    const next = verts[(i + 1) % verts.length];
    const bulge = current.bulge ?? 0;
    if (Math.abs(bulge) < 1e-10) {
      ctx.lineTo(next.x, next.y);
    } else {
      drawBulgeArc(ctx, current.x, current.y, next.x, next.y, bulge);
    }
  }
}
function appendEllipsePath(ctx, entity) {
  const majorLength = Math.sqrt(
    entity.majorAxis.x ** 2 + entity.majorAxis.y ** 2 + entity.majorAxis.z ** 2
  );
  if (majorLength < 1e-10 || entity.minorRatio <= 0) return;
  const minorLength = majorLength * entity.minorRatio;
  const rotation = Math.atan2(entity.majorAxis.y, entity.majorAxis.x);
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const cosS = Math.cos(entity.startParam);
  const sinS = Math.sin(entity.startParam);
  ctx.moveTo(
    entity.center.x + majorLength * cosR * cosS - minorLength * sinR * sinS,
    entity.center.y + majorLength * sinR * cosS + minorLength * cosR * sinS
  );
  ctx.ellipse(
    entity.center.x,
    entity.center.y,
    majorLength,
    minorLength,
    rotation,
    entity.startParam,
    entity.endParam,
    false
  );
}
function appendSplinePath(ctx, entity, pixelSize) {
  const points = evaluateSpline(entity, pixelSize);
  if (points.length < 2) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (entity.flags & 1) {
    ctx.closePath();
  }
}
function appendStrokePath(ctx, entity, pixelSize) {
  switch (entity.type) {
    case "LINE":
      appendLinePath(ctx, entity);
      break;
    case "ARC":
      appendArcPath(ctx, entity);
      break;
    case "CIRCLE":
      appendCirclePath(ctx, entity);
      break;
    case "LWPOLYLINE":
      appendLwPolylinePath(ctx, entity);
      break;
    case "POLYLINE":
      appendPolylinePath(ctx, entity);
      break;
    case "ELLIPSE":
      appendEllipsePath(ctx, entity);
      break;
    case "SPLINE":
      appendSplinePath(ctx, entity, pixelSize);
      break;
  }
}

// src/renderer/entities/draw-insert.ts
var MAX_INSERT_DEPTH = 100;
var MIN_BLOCK_ENTITY_EXTENT = 0.5;
function drawInsert(ctx, entity, doc, vt, theme, pixelSize, depth = 0, stats) {
  if (depth > MAX_INSERT_DEPTH) return;
  const block = doc.blocks.get(entity.blockName);
  if (!block) return;
  const cols = Math.max(1, entity.columnCount);
  const rows = Math.max(1, entity.rowCount);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.save();
      const ox = entity.insertionPoint.x + col * entity.columnSpacing;
      const oy = entity.insertionPoint.y + row * entity.rowSpacing;
      ctx.translate(ox, oy);
      if (entity.rotation) {
        ctx.rotate(entity.rotation * Math.PI / 180);
      }
      ctx.scale(entity.scaleX, entity.scaleY);
      ctx.translate(-block.basePoint.x, -block.basePoint.y);
      const scaleCompensation = Math.max(Math.abs(entity.scaleX), Math.abs(entity.scaleY));
      const adjustedPixelSize = pixelSize / (scaleCompensation || 1);
      let batchColor = null;
      const blockEntities = block.entities;
      for (let ei = 0; ei < blockEntities.length; ei++) {
        const blockEntity = blockEntities[ei];
        if (blockEntity.type !== "INSERT") {
          const cached = getBlockEntityBBox(entity.blockName, ei);
          const beBBox = cached !== void 0 ? cached : computeEntityBBox(blockEntity);
          if (beBBox) {
            const extent = Math.max(beBBox.maxX - beBBox.minX, beBBox.maxY - beBBox.minY);
            if (extent > 0 && extent / adjustedPixelSize < MIN_BLOCK_ENTITY_EXTENT) {
              continue;
            }
          }
        }
        const color = resolveEntityColor(blockEntity, doc.layers, theme);
        if (blockEntity.type !== "INSERT" && isBatchableStroke(blockEntity.type)) {
          if (color !== batchColor) {
            if (batchColor !== null) {
              ctx.stroke();
              if (stats) stats.drawCalls++;
            }
            batchColor = color;
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = adjustedPixelSize;
          }
          appendStrokePath(ctx, blockEntity, adjustedPixelSize);
          if (stats) {
            stats.byType[blockEntity.type] = (stats.byType[blockEntity.type] ?? 0) + 1;
          }
        } else {
          if (batchColor !== null) {
            ctx.stroke();
            if (stats) stats.drawCalls++;
            batchColor = null;
          }
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = adjustedPixelSize;
          if (blockEntity.type === "INSERT") {
            drawInsert(ctx, blockEntity, doc, vt, theme, adjustedPixelSize, depth + 1, stats);
          } else {
            drawEntity(ctx, blockEntity, doc, vt, theme, adjustedPixelSize, stats);
          }
        }
      }
      if (batchColor !== null) {
        ctx.stroke();
        if (stats) stats.drawCalls++;
      }
      ctx.restore();
    }
  }
}

// src/renderer/entities/draw-dimension.ts
function drawDimension(ctx, entity, doc, vt, theme, pixelSize, stats) {
  if (entity.blockName) {
    const block = doc.blocks.get(entity.blockName);
    if (block) {
      for (const blockEntity of block.entities) {
        const color = resolveEntityColor(blockEntity, doc.layers, theme);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = pixelSize;
        drawEntity(ctx, blockEntity, doc, vt, theme, pixelSize, stats);
      }
      return;
    }
  }
  if (entity.defPoint2 && entity.defPoint3) {
    ctx.beginPath();
    ctx.moveTo(entity.defPoint2.x, entity.defPoint2.y);
    ctx.lineTo(entity.defPoint.x, entity.defPoint.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(entity.defPoint3.x, entity.defPoint3.y);
    ctx.lineTo(entity.defPoint.x, entity.defPoint.y);
    ctx.stroke();
  }
}

// src/renderer/entities/draw-hatch.ts
function drawHatch(ctx, entity) {
  if (entity.boundaryPaths.length === 0) return;
  ctx.beginPath();
  for (const path of entity.boundaryPaths) {
    if (path.type === "polyline" && path.vertices && path.vertices.length > 0) {
      const firstVert = path.vertices[0];
      ctx.moveTo(firstVert.x, firstVert.y);
      for (let i = 1; i < path.vertices.length; i++) {
        const prev = path.vertices[i - 1];
        const curr = path.vertices[i];
        const bulge = path.bulges?.[i - 1] ?? 0;
        if (Math.abs(bulge) < 1e-10) {
          ctx.lineTo(curr.x, curr.y);
        } else {
          drawBulgeArc(ctx, prev.x, prev.y, curr.x, curr.y, bulge);
        }
      }
      if (path.isClosed) ctx.closePath();
    } else if (path.type === "edges" && path.edges) {
      for (let i = 0; i < path.edges.length; i++) {
        const edge = path.edges[i];
        if (edge.type === "line") {
          if (i === 0) ctx.moveTo(edge.start.x, edge.start.y);
          ctx.lineTo(edge.end.x, edge.end.y);
        } else if (edge.type === "arc") {
          if (i === 0) {
            const sx = edge.center.x + edge.radius * Math.cos(edge.startAngle * Math.PI / 180);
            const sy = edge.center.y + edge.radius * Math.sin(edge.startAngle * Math.PI / 180);
            ctx.moveTo(sx, sy);
          }
          ctx.arc(
            edge.center.x,
            edge.center.y,
            edge.radius,
            edge.startAngle * Math.PI / 180,
            edge.endAngle * Math.PI / 180,
            !edge.ccw
          );
        }
      }
    }
  }
  if (entity.solidFill) {
    ctx.globalAlpha = 0.3;
    ctx.fill("evenodd");
    ctx.globalAlpha = 1;
  }
  ctx.stroke();
}

// src/renderer/entities/draw-point.ts
function drawPoint(ctx, entity, pixelSize) {
  const size = pixelSize * 3;
  ctx.beginPath();
  ctx.arc(entity.position.x, entity.position.y, size, 0, Math.PI * 2);
  ctx.fill();
}

// src/renderer/entities/draw-entity.ts
function drawEntity(ctx, entity, doc, vt, theme, pixelSize, stats) {
  if (stats) {
    stats.drawCalls++;
    stats.byType[entity.type] = (stats.byType[entity.type] ?? 0) + 1;
  }
  switch (entity.type) {
    case "LINE":
      drawLine(ctx, entity);
      break;
    case "CIRCLE":
      drawCircle(ctx, entity);
      break;
    case "ARC":
      drawArc(ctx, entity);
      break;
    case "LWPOLYLINE":
      drawLwPolyline(ctx, entity);
      break;
    case "POLYLINE":
      drawPolyline(ctx, entity);
      break;
    case "ELLIPSE":
      drawEllipse(ctx, entity);
      break;
    case "SPLINE":
      drawSpline(ctx, entity, pixelSize);
      break;
    case "TEXT":
      drawText(ctx, entity, pixelSize);
      break;
    case "MTEXT":
      drawMText(ctx, entity, pixelSize);
      break;
    case "INSERT":
      drawInsert(ctx, entity, doc, vt, theme, pixelSize, 0, stats);
      break;
    case "DIMENSION":
      drawDimension(ctx, entity, doc, vt, theme, pixelSize, stats);
      break;
    case "HATCH":
      drawHatch(ctx, entity);
      break;
    case "POINT":
      drawPoint(ctx, entity, pixelSize);
      break;
  }
}

// src/renderer/canvas-renderer.ts
var MIN_SCREEN_EXTENT = 0.5;
var CanvasRenderer = class {
  constructor(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error(
        "Failed to get 2D rendering context. The canvas may already have a different context type, or canvas rendering is not available in this environment."
      );
    }
    this.ctx = ctx;
    this.updateSize();
  }
  ctx;
  width = 0;
  height = 0;
  getContext() {
    return this.ctx;
  }
  getWidth() {
    return this.width;
  }
  getHeight() {
    return this.height;
  }
  updateSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
  }
  render(doc, vt, theme, visibleLayers, selectedEntityIndex, visibleEntityIndices, entityBBoxes) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const stats = {
      entitiesDrawn: 0,
      entitiesSkipped: 0,
      drawCalls: 0,
      byType: {}
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = THEMES[theme].backgroundColor;
    ctx.fillRect(0, 0, this.width, this.height);
    applyTransform(ctx, vt);
    const pixelSize = 1 / vt.scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let batchColor = null;
    for (let i = 0; i < doc.entities.length; i++) {
      const entity = doc.entities[i];
      if (!entity.visible) {
        stats.entitiesSkipped++;
        continue;
      }
      if (!visibleLayers.has(entity.layer)) {
        stats.entitiesSkipped++;
        continue;
      }
      if (visibleEntityIndices && !visibleEntityIndices.has(i)) {
        stats.entitiesSkipped++;
        continue;
      }
      if (entityBBoxes) {
        const bbox = entityBBoxes[i];
        if (bbox) {
          const screenW = (bbox.maxX - bbox.minX) * vt.scale;
          const screenH = (bbox.maxY - bbox.minY) * vt.scale;
          if (Math.max(screenW, screenH) < MIN_SCREEN_EXTENT) {
            stats.entitiesSkipped++;
            continue;
          }
        }
      }
      const color = resolveEntityColor(entity, doc.layers, theme);
      if (isBatchableStroke(entity.type)) {
        if (color !== batchColor) {
          if (batchColor !== null) {
            ctx.stroke();
            stats.drawCalls++;
          }
          batchColor = color;
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = pixelSize;
        }
        appendStrokePath(ctx, entity, pixelSize);
        stats.entitiesDrawn++;
        stats.byType[entity.type] = (stats.byType[entity.type] ?? 0) + 1;
      } else {
        if (batchColor !== null) {
          ctx.stroke();
          stats.drawCalls++;
          batchColor = null;
        }
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = pixelSize;
        stats.entitiesDrawn++;
        drawEntity(ctx, entity, doc, vt, theme, pixelSize, stats);
      }
    }
    if (batchColor !== null) {
      ctx.stroke();
      stats.drawCalls++;
    }
    if (selectedEntityIndex >= 0 && selectedEntityIndex < doc.entities.length) {
      const selEntity = doc.entities[selectedEntityIndex];
      applyTransform(ctx, vt);
      ctx.strokeStyle = THEMES[theme].selectionColor;
      ctx.fillStyle = THEMES[theme].selectionColor;
      ctx.lineWidth = pixelSize * 3;
      drawEntity(ctx, selEntity, doc, vt, theme, pixelSize);
    }
    return stats;
  }
  renderEmpty(theme) {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = THEMES[theme].backgroundColor;
    ctx.fillRect(0, 0, this.width, this.height);
  }
  destroy() {
  }
};

// src/renderer/debug-overlay.ts
var DEFAULT_DEBUG_OPTIONS = {
  showFps: true,
  showRenderStats: true,
  showDocumentInfo: true,
  showTimings: true,
  showCamera: true,
  position: "top-left"
};
function resolveDebugOptions(input) {
  return { ...DEFAULT_DEBUG_OPTIONS, ...input };
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatZoom(scale) {
  if (scale >= 1) return `${scale.toFixed(2)}x`;
  return `1:${(1 / scale).toFixed(1)}`;
}
var FONT = "11px monospace";
var LINE_HEIGHT = 15;
var SEPARATOR_HEIGHT = 8;
var PADDING = 8;
var MARGIN = 10;
function renderDebugOverlay(ctx, stats, theme, options, canvasWidth, canvasHeight) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sections = [];
  if (options.showFps) {
    sections.push([
      `FPS: ${stats.fps}  Frame: ${stats.frameTime.toFixed(1)}ms`
    ]);
  }
  if (options.showRenderStats) {
    const total = stats.renderStats.entitiesDrawn + stats.renderStats.entitiesSkipped;
    const lines = [
      `Drawn: ${stats.renderStats.entitiesDrawn} / ${total}  Calls: ${stats.renderStats.drawCalls}`
    ];
    const types = Object.entries(stats.renderStats.byType).sort(([, a], [, b]) => b - a).slice(0, 6).map(([type, count]) => `${type}: ${count}`).join("  ");
    if (types) lines.push(types);
    sections.push(lines);
  }
  if (options.showDocumentInfo) {
    const lines = [
      `Layers: ${stats.visibleLayerCount} / ${stats.layerCount}  Blocks: ${stats.blockCount}`
    ];
    if (stats.dxfVersion) lines.push(`DXF: ${stats.dxfVersion}`);
    if (stats.fileName) lines.push(`File: ${stats.fileName}`);
    if (stats.fileSize > 0) lines.push(`Size: ${formatBytes(stats.fileSize)}`);
    sections.push(lines);
  }
  if (options.showTimings) {
    const parts = [];
    if (stats.parseTime > 0) parts.push(`Parse: ${stats.parseTime.toFixed(0)}ms`);
    if (stats.spatialIndexBuildTime > 0) parts.push(`Index: ${stats.spatialIndexBuildTime.toFixed(0)}ms`);
    if (stats.totalLoadTime > 0) parts.push(`Load: ${stats.totalLoadTime.toFixed(0)}ms`);
    if (parts.length > 0) {
      sections.push([parts.join("  ")]);
    }
  }
  if (options.showCamera) {
    const b = stats.viewportBounds;
    sections.push([
      `Zoom: ${formatZoom(stats.zoom)}  Pixel: ${stats.pixelSize.toFixed(2)}`,
      `View: [${b.minX.toFixed(0)}, ${b.minY.toFixed(0)}] \u2192 [${b.maxX.toFixed(0)}, ${b.maxY.toFixed(0)}]`
    ]);
  }
  if (sections.length === 0) return;
  ctx.font = FONT;
  const rows = [];
  for (let s = 0; s < sections.length; s++) {
    if (s > 0) rows.push({ text: "", isSeparator: true });
    for (const line of sections[s]) {
      rows.push({ text: line, isSeparator: false });
    }
  }
  let maxWidth = 0;
  for (const row of rows) {
    if (!row.isSeparator) {
      const w = ctx.measureText(row.text).width;
      if (w > maxWidth) maxWidth = w;
    }
  }
  const panelWidth = maxWidth + PADDING * 2;
  let panelHeight = PADDING * 2;
  for (const row of rows) {
    panelHeight += row.isSeparator ? SEPARATOR_HEIGHT : LINE_HEIGHT;
  }
  let x;
  let y;
  switch (options.position) {
    case "top-left":
      x = MARGIN;
      y = MARGIN;
      break;
    case "top-right":
      x = canvasWidth - panelWidth - MARGIN;
      y = MARGIN;
      break;
    case "bottom-left":
      x = MARGIN;
      y = canvasHeight - panelHeight - MARGIN;
      break;
    case "bottom-right":
      x = canvasWidth - panelWidth - MARGIN;
      y = canvasHeight - panelHeight - MARGIN;
      break;
  }
  const config = THEMES[theme];
  ctx.fillStyle = theme === "dark" ? "rgba(0, 0, 0, 0.75)" : "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(x, y, panelWidth, panelHeight);
  ctx.strokeStyle = theme === "dark" ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, panelWidth - 1, panelHeight - 1);
  ctx.fillStyle = theme === "dark" ? config.defaultEntityColor : "rgba(0, 0, 0, 0.85)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let cursorY = y + PADDING;
  for (const row of rows) {
    if (row.isSeparator) {
      cursorY += SEPARATOR_HEIGHT;
    } else {
      ctx.fillText(row.text, x + PADDING, cursorY);
      cursorY += LINE_HEIGHT;
    }
  }
}

// src/viewer/layers.ts
var LayerManager = class {
  layers = /* @__PURE__ */ new Map();
  visibility = /* @__PURE__ */ new Map();
  colorOverrides = /* @__PURE__ */ new Map();
  visibleCache = null;
  setLayers(layers) {
    this.layers = new Map(layers);
    this.visibility.clear();
    this.colorOverrides.clear();
    this.visibleCache = null;
    for (const [name, layer] of this.layers) {
      this.visibility.set(name, !layer.isOff && !layer.isFrozen);
    }
  }
  getAllLayers() {
    return Array.from(this.layers.values());
  }
  setVisible(name, visible) {
    this.visibility.set(name, visible);
    this.visibleCache = null;
  }
  isVisible(name) {
    return this.visibility.get(name) ?? true;
  }
  setColorOverride(name, color) {
    this.colorOverrides.set(name, color);
  }
  getColorOverride(name) {
    return this.colorOverrides.get(name);
  }
  getVisibleLayerNames() {
    if (this.visibleCache) return this.visibleCache;
    const visible = /* @__PURE__ */ new Set();
    for (const [name, isVisible] of this.visibility) {
      if (isVisible) visible.add(name);
    }
    this.visibleCache = visible;
    return visible;
  }
  clear() {
    this.layers.clear();
    this.visibility.clear();
    this.colorOverrides.clear();
    this.visibleCache = null;
  }
};

// src/viewer/events.ts
var EventEmitter = class {
  listeners = /* @__PURE__ */ new Map();
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, /* @__PURE__ */ new Set());
    }
    this.listeners.get(event).add(callback);
  }
  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }
  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        cb(data);
      }
    }
  }
  removeAllListeners() {
    this.listeners.clear();
  }
};

// src/viewer/input-handler.ts
var InputHandler = class {
  constructor(canvas, viewer) {
    this.canvas = canvas;
    this.viewer = viewer;
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onWheel = this.handleWheel.bind(this);
    this.onTouchStart = this.handleTouchStart.bind(this);
    this.onTouchMove = this.handleTouchMove.bind(this);
    this.onTouchEnd = this.handleTouchEnd.bind(this);
    this.onContextMenu = (e) => e.preventDefault();
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.onTouchEnd);
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }
  isPanning = false;
  lastX = 0;
  lastY = 0;
  touches = /* @__PURE__ */ new Map();
  // Bound event handlers (for cleanup)
  onPointerDown;
  onPointerMove;
  onPointerUp;
  onWheel;
  onTouchStart;
  onTouchMove;
  onTouchEnd;
  onContextMenu;
  destroy() {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
  }
  // --- Pointer Events (Mouse) ---
  handlePointerDown(e) {
    const tool = this.viewer.getTool();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (e.button === 0 && tool === "pan") {
      this.startPan(e, x, y);
    } else if (e.button === 1) {
      this.startPan(e, x, y);
    } else if (e.button === 0 && (tool === "select" || tool === "measure")) {
      this.viewer.handleClick(x, y);
    }
  }
  startPan(e, x, y) {
    this.isPanning = true;
    this.lastX = x;
    this.lastY = y;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = "grabbing";
  }
  handlePointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (this.isPanning) {
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      this.lastX = x;
      this.lastY = y;
      this.viewer.handlePan(dx, dy);
    } else {
      this.viewer.handleMouseMove(x, y);
    }
  }
  handlePointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.releasePointerCapture(e.pointerId);
      this.canvas.style.cursor = this.viewer.getTool() === "pan" ? "grab" : "crosshair";
    }
  }
  // --- Wheel (Zoom) ---
  handleWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const delta = -Math.sign(e.deltaY);
    const speed = this.viewer.getZoomSpeed();
    const factor = delta > 0 ? speed : 1 / speed;
    this.viewer.handleZoom(x, y, factor);
  }
  // --- Touch Events (Pinch-to-Zoom) ---
  handleTouchStart(e) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }
  handleTouchMove(e) {
    e.preventDefault();
    if (this.touches.size === 2 && e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const prev = Array.from(this.touches.values());
      const prevDist = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y);
      const currDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      if (prevDist > 0) {
        const zoomFactor = currDist / prevDist;
        const rect = this.canvas.getBoundingClientRect();
        const prevCenterX = (prev[0].x + prev[1].x) / 2 - rect.left;
        const prevCenterY = (prev[0].y + prev[1].y) / 2 - rect.top;
        const currCenterX = (t0.clientX + t1.clientX) / 2 - rect.left;
        const currCenterY = (t0.clientY + t1.clientY) / 2 - rect.top;
        this.viewer.handleZoom(prevCenterX, prevCenterY, zoomFactor);
        this.viewer.handlePan(currCenterX - prevCenterX, currCenterY - prevCenterY);
      }
    } else if (this.touches.size === 1 && e.touches.length === 1) {
      const t = e.touches[0];
      const prev = this.touches.get(t.identifier);
      if (prev) {
        this.viewer.handlePan(
          t.clientX - prev.x,
          t.clientY - prev.y
        );
      }
    }
    for (const t of Array.from(e.changedTouches)) {
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
  }
  handleTouchEnd(e) {
    for (const t of Array.from(e.changedTouches)) {
      this.touches.delete(t.identifier);
    }
  }
};
var HIT_TOLERANCE_PX = 5;
var SpatialIndex = class {
  tree = new RBush();
  items = [];
  /** Pre-computed bboxes parallel to the entity array (null if no bbox). */
  entityBBoxes = [];
  /**
   * Build the spatial index from entities.
   * When `doc` is provided, INSERT entities get proper transformed bounding boxes
   * (resolved from block contents) instead of degenerate zero-size points.
   */
  build(entities, doc) {
    this.items = [];
    this.entityBBoxes = new Array(entities.length).fill(null);
    const cache = doc ? /* @__PURE__ */ new Map() : void 0;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const bbox = doc && cache ? computeEntityBBoxWithDoc(entity, doc, cache) : computeEntityBBox(entity);
      this.entityBBoxes[i] = bbox;
      if (!bbox) continue;
      this.items.push({
        ...bbox,
        entityIndex: i
      });
    }
    this.tree.clear();
    this.tree.load(this.items);
  }
  search(minX, minY, maxX, maxY) {
    return this.tree.search({ minX, minY, maxX, maxY });
  }
  /** Get pre-computed bbox for an entity by index. */
  getEntityBBox(index) {
    return this.entityBBoxes[index] ?? null;
  }
  /** Get the full pre-computed bbox array (parallel to entity array). */
  getEntityBBoxes() {
    return this.entityBBoxes;
  }
  clear() {
    this.tree.clear();
    this.items = [];
    this.entityBBoxes = [];
  }
};
function hitTest(wx, wy, entities, spatialIndex, visibleLayers, scale) {
  const tolerance = HIT_TOLERANCE_PX / scale;
  const candidates = spatialIndex.search(
    wx - tolerance,
    wy - tolerance,
    wx + tolerance,
    wy + tolerance
  );
  let bestDist = tolerance;
  let bestIndex = -1;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const item = candidates[i];
    const entity = entities[item.entityIndex];
    if (!entity) continue;
    if (!visibleLayers.has(entity.layer)) continue;
    if (!entity.visible) continue;
    const dist = distanceToEntity(wx, wy, entity);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = item.entityIndex;
    }
  }
  return bestIndex;
}
function distanceToEntity(wx, wy, entity) {
  switch (entity.type) {
    case "LINE":
      return distPointToSegment(wx, wy, entity.start.x, entity.start.y, entity.end.x, entity.end.y);
    case "CIRCLE":
      return distPointToCircle(wx, wy, entity.center.x, entity.center.y, entity.radius);
    case "ARC":
      return distPointToArc(
        wx,
        wy,
        entity.center.x,
        entity.center.y,
        entity.radius,
        entity.startAngle * Math.PI / 180,
        entity.endAngle * Math.PI / 180
      );
    case "LWPOLYLINE":
    case "POLYLINE": {
      let minDist = Infinity;
      const verts = entity.vertices;
      const count = entity.closed ? verts.length : verts.length - 1;
      for (let i = 0; i < count; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        const d = distPointToSegment(wx, wy, a.x, a.y, b.x, b.y);
        minDist = Math.min(minDist, d);
      }
      return minDist;
    }
    case "ELLIPSE":
      return distPointToEllipse(
        wx,
        wy,
        entity.center.x,
        entity.center.y,
        entity.majorAxis,
        entity.minorRatio
      );
    case "TEXT":
    case "MTEXT": {
      const bbox = computeEntityBBox(entity);
      if (!bbox) return Infinity;
      return distPointToRect(wx, wy, bbox.minX, bbox.minY, bbox.maxX, bbox.maxY);
    }
    case "POINT":
      return Math.hypot(wx - entity.position.x, wy - entity.position.y);
    case "SPLINE": {
      let minDist = Infinity;
      const pts = entity.controlPoints;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distPointToSegment(wx, wy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        minDist = Math.min(minDist, d);
      }
      return minDist;
    }
    default:
      return Infinity;
  }
}
function distPointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}
function distPointToCircle(px, py, cx, cy, radius) {
  return Math.abs(Math.hypot(px - cx, py - cy) - radius);
}
function distPointToArc(px, py, cx, cy, radius, startAngle, endAngle) {
  const angle = Math.atan2(py - cy, px - cx);
  const normAngle = (angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const normStart = (startAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const normEnd = (endAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const inArc = normStart <= normEnd ? normAngle >= normStart && normAngle <= normEnd : normAngle >= normStart || normAngle <= normEnd;
  if (inArc) {
    return Math.abs(Math.hypot(px - cx, py - cy) - radius);
  }
  const d1 = Math.hypot(
    px - (cx + radius * Math.cos(startAngle)),
    py - (cy + radius * Math.sin(startAngle))
  );
  const d2 = Math.hypot(
    px - (cx + radius * Math.cos(endAngle)),
    py - (cy + radius * Math.sin(endAngle))
  );
  return Math.min(d1, d2);
}
function distPointToRect(px, py, minX, minY, maxX, maxY) {
  if (px >= minX && px <= maxX && py >= minY && py <= maxY) return 0;
  const dx = Math.max(minX - px, 0, px - maxX);
  const dy = Math.max(minY - py, 0, py - maxY);
  return Math.hypot(dx, dy);
}
function distPointToEllipse(px, py, cx, cy, majorAxis, minorRatio) {
  const rotation = Math.atan2(majorAxis.y, majorAxis.x);
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const localX = (px - cx) * cos - (py - cy) * sin;
  const localY = (px - cx) * sin + (py - cy) * cos;
  const a = Math.sqrt(majorAxis.x ** 2 + majorAxis.y ** 2);
  const b = a * minorRatio;
  if (a < 1e-10) return Math.hypot(px - cx, py - cy);
  const scaledY = localY * (a / b);
  const dist = Math.hypot(localX, scaledY);
  if (dist < 1e-10) return a;
  const onEllipseX = localX / dist * a;
  const onEllipseY = localY / dist * b;
  return Math.hypot(localX - onEllipseX, localY - onEllipseY);
}

// src/viewer/measure.ts
var MeasureTool = class {
  state = { phase: "idle" };
  currentSnap = null;
  activate() {
    this.state = { phase: "first-point" };
    this.currentSnap = null;
  }
  deactivate() {
    this.state = { phase: "idle" };
    this.currentSnap = null;
  }
  handleClick(wx, wy, snap) {
    const point = snap ? snap.point : { x: wx, y: wy };
    switch (this.state.phase) {
      case "first-point":
        this.state = {
          phase: "second-point",
          firstPoint: point,
          firstSnap: snap ?? void 0
        };
        return null;
      case "second-point": {
        const p1 = this.state.firstPoint;
        const p2 = point;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        this.state = { phase: "done", firstPoint: p1, secondPoint: p2, distance, angle };
        return {
          distance,
          angle,
          deltaX: dx,
          deltaY: dy,
          points: [p1, p2]
        };
      }
      case "done":
        this.state = { phase: "second-point", firstPoint: point };
        return null;
      default:
        return null;
    }
  }
  handleMove(snap) {
    this.currentSnap = snap;
  }
};
function findSnaps(wx, wy, entities, spatialIndex, scale, snapTypes = /* @__PURE__ */ new Set(["endpoint", "midpoint", "center"])) {
  const tolerance = 10 / scale;
  const results = [];
  const candidates = spatialIndex.search(
    wx - tolerance,
    wy - tolerance,
    wx + tolerance,
    wy + tolerance
  );
  for (const item of candidates) {
    const entity = entities[item.entityIndex];
    if (!entity) continue;
    const idx = item.entityIndex;
    switch (entity.type) {
      case "LINE": {
        if (snapTypes.has("endpoint")) {
          addIfClose(results, entity.start.x, entity.start.y, "endpoint", idx, wx, wy, tolerance);
          addIfClose(results, entity.end.x, entity.end.y, "endpoint", idx, wx, wy, tolerance);
        }
        if (snapTypes.has("midpoint")) {
          const mx = (entity.start.x + entity.end.x) / 2;
          const my = (entity.start.y + entity.end.y) / 2;
          addIfClose(results, mx, my, "midpoint", idx, wx, wy, tolerance);
        }
        break;
      }
      case "CIRCLE": {
        if (snapTypes.has("center")) {
          addIfClose(results, entity.center.x, entity.center.y, "center", idx, wx, wy, tolerance);
        }
        if (snapTypes.has("endpoint")) {
          for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
            const qx = entity.center.x + entity.radius * Math.cos(angle);
            const qy = entity.center.y + entity.radius * Math.sin(angle);
            addIfClose(results, qx, qy, "endpoint", idx, wx, wy, tolerance);
          }
        }
        break;
      }
      case "ARC": {
        if (snapTypes.has("center")) {
          addIfClose(results, entity.center.x, entity.center.y, "center", idx, wx, wy, tolerance);
        }
        if (snapTypes.has("endpoint")) {
          const startRad = entity.startAngle * Math.PI / 180;
          const endRad = entity.endAngle * Math.PI / 180;
          addIfClose(results, entity.center.x + entity.radius * Math.cos(startRad), entity.center.y + entity.radius * Math.sin(startRad), "endpoint", idx, wx, wy, tolerance);
          addIfClose(results, entity.center.x + entity.radius * Math.cos(endRad), entity.center.y + entity.radius * Math.sin(endRad), "endpoint", idx, wx, wy, tolerance);
        }
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (snapTypes.has("endpoint")) {
          for (const v of entity.vertices) {
            addIfClose(results, v.x, v.y, "endpoint", idx, wx, wy, tolerance);
          }
        }
        if (snapTypes.has("midpoint")) {
          for (let i = 0; i < entity.vertices.length - 1; i++) {
            const a = entity.vertices[i];
            const b = entity.vertices[i + 1];
            addIfClose(results, (a.x + b.x) / 2, (a.y + b.y) / 2, "midpoint", idx, wx, wy, tolerance);
          }
        }
        break;
      }
      case "ELLIPSE": {
        if (snapTypes.has("center")) {
          addIfClose(results, entity.center.x, entity.center.y, "center", idx, wx, wy, tolerance);
        }
        break;
      }
      case "TEXT": {
        if (snapTypes.has("endpoint")) {
          addIfClose(results, entity.insertionPoint.x, entity.insertionPoint.y, "endpoint", idx, wx, wy, tolerance);
        }
        break;
      }
      case "MTEXT": {
        if (snapTypes.has("endpoint")) {
          addIfClose(results, entity.insertionPoint.x, entity.insertionPoint.y, "endpoint", idx, wx, wy, tolerance);
        }
        break;
      }
    }
  }
  results.sort(
    (a, b) => Math.hypot(a.point.x - wx, a.point.y - wy) - Math.hypot(b.point.x - wx, b.point.y - wy)
  );
  return results;
}
function addIfClose(results, x, y, type, entityIndex, wx, wy, tolerance) {
  if (Math.hypot(x - wx, y - wy) <= tolerance) {
    results.push({ point: { x, y }, type, entityIndex });
  }
}
function renderMeasureOverlay(ctx, vt, measureTool, mouseScreenX, mouseScreenY, theme) {
  const config = THEMES[theme];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const state = measureTool.state;
  if (measureTool.currentSnap) {
    const [sx, sy] = worldToScreen(vt, measureTool.currentSnap.point.x, measureTool.currentSnap.point.y);
    drawSnapIndicator(ctx, sx, sy, measureTool.currentSnap.type, config.measureColor);
  }
  if (state.phase === "second-point") {
    const [sx1, sy1] = worldToScreen(vt, state.firstPoint.x, state.firstPoint.y);
    let targetX;
    let targetY;
    if (measureTool.currentSnap) {
      const [snapSx, snapSy] = worldToScreen(vt, measureTool.currentSnap.point.x, measureTool.currentSnap.point.y);
      targetX = snapSx;
      targetY = snapSy;
    } else {
      targetX = mouseScreenX;
      targetY = mouseScreenY;
    }
    ctx.strokeStyle = config.measureColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    drawEndpointMarker(ctx, sx1, sy1, config.measureColor);
    drawEndpointMarker(ctx, targetX, targetY, config.measureColor);
    let twx;
    let twy;
    if (measureTool.currentSnap) {
      twx = measureTool.currentSnap.point.x;
      twy = measureTool.currentSnap.point.y;
    } else {
      [twx, twy] = screenToWorld(vt, mouseScreenX, mouseScreenY);
    }
    const dist = Math.hypot(twx - state.firstPoint.x, twy - state.firstPoint.y);
    drawMeasureLabel(ctx, (sx1 + targetX) / 2, (sy1 + targetY) / 2, dist, theme);
  }
  if (state.phase === "done") {
    const [sx1, sy1] = worldToScreen(vt, state.firstPoint.x, state.firstPoint.y);
    const [sx2, sy2] = worldToScreen(vt, state.secondPoint.x, state.secondPoint.y);
    ctx.strokeStyle = config.measureColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
    drawEndpointMarker(ctx, sx1, sy1, config.measureColor);
    drawEndpointMarker(ctx, sx2, sy2, config.measureColor);
    drawMeasureLabel(ctx, (sx1 + sx2) / 2, (sy1 + sy2) / 2, state.distance, theme);
  }
}
function drawSnapIndicator(ctx, x, y, type, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const size = 8;
  switch (type) {
    case "endpoint":
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
      break;
    case "midpoint":
      ctx.beginPath();
      ctx.moveTo(x, y - size / 2);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.lineTo(x - size / 2, y + size / 2);
      ctx.closePath();
      ctx.stroke();
      break;
    case "center":
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "nearest":
      ctx.beginPath();
      ctx.moveTo(x - size / 2, y - size / 2);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.moveTo(x + size / 2, y - size / 2);
      ctx.lineTo(x - size / 2, y + size / 2);
      ctx.stroke();
      break;
  }
}
function drawEndpointMarker(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}
function drawMeasureLabel(ctx, x, y, distance, theme) {
  const label = distance.toFixed(4);
  ctx.font = "13px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const metrics = ctx.measureText(label);
  const pad = 4;
  const bgX = x - metrics.width / 2 - pad;
  const bgY = y - 20;
  const bgW = metrics.width + pad * 2;
  const bgH = 18;
  ctx.fillStyle = theme === "dark" ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)";
  ctx.fillRect(bgX, bgY, bgW, bgH);
  ctx.fillStyle = THEMES[theme].measureColor;
  ctx.fillText(label, x, y - 6);
}

// src/worker/worker-manager.ts
var WorkerManager = class {
  worker = null;
  blobUrl = null;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  /**
   * Lazily create the Worker from the inlined code.
   * Safe to call after `terminate()` or `onerror` — recreates automatically.
   */
  getWorker() {
    if (this.worker) return this.worker;
    this.blobUrl = URL.createObjectURL(
      new Blob(['"use strict";(()=>{function h(a){let e=a.replace(/\\r\\n?/g,`\n`),t=[],r=e.length,n=0;for(;n<r;){for(;n<r&&e.charCodeAt(n)===10;)n++;if(n>=r)break;let o=e.indexOf(`\n`,n);o===-1&&(o=r);let c=e.substring(n,o).trim();n=o+1;let s=parseInt(c,10);if(isNaN(s)){n<r&&(o=e.indexOf(`\n`,n),o===-1&&(o=r),n=o+1);continue}if(n>=r)break;o=e.indexOf(`\n`,n),o===-1&&(o=r);let p=e.substring(n,o).replace(/\\s+$/,"");n=o+1,t.push({code:s,value:p})}return t}function m(a,e,t){for(;e<a.length;){let r=a[e];if(r.code===0&&r.value==="ENDSEC")return e+1;if(r.code===9){let n=r.value;switch(e++,n){case"$ACADVER":e<a.length&&(t.acadVersion=a[e].value,e++);break;case"$EXTMIN":if(e<a.length){let o=v(a,e);t.extMin=o.point,e=o.nextIndex}break;case"$EXTMAX":if(e<a.length){let o=v(a,e);t.extMax=o.point,e=o.nextIndex}break;case"$INSUNITS":e<a.length&&(t.insUnits=parseInt(a[e].value,10),e++);break;case"$MEASUREMENT":e<a.length&&(t.measurement=parseInt(a[e].value,10),e++);break;case"$LTSCALE":e<a.length&&(t.ltScale=parseFloat(a[e].value),e++);break;case"$DWGCODEPAGE":e<a.length&&(t.dwgCodePage=a[e].value,e++);break;case"$HANDSEED":e<a.length&&(t.handleSeed=a[e].value,e++);break;default:for(;e<a.length&&a[e].code!==9&&a[e].code!==0;)t[n]=a[e].value,e++}}else e++}return e}function v(a,e){let t={x:0,y:0,z:0};for(;e<a.length;){let r=a[e].code;if(r===10)t.x=parseFloat(a[e].value),e++;else if(r===20)t.y=parseFloat(a[e].value),e++;else if(r===30)t.z=parseFloat(a[e].value),e++;else break}return{point:t,nextIndex:e}}function k(a,e,t){for(;e<a.length;){let r=a[e];if(r.code===0&&r.value==="ENDSEC")return e+1;if(r.code===0&&r.value==="TABLE"){if(e++,e>=a.length)break;let n=a[e].value;switch(e++,n){case"LAYER":e=H(a,e,t.layers);break;case"LTYPE":e=O(a,e,t.lineTypes);break;case"STYLE":e=_(a,e,t.styles);break;default:e=R(a,e);break}}else e++}return e}function R(a,e){for(;e<a.length;){if(a[e].code===0&&a[e].value==="ENDTAB")return e+1;e++}return e}function H(a,e,t){for(;e<a.length;){let r=a[e];if(r.code===0&&r.value==="ENDTAB")return e+1;if(r.code===0&&r.value==="LAYER"){e++;let n={name:"0",color:7,lineType:"Continuous",flags:0,lineWeight:-3,isOff:!1,isFrozen:!1,isLocked:!1};for(;e<a.length&&a[e].code!==0;){let o=a[e];switch(o.code){case 2:n.name=o.value;break;case 6:n.lineType=o.value;break;case 62:n.color=parseInt(o.value,10);break;case 70:n.flags=parseInt(o.value,10);break;case 370:n.lineWeight=parseInt(o.value,10);break;case 420:n.trueColor=parseInt(o.value,10);break}e++}t.set(n.name,n)}else e++}return e}function O(a,e,t){for(;e<a.length;){let r=a[e];if(r.code===0&&r.value==="ENDTAB")return e+1;if(r.code===0&&r.value==="LTYPE"){e++;let n={name:"",description:"",pattern:[],totalLength:0};for(;e<a.length&&a[e].code!==0;){let o=a[e];switch(o.code){case 2:n.name=o.value;break;case 3:n.description=o.value;break;case 40:n.totalLength=parseFloat(o.value);break;case 49:n.pattern.push(parseFloat(o.value));break}e++}n.name&&t.set(n.name,n)}else e++}return e}function _(a,e,t){for(;e<a.length;){let r=a[e];if(r.code===0&&r.value==="ENDTAB")return e+1;if(r.code===0&&r.value==="STYLE"){e++;let n={name:"",fontName:"",bigFontName:"",height:0,widthFactor:1,obliqueAngle:0};for(;e<a.length&&a[e].code!==0;){let o=a[e];switch(o.code){case 2:n.name=o.value;break;case 3:n.fontName=o.value;break;case 4:n.bigFontName=o.value;break;case 40:n.height=parseFloat(o.value);break;case 41:n.widthFactor=parseFloat(o.value);break;case 50:n.obliqueAngle=parseFloat(o.value);break}e++}n.name&&t.set(n.name,n)}else e++}return e}function l(a){let e={type:"",layer:"0",color:256,lineType:"BYLAYER",lineTypeScale:1,lineWeight:-1,visible:!0,extrusion:{x:0,y:0,z:1}};for(let t of a)switch(t.code){case 5:e.handle=t.value;break;case 8:e.layer=t.value;break;case 6:e.lineType=t.value;break;case 48:e.lineTypeScale=parseFloat(t.value);break;case 60:e.visible=t.value==="0"||t.value==="";break;case 62:e.color=parseInt(t.value,10);break;case 370:e.lineWeight=parseInt(t.value,10);break;case 420:e.trueColor=parseInt(t.value,10);break;case 210:e.extrusion.x=parseFloat(t.value);break;case 220:e.extrusion.y=parseFloat(t.value);break;case 230:e.extrusion.z=parseFloat(t.value);break}return e}function D(a){let t={...l(a),type:"LINE",start:{x:0,y:0,z:0},end:{x:0,y:0,z:0}};for(let r of a)switch(r.code){case 10:t.start.x=parseFloat(r.value);break;case 20:t.start.y=parseFloat(r.value);break;case 30:t.start.z=parseFloat(r.value);break;case 11:t.end.x=parseFloat(r.value);break;case 21:t.end.y=parseFloat(r.value);break;case 31:t.end.z=parseFloat(r.value);break}return t}function F(a){let t={...l(a),type:"CIRCLE",center:{x:0,y:0,z:0},radius:0};for(let r of a)switch(r.code){case 10:t.center.x=parseFloat(r.value);break;case 20:t.center.y=parseFloat(r.value);break;case 30:t.center.z=parseFloat(r.value);break;case 40:t.radius=parseFloat(r.value);break}return t}function E(a){let t={...l(a),type:"ARC",center:{x:0,y:0,z:0},radius:0,startAngle:0,endAngle:360};for(let r of a)switch(r.code){case 10:t.center.x=parseFloat(r.value);break;case 20:t.center.y=parseFloat(r.value);break;case 30:t.center.z=parseFloat(r.value);break;case 40:t.radius=parseFloat(r.value);break;case 50:t.startAngle=parseFloat(r.value);break;case 51:t.endAngle=parseFloat(r.value);break}return t}function P(a){let t={...l(a),type:"LWPOLYLINE",vertices:[],closed:!1,constantWidth:0,elevation:0},r=null;for(let n of a)switch(n.code){case 70:t.closed=(parseInt(n.value,10)&1)!==0;break;case 38:t.elevation=parseFloat(n.value);break;case 43:t.constantWidth=parseFloat(n.value);break;case 10:r&&t.vertices.push(r),r={x:parseFloat(n.value),y:0,bulge:0,startWidth:0,endWidth:0};break;case 20:r&&(r.y=parseFloat(n.value));break;case 40:r&&(r.startWidth=parseFloat(n.value));break;case 41:r&&(r.endWidth=parseFloat(n.value));break;case 42:r&&(r.bulge=parseFloat(n.value));break}return r&&t.vertices.push(r),t}function T(a){let t={...l(a),type:"POLYLINE",vertices:[],closed:!1,is3d:!1};for(let r of a)if(r.code===70){let n=parseInt(r.value,10);t.closed=(n&1)!==0,t.is3d=(n&8)!==0}return t}function w(a){let t={...l(a),type:"ELLIPSE",center:{x:0,y:0,z:0},majorAxis:{x:1,y:0,z:0},minorRatio:1,startParam:0,endParam:Math.PI*2};for(let r of a)switch(r.code){case 10:t.center.x=parseFloat(r.value);break;case 20:t.center.y=parseFloat(r.value);break;case 30:t.center.z=parseFloat(r.value);break;case 11:t.majorAxis.x=parseFloat(r.value);break;case 21:t.majorAxis.y=parseFloat(r.value);break;case 31:t.majorAxis.z=parseFloat(r.value);break;case 40:t.minorRatio=parseFloat(r.value);break;case 41:t.startParam=parseFloat(r.value);break;case 42:t.endParam=parseFloat(r.value);break}return t}function g(a){let t={...l(a),type:"SPLINE",degree:3,flags:0,knots:[],controlPoints:[],fitPoints:[],weights:[]},r=null,n=null;for(let o of a)switch(o.code){case 70:t.flags=parseInt(o.value,10);break;case 71:t.degree=parseInt(o.value,10);break;case 40:t.knots.push(parseFloat(o.value));break;case 41:t.weights.push(parseFloat(o.value));break;case 10:r&&t.controlPoints.push(r),r={x:parseFloat(o.value),y:0,z:0};break;case 20:r&&(r.y=parseFloat(o.value));break;case 30:r&&(r.z=parseFloat(o.value));break;case 11:n&&t.fitPoints.push(n),n={x:parseFloat(o.value),y:0,z:0};break;case 21:n&&(n.y=parseFloat(o.value));break;case 31:n&&(n.z=parseFloat(o.value));break;case 12:t.startTangent||(t.startTangent={x:0,y:0,z:0}),t.startTangent.x=parseFloat(o.value);break;case 22:t.startTangent&&(t.startTangent.y=parseFloat(o.value));break;case 32:t.startTangent&&(t.startTangent.z=parseFloat(o.value));break;case 13:t.endTangent||(t.endTangent={x:0,y:0,z:0}),t.endTangent.x=parseFloat(o.value);break;case 23:t.endTangent&&(t.endTangent.y=parseFloat(o.value));break;case 33:t.endTangent&&(t.endTangent.z=parseFloat(o.value));break}return r&&t.controlPoints.push(r),n&&t.fitPoints.push(n),t}function I(a){let t={...l(a),type:"TEXT",text:"",insertionPoint:{x:0,y:0,z:0},height:1,rotation:0,widthFactor:1,obliqueAngle:0,style:"STANDARD",hAlign:0,vAlign:0,generationFlags:0};for(let r of a)switch(r.code){case 1:t.text=r.value;break;case 10:t.insertionPoint.x=parseFloat(r.value);break;case 20:t.insertionPoint.y=parseFloat(r.value);break;case 30:t.insertionPoint.z=parseFloat(r.value);break;case 11:t.alignmentPoint||(t.alignmentPoint={x:0,y:0,z:0}),t.alignmentPoint.x=parseFloat(r.value);break;case 21:t.alignmentPoint||(t.alignmentPoint={x:0,y:0,z:0}),t.alignmentPoint.y=parseFloat(r.value);break;case 31:t.alignmentPoint||(t.alignmentPoint={x:0,y:0,z:0}),t.alignmentPoint.z=parseFloat(r.value);break;case 40:t.height=parseFloat(r.value);break;case 41:t.widthFactor=parseFloat(r.value);break;case 50:t.rotation=parseFloat(r.value);break;case 51:t.obliqueAngle=parseFloat(r.value);break;case 7:t.style=r.value;break;case 71:t.generationFlags=parseInt(r.value,10);break;case 72:t.hAlign=parseInt(r.value,10);break;case 73:t.vAlign=parseInt(r.value,10);break}return t}function A(a){let t={...l(a),type:"MTEXT",text:"",insertionPoint:{x:0,y:0,z:0},height:1,width:0,attachmentPoint:1,drawingDirection:1,rotation:0,lineSpacingStyle:1,lineSpacingFactor:1,style:"STANDARD",bgFill:0,bgFillScale:1.5},r=[];for(let n of a)switch(n.code){case 1:r.push(n.value);break;case 3:r.push(n.value);break;case 7:t.style=n.value;break;case 10:t.insertionPoint.x=parseFloat(n.value);break;case 20:t.insertionPoint.y=parseFloat(n.value);break;case 30:t.insertionPoint.z=parseFloat(n.value);break;case 11:t.textDirection||(t.textDirection={x:0,y:0,z:0}),t.textDirection.x=parseFloat(n.value);break;case 21:t.textDirection||(t.textDirection={x:0,y:0,z:0}),t.textDirection.y=parseFloat(n.value);break;case 31:t.textDirection||(t.textDirection={x:0,y:0,z:0}),t.textDirection.z=parseFloat(n.value);break;case 40:t.height=parseFloat(n.value);break;case 41:t.width=parseFloat(n.value);break;case 44:t.lineSpacingFactor=parseFloat(n.value);break;case 50:t.rotation=parseFloat(n.value);break;case 71:t.attachmentPoint=parseInt(n.value,10);break;case 72:t.drawingDirection=parseInt(n.value,10);break;case 73:t.lineSpacingStyle=parseInt(n.value,10);break;case 90:t.bgFill=parseInt(n.value,10);break}return t.text=r.join(""),t}function z(a){let t={...l(a),type:"INSERT",blockName:"",insertionPoint:{x:0,y:0,z:0},scaleX:1,scaleY:1,scaleZ:1,rotation:0,columnCount:1,rowCount:1,columnSpacing:0,rowSpacing:0,attribs:[]};for(let r of a)switch(r.code){case 2:t.blockName=r.value;break;case 10:t.insertionPoint.x=parseFloat(r.value);break;case 20:t.insertionPoint.y=parseFloat(r.value);break;case 30:t.insertionPoint.z=parseFloat(r.value);break;case 41:t.scaleX=parseFloat(r.value);break;case 42:t.scaleY=parseFloat(r.value);break;case 43:t.scaleZ=parseFloat(r.value);break;case 44:t.columnSpacing=parseFloat(r.value);break;case 45:t.rowSpacing=parseFloat(r.value);break;case 50:t.rotation=parseFloat(r.value);break;case 70:t.columnCount=parseInt(r.value,10)||1;break;case 71:t.rowCount=parseInt(r.value,10)||1;break}return t}function S(a){let t={...l(a),type:"DIMENSION",blockName:"",dimStyle:"STANDARD",dimType:0,defPoint:{x:0,y:0,z:0},textMidpoint:{x:0,y:0,z:0},textOverride:"",rotation:0,textRotation:0,leaderLength:0};for(let r of a)switch(r.code){case 1:t.textOverride=r.value;break;case 2:t.blockName=r.value;break;case 3:t.dimStyle=r.value;break;case 10:t.defPoint.x=parseFloat(r.value);break;case 20:t.defPoint.y=parseFloat(r.value);break;case 30:t.defPoint.z=parseFloat(r.value);break;case 11:t.textMidpoint.x=parseFloat(r.value);break;case 21:t.textMidpoint.y=parseFloat(r.value);break;case 31:t.textMidpoint.z=parseFloat(r.value);break;case 13:t.defPoint2||(t.defPoint2={x:0,y:0,z:0}),t.defPoint2.x=parseFloat(r.value);break;case 23:t.defPoint2||(t.defPoint2={x:0,y:0,z:0}),t.defPoint2.y=parseFloat(r.value);break;case 33:t.defPoint2||(t.defPoint2={x:0,y:0,z:0}),t.defPoint2.z=parseFloat(r.value);break;case 14:t.defPoint3||(t.defPoint3={x:0,y:0,z:0}),t.defPoint3.x=parseFloat(r.value);break;case 24:t.defPoint3||(t.defPoint3={x:0,y:0,z:0}),t.defPoint3.y=parseFloat(r.value);break;case 34:t.defPoint3||(t.defPoint3={x:0,y:0,z:0}),t.defPoint3.z=parseFloat(r.value);break;case 15:t.defPoint4||(t.defPoint4={x:0,y:0,z:0}),t.defPoint4.x=parseFloat(r.value);break;case 25:t.defPoint4||(t.defPoint4={x:0,y:0,z:0}),t.defPoint4.y=parseFloat(r.value);break;case 35:t.defPoint4||(t.defPoint4={x:0,y:0,z:0}),t.defPoint4.z=parseFloat(r.value);break;case 16:t.defPoint5||(t.defPoint5={x:0,y:0,z:0}),t.defPoint5.x=parseFloat(r.value);break;case 26:t.defPoint5||(t.defPoint5={x:0,y:0,z:0}),t.defPoint5.y=parseFloat(r.value);break;case 36:t.defPoint5||(t.defPoint5={x:0,y:0,z:0}),t.defPoint5.z=parseFloat(r.value);break;case 40:t.leaderLength=parseFloat(r.value);break;case 50:t.rotation=parseFloat(r.value);break;case 53:t.textRotation=parseFloat(r.value);break;case 70:t.dimType=parseInt(r.value,10);break}return t}function N(a){let t={...l(a),type:"HATCH",patternName:"",solidFill:!0,associative:!1,hatchStyle:0,patternType:1,patternAngle:0,patternScale:1,boundaryPaths:[]},r=0;for(;r<a.length;){let n=a[r];switch(n.code){case 2:t.patternName=n.value;break;case 41:t.patternScale=parseFloat(n.value);break;case 52:t.patternAngle=parseFloat(n.value);break;case 70:t.solidFill=n.value==="1";break;case 71:t.associative=n.value==="1";break;case 75:t.hatchStyle=parseInt(n.value,10);break;case 76:t.patternType=parseInt(n.value,10);break;case 91:{let o=parseInt(n.value,10);r++;for(let c=0;c<o&&r<a.length;c++){let s=W(a,r);t.boundaryPaths.push(s.path),r=s.nextIndex}continue}}r++}return t}function W(a,e){let t=0;return e<a.length&&a[e].code===92&&(t=parseInt(a[e].value,10),e++),(t&2)!==0?X(a,e,t):Y(a,e,t)}function X(a,e,t){let r={type:"polyline",vertices:[],bulges:[],flags:t},n=!1;e<a.length&&a[e].code===72&&(n=a[e].value==="1",e++),e<a.length&&a[e].code===73&&(r.isClosed=a[e].value==="1",e++);let o=0;e<a.length&&a[e].code===93&&(o=parseInt(a[e].value,10),e++);for(let c=0;c<o&&e<a.length;c++){let s={x:0,y:0};a[e].code===10&&(s.x=parseFloat(a[e].value),e++),e<a.length&&a[e].code===20&&(s.y=parseFloat(a[e].value),e++),r.vertices.push(s),n&&e<a.length&&a[e].code===42?(r.bulges.push(parseFloat(a[e].value)),e++):n&&r.bulges.push(0)}for(;e<a.length&&(a[e].code===97||a[e].code===330);)if(a[e].code===97){let c=parseInt(a[e].value,10);e++;for(let s=0;s<c&&e<a.length&&a[e].code===330;s++)e++}else e++;return{path:r,nextIndex:e}}function Y(a,e,t){let r={type:"edges",edges:[],flags:t},n=0;e<a.length&&a[e].code===93&&(n=parseInt(a[e].value,10),e++);for(let o=0;o<n&&e<a.length&&a[e].code===72;o++){let c=parseInt(a[e].value,10);switch(e++,c){case 1:{let s={type:"line",start:{x:0,y:0},end:{x:0,y:0}};e<a.length&&a[e].code===10&&(s.start.x=parseFloat(a[e].value),e++),e<a.length&&a[e].code===20&&(s.start.y=parseFloat(a[e].value),e++),e<a.length&&a[e].code===11&&(s.end.x=parseFloat(a[e].value),e++),e<a.length&&a[e].code===21&&(s.end.y=parseFloat(a[e].value),e++),r.edges.push(s);break}case 2:{let s={type:"arc",center:{x:0,y:0},radius:0,startAngle:0,endAngle:360,ccw:!0};e<a.length&&a[e].code===10&&(s.center.x=parseFloat(a[e].value),e++),e<a.length&&a[e].code===20&&(s.center.y=parseFloat(a[e].value),e++),e<a.length&&a[e].code===40&&(s.radius=parseFloat(a[e].value),e++),e<a.length&&a[e].code===50&&(s.startAngle=parseFloat(a[e].value),e++),e<a.length&&a[e].code===51&&(s.endAngle=parseFloat(a[e].value),e++),e<a.length&&a[e].code===73&&(s.ccw=a[e].value==="1",e++),r.edges.push(s);break}case 3:{let s={type:"ellipse",center:{x:0,y:0},majorAxis:{x:1,y:0},minorRatio:1,startAngle:0,endAngle:Math.PI*2,ccw:!0};e<a.length&&a[e].code===10&&(s.center.x=parseFloat(a[e].value),e++),e<a.length&&a[e].code===20&&(s.center.y=parseFloat(a[e].value),e++),e<a.length&&a[e].code===11&&(s.majorAxis.x=parseFloat(a[e].value),e++),e<a.length&&a[e].code===21&&(s.majorAxis.y=parseFloat(a[e].value),e++),e<a.length&&a[e].code===40&&(s.minorRatio=parseFloat(a[e].value),e++),e<a.length&&a[e].code===50&&(s.startAngle=parseFloat(a[e].value),e++),e<a.length&&a[e].code===51&&(s.endAngle=parseFloat(a[e].value),e++),e<a.length&&a[e].code===73&&(s.ccw=a[e].value==="1",e++),r.edges.push(s);break}case 4:{let s=3,p=[],b=[];e<a.length&&a[e].code===94&&(s=parseInt(a[e].value,10),e++),e<a.length&&a[e].code===73&&e++,e<a.length&&a[e].code===74&&e++;let d=0;e<a.length&&a[e].code===95&&(d=parseInt(a[e].value,10),e++);let x=0;e<a.length&&a[e].code===96&&(x=parseInt(a[e].value,10),e++);for(let f=0;f<d&&e<a.length&&a[e].code===40;f++)p.push(parseFloat(a[e].value)),e++;for(let f=0;f<x&&e<a.length;f++){let y={x:0,y:0};a[e].code===10&&(y.x=parseFloat(a[e].value),e++),e<a.length&&a[e].code===20&&(y.y=parseFloat(a[e].value),e++),b.push(y)}r.edges.push({type:"spline",degree:s,knots:p,controlPoints:b});break}default:break}}for(;e<a.length&&(a[e].code===97||a[e].code===330);)if(a[e].code===97){let o=parseInt(a[e].value,10);e++;for(let c=0;c<o&&e<a.length&&a[e].code===330;c++)e++}else e++;return{path:r,nextIndex:e}}function L(a){let t={...l(a),type:"POINT",position:{x:0,y:0,z:0}};for(let r of a)switch(r.code){case 10:t.position.x=parseFloat(r.value);break;case 20:t.position.y=parseFloat(r.value);break;case 30:t.position.z=parseFloat(r.value);break}return t}function u(a,e,t){for(;e<a.length;){let r=a[e];if(r.code!==0){e++;continue}let n=r.value;if(n==="ENDSEC"||n==="ENDBLK")return e+1;e++;let o=[];for(;e<a.length&&a[e].code!==0;)o.push(a[e]),e++;switch(n){case"LINE":t.push(D(o));break;case"CIRCLE":t.push(F(o));break;case"ARC":t.push(E(o));break;case"LWPOLYLINE":t.push(P(o));break;case"ELLIPSE":t.push(w(o));break;case"SPLINE":t.push(g(o));break;case"TEXT":t.push(I(o));break;case"MTEXT":t.push(A(o));break;case"INSERT":{let c=z(o);o.some(p=>p.code===66&&p.value==="1")&&(e=$(a,e,c.attribs)),t.push(c);break}case"DIMENSION":t.push(S(o));break;case"HATCH":t.push(N(o));break;case"POINT":t.push(L(o));break;case"POLYLINE":{let c=T(o);e=V(a,e,c.vertices),t.push(c);break}default:break}}return e}function V(a,e,t){for(;e<a.length;){if(a[e].code!==0){e++;continue}let r=a[e].value;if(r==="SEQEND")return e+1;if(r==="ENDSEC"||r==="ENDBLK")return e;if(r==="VERTEX"){e++;let n={x:0,y:0,bulge:0,startWidth:0,endWidth:0};for(;e<a.length&&a[e].code!==0;){let o=a[e];switch(o.code){case 10:n.x=parseFloat(o.value);break;case 20:n.y=parseFloat(o.value);break;case 42:n.bulge=parseFloat(o.value);break;case 40:n.startWidth=parseFloat(o.value);break;case 41:n.endWidth=parseFloat(o.value);break}e++}t.push(n)}else for(e++;e<a.length&&a[e].code!==0;)e++}return e}function $(a,e,t){for(;e<a.length;){if(a[e].code!==0){e++;continue}let r=a[e].value;if(r==="SEQEND")return e+1;if(r==="ENDSEC"||r==="ENDBLK")return e;if(r==="ATTRIB"){e++;let n={tag:"",text:"",insertionPoint:{x:0,y:0,z:0},height:1,rotation:0,style:"STANDARD",layer:"0",color:256};for(;e<a.length&&a[e].code!==0;){let o=a[e];switch(o.code){case 1:n.text=o.value;break;case 2:n.tag=o.value;break;case 7:n.style=o.value;break;case 8:n.layer=o.value;break;case 10:n.insertionPoint.x=parseFloat(o.value);break;case 20:n.insertionPoint.y=parseFloat(o.value);break;case 30:n.insertionPoint.z=parseFloat(o.value);break;case 40:n.height=parseFloat(o.value);break;case 50:n.rotation=parseFloat(o.value);break;case 62:n.color=parseInt(o.value,10);break}e++}t.push(n)}else for(e++;e<a.length&&a[e].code!==0;)e++}return e}function B(a,e,t){for(;e<a.length;){let r=a[e];if(r.code===0&&r.value==="ENDSEC")return e+1;if(r.code===0&&r.value==="BLOCK"){e++;let n={name:"",basePoint:{x:0,y:0,z:0},entities:[],flags:0};for(;e<a.length&&a[e].code!==0;){let o=a[e];switch(o.code){case 2:n.name=o.value;break;case 8:break;case 10:n.basePoint.x=parseFloat(o.value);break;case 20:n.basePoint.y=parseFloat(o.value);break;case 30:n.basePoint.z=parseFloat(o.value);break;case 70:n.flags=parseInt(o.value,10);break}e++}e=u(a,e,n.entities),n.name&&!n.name.startsWith("*Model_Space")&&!n.name.startsWith("*Paper_Space")&&t.set(n.name,n)}else e++}return e}var C="AutoCAD Binary DXF",U={ANSI_874:"windows-874",ANSI_932:"shift_jis",ANSI_936:"gbk",ANSI_949:"euc-kr",ANSI_950:"big5",ANSI_1250:"windows-1250",ANSI_1251:"windows-1251",ANSI_1252:"windows-1252",ANSI_1253:"windows-1253",ANSI_1254:"windows-1254",ANSI_1255:"windows-1255",ANSI_1256:"windows-1256",ANSI_1257:"windows-1257",ANSI_1258:"windows-1258"},G="AC1021";function K(){return{acadVersion:"",insUnits:0,measurement:0,ltScale:1}}function j(a){return a.replace(/\\\\U\\+([0-9A-Fa-f]{4})/g,(e,t)=>String.fromCodePoint(parseInt(t,16)))}function q(a){if(typeof a=="string")return j(a);let e=new Uint8Array(a);if(new TextDecoder("ascii").decode(e.slice(0,C.length))===C)throw new i("Binary DXF format is not supported. Please export as ASCII DXF.");let r=new TextDecoder("utf-8").decode(a),o=r.match(/\\$ACADVER[\\s\\S]*?\\n\\s*1\\s*\\n\\s*(\\S+)/)?.[1]??"";if(o&&o<G){let s=r.match(/\\$DWGCODEPAGE[\\s\\S]*?\\n\\s*3\\s*\\n\\s*(\\S+)/)?.[1]??"",p=U[s]??"windows-1252";p!=="utf-8"&&(r=new TextDecoder(p).decode(a))}return j(r)}function Q(a,e){for(;e<a.length;){if(a[e].code===0&&a[e].value==="ENDSEC")return e+1;e++}return e}function Z(a){a.layers.has("0")||a.layers.set("0",{name:"0",color:7,lineType:"Continuous",flags:0,lineWeight:-3,isOff:!1,isFrozen:!1,isLocked:!1})}function J(a){for(let[,e]of a.layers)e.isOff=e.color<0,e.isOff&&(e.color=Math.abs(e.color)),e.isFrozen=(e.flags&1)!==0,e.isLocked=(e.flags&4)!==0}var i=class extends Error{constructor(t,r){super(t);this.cause=r;this.name="DxfParseError"}};function M(a){if(typeof a=="string"){if(a.length===0)throw new i("Input is empty. Expected a DXF string or ArrayBuffer.")}else if(a instanceof ArrayBuffer){if(a.byteLength===0)throw new i("Input ArrayBuffer is empty.")}else throw new i("Invalid input type. Expected a string or ArrayBuffer.");let e;try{e=q(a)}catch(n){throw n instanceof i?n:new i("Failed to decode DXF input.",n)}let t;try{t=h(e)}catch(n){throw new i("Failed to tokenize DXF content.",n)}if(t.length===0)throw new i("DXF content produced no tokens. The input may not be a valid DXF file.");let r={header:K(),layers:new Map,lineTypes:new Map,styles:new Map,blocks:new Map,entities:[]};try{let n=0;for(;n<t.length;){let o=t[n];if(o.code===0&&o.value==="SECTION"){if(n++,n>=t.length)break;let c=t[n].value;switch(n++,c){case"HEADER":n=m(t,n,r.header);break;case"TABLES":n=k(t,n,r);break;case"BLOCKS":n=B(t,n,r.blocks);break;case"ENTITIES":n=u(t,n,r.entities);break;default:n=Q(t,n);break}}else{if(o.code===0&&o.value==="EOF")break;n++}}}catch(n){throw new i("Failed to parse DXF sections.",n)}return Z(r),J(r),r}self.onmessage=a=>{let{type:e,id:t,payload:r}=a.data;if(e==="parse")try{let n=M(r);postMessage({type:"result",id:t,doc:n})}catch(n){let o=n instanceof Error?n.message:String(n);postMessage({type:"error",id:t,message:o})}};})();\n'], { type: "text/javascript" })
    );
    this.worker = new Worker(this.blobUrl);
    this.worker.onmessage = (e) => {
      const { type, id, doc, message } = e.data;
      const req = this.pending.get(id);
      if (!req) return;
      this.pending.delete(id);
      if (type === "result") {
        req.resolve(this.reviveDocument(doc));
      } else if (type === "error") {
        req.reject(new Error(message ?? "Worker parse failed"));
      }
    };
    this.worker.onerror = (e) => {
      const err = new Error(e.message ?? "Worker error");
      for (const [, req] of this.pending) {
        req.reject(err);
      }
      this.pending.clear();
      this.destroyWorker();
    };
    return this.worker;
  }
  /**
   * Parse a DXF input in the Worker thread.
   *
   * If `input` is an ArrayBuffer it is transferred (zero-copy) to the Worker.
   * The caller must not use the ArrayBuffer after calling this method.
   */
  parse(input) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      let worker;
      try {
        worker = this.getWorker();
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const msg = { type: "parse", id, payload: input };
      try {
        if (input instanceof ArrayBuffer) {
          worker.postMessage(msg, [input]);
        } else {
          worker.postMessage(msg);
        }
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
  /**
   * Terminate the Worker and release the Blob URL.
   * Rejects all pending requests. Safe to call multiple times.
   */
  terminate() {
    this.destroyWorker();
    const err = new Error("Worker terminated");
    for (const [, req] of this.pending) {
      req.reject(err);
    }
    this.pending.clear();
  }
  /**
   * Destroy the Worker instance and revoke the Blob URL.
   * Does not reject pending requests — used by both `terminate()` and `onerror`.
   */
  destroyWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
  /**
   * Revive a DxfDocument after structured clone.
   *
   * Structured clone preserves Map instances in modern browsers, but some
   * older environments may serialize them as plain objects. This method
   * ensures all expected Map fields are actual Maps.
   */
  reviveDocument(doc) {
    return {
      ...doc,
      layers: this.ensureMap(doc.layers),
      lineTypes: this.ensureMap(doc.lineTypes),
      styles: this.ensureMap(doc.styles),
      blocks: this.ensureMap(doc.blocks)
    };
  }
  ensureMap(value) {
    if (value instanceof Map) return value;
    if (value && typeof value === "object") {
      return new Map(Object.entries(value));
    }
    return /* @__PURE__ */ new Map();
  }
};

// src/viewer/viewer.ts
var CadViewer = class {
  canvas;
  renderer;
  camera;
  layerManager;
  emitter;
  spatialIndex;
  measureTool;
  doc = null;
  options;
  currentTool;
  inputHandler;
  resizeObserver;
  formatConverters;
  workerManager = null;
  selectedEntityIndex = -1;
  renderPending = false;
  destroyed = false;
  loadGeneration = 0;
  mouseScreenX = 0;
  mouseScreenY = 0;
  // Debug mode state
  debugEnabled = false;
  debugOptions;
  lastRenderStats = null;
  lastDebugStats = null;
  frameTimestamps = [];
  lastDoRenderTime = 0;
  lastFrameTime = 0;
  parseTime = 0;
  spatialIndexBuildTime = 0;
  loadedFileName = null;
  loadedFileSize = 0;
  debugRafId = 0;
  constructor(canvas, options) {
    this.canvas = canvas;
    this.options = {
      theme: options?.theme ?? "dark",
      backgroundColor: options?.backgroundColor,
      antialias: options?.antialias ?? true,
      minZoom: options?.minZoom ?? 1e-4,
      maxZoom: options?.maxZoom ?? 1e5,
      zoomSpeed: options?.zoomSpeed ?? 1.1,
      initialTool: options?.initialTool ?? "pan"
    };
    this.formatConverters = options?.formatConverters ?? [];
    if (options?.worker) {
      this.workerManager = new WorkerManager();
    }
    if (options?.debug) {
      this.debugEnabled = true;
      this.debugOptions = resolveDebugOptions(
        typeof options.debug === "boolean" ? void 0 : options.debug
      );
    } else {
      this.debugOptions = resolveDebugOptions();
    }
    this.renderer = new CanvasRenderer(canvas);
    this.camera = new Camera(this.options);
    this.layerManager = new LayerManager();
    this.emitter = new EventEmitter();
    this.spatialIndex = new SpatialIndex();
    this.measureTool = new MeasureTool();
    this.currentTool = this.options.initialTool;
    this.inputHandler = new InputHandler(canvas, this);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.style.cursor = this.getCursorForTool(this.currentTool);
    this.requestRender();
    if (this.debugEnabled) {
      this.startDebugLoop();
    }
  }
  // === Loading ===
  /**
   * Throws if the viewer has been destroyed.
   * Call at the start of any public method that mutates state.
   */
  guardDestroyed() {
    if (this.destroyed) {
      throw new Error("CadViewer: cannot call methods on a destroyed instance.");
    }
  }
  /**
   * Run registered format converters on a buffer.
   * Returns the converted DXF string if a converter matched, or null otherwise.
   * Each converter's detect() is wrapped in try/catch — a throwing detect() is skipped.
   */
  async runConverters(buffer) {
    for (const converter of this.formatConverters) {
      let detected = false;
      try {
        detected = converter.detect(buffer);
      } catch {
        continue;
      }
      if (detected) {
        return converter.convert(buffer);
      }
    }
    return null;
  }
  /**
   * Load a CAD file from a browser File object.
   * Automatically detects the format using registered converters (e.g. DWG).
   * Falls back to DXF parsing if no converter matches.
   */
  async loadFile(file) {
    this.guardDestroyed();
    const generation = ++this.loadGeneration;
    this.loadedFileName = file.name;
    this.loadedFileSize = file.size;
    const buffer = await file.arrayBuffer();
    if (this.destroyed || generation !== this.loadGeneration) return;
    const dxfString = await this.runConverters(buffer);
    if (this.destroyed || generation !== this.loadGeneration) return;
    const t0 = performance.now();
    const parseInput = dxfString ?? buffer;
    this.doc = await this.parseWithOptionalWorker(parseInput, generation);
    if (this.destroyed || generation !== this.loadGeneration) return;
    this.parseTime = performance.now() - t0;
    this.onDocumentLoaded();
  }
  /**
   * Load a CAD file from an ArrayBuffer with format converter support.
   * Unlike `loadArrayBuffer()` (sync, DXF-only), this method is async and
   * checks registered FormatConverters for non-DXF formats.
   */
  async loadBuffer(buffer) {
    this.guardDestroyed();
    const generation = ++this.loadGeneration;
    this.loadedFileName = null;
    this.loadedFileSize = buffer.byteLength;
    const dxfString = await this.runConverters(buffer);
    if (this.destroyed || generation !== this.loadGeneration) return;
    const t0 = performance.now();
    const parseInput = dxfString ?? buffer;
    this.doc = await this.parseWithOptionalWorker(parseInput, generation);
    if (this.destroyed || generation !== this.loadGeneration) return;
    this.parseTime = performance.now() - t0;
    this.onDocumentLoaded();
  }
  /**
   * Parse input using the Worker (if enabled) or the main-thread parser.
   * When the Worker is terminated (e.g. viewer destroyed) while a parse is
   * in flight, the rejection is swallowed if the load generation is stale.
   */
  async parseWithOptionalWorker(input, generation) {
    if (!this.workerManager) {
      return parseDxf(input);
    }
    try {
      return await this.workerManager.parse(input);
    } catch (err) {
      if (this.destroyed || generation !== this.loadGeneration) {
        return null;
      }
      throw err;
    }
  }
  /**
   * Load a pre-parsed DxfDocument directly, bypassing the parser.
   * Useful for custom parsers or pre-processed documents.
   */
  loadDocument(doc) {
    this.guardDestroyed();
    ++this.loadGeneration;
    this.loadedFileName = null;
    this.loadedFileSize = 0;
    this.parseTime = 0;
    if (!doc || !Array.isArray(doc.entities) || !(doc.layers instanceof Map)) {
      throw new Error("CadViewer: invalid DxfDocument \u2014 expected entities array and layers Map.");
    }
    this.doc = doc;
    this.onDocumentLoaded();
  }
  /**
   * Load a DXF string directly (synchronous, no format conversion).
   */
  loadString(dxf) {
    this.guardDestroyed();
    ++this.loadGeneration;
    this.loadedFileName = null;
    this.loadedFileSize = dxf.length;
    const t0 = performance.now();
    this.doc = parseDxf(dxf);
    this.parseTime = performance.now() - t0;
    this.onDocumentLoaded();
  }
  /**
   * Load a DXF file from an ArrayBuffer (synchronous, no format conversion).
   * For format conversion support (e.g. DWG), use `loadFile()` or `loadBuffer()` instead.
   */
  loadArrayBuffer(buffer) {
    this.guardDestroyed();
    ++this.loadGeneration;
    this.loadedFileName = null;
    this.loadedFileSize = buffer.byteLength;
    const t0 = performance.now();
    this.doc = parseDxf(buffer);
    this.parseTime = performance.now() - t0;
    this.onDocumentLoaded();
  }
  /**
   * Clear the current document and reset all state without destroying the viewer.
   */
  clearDocument() {
    this.guardDestroyed();
    ++this.loadGeneration;
    this.doc = null;
    this.selectedEntityIndex = -1;
    this.spatialIndex.clear();
    clearBlockEntityBBoxCache();
    this.layerManager.clear();
    this.measureTool.deactivate();
    this.requestRender();
  }
  onDocumentLoaded() {
    if (!this.doc) return;
    this.layerManager.setLayers(this.doc.layers);
    const t0 = performance.now();
    this.spatialIndex.build(this.doc.entities, this.doc);
    setBlockEntityBBoxCache(buildBlockEntityBBoxCache(this.doc));
    this.spatialIndexBuildTime = performance.now() - t0;
    this.selectedEntityIndex = -1;
    this.measureTool.deactivate();
    if (this.currentTool === "measure") {
      this.measureTool.activate();
    }
    this.fitToView();
  }
  // === Camera Controls ===
  fitToView() {
    this.guardDestroyed();
    if (!this.doc) return;
    const bounds = this.computeDocumentBounds();
    if (!bounds) return;
    const rect = this.canvas.getBoundingClientRect();
    this.camera.setTransform(
      fitToView(rect.width, rect.height, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
    );
    this.requestRender();
    this.emitter.emit("viewchange", this.camera.getTransform());
  }
  zoomTo(scale) {
    this.guardDestroyed();
    const rect = this.canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const factor = scale / this.camera.getTransform().scale;
    this.camera.zoom(centerX, centerY, factor);
    this.requestRender();
    this.emitter.emit("viewchange", this.camera.getTransform());
  }
  panTo(worldX, worldY) {
    this.guardDestroyed();
    const rect = this.canvas.getBoundingClientRect();
    const vt = this.camera.getTransform();
    const currentSX = worldX * vt.scale + vt.offsetX;
    const currentSY = -worldY * vt.scale + vt.offsetY;
    const dx = rect.width / 2 - currentSX;
    const dy = rect.height / 2 - currentSY;
    this.camera.pan(dx, dy);
    this.requestRender();
    this.emitter.emit("viewchange", this.camera.getTransform());
  }
  getViewTransform() {
    return { ...this.camera.getTransform() };
  }
  /** @internal */
  getZoomSpeed() {
    return this.options.zoomSpeed;
  }
  // === Layers ===
  getLayers() {
    return this.layerManager.getAllLayers();
  }
  setLayerVisible(name, visible) {
    this.guardDestroyed();
    this.layerManager.setVisible(name, visible);
    this.requestRender();
  }
  setLayerColor(name, color) {
    this.guardDestroyed();
    this.layerManager.setColorOverride(name, color);
    this.requestRender();
  }
  // === Theme ===
  setTheme(theme) {
    this.guardDestroyed();
    this.options.theme = theme;
    this.requestRender();
  }
  getTheme() {
    return this.options.theme;
  }
  setBackgroundColor(color) {
    this.guardDestroyed();
    this.options.backgroundColor = color;
    this.requestRender();
  }
  // === Tools ===
  setTool(tool) {
    this.guardDestroyed();
    if (this.currentTool === "measure" && tool !== "measure") {
      this.measureTool.deactivate();
    }
    this.currentTool = tool;
    this.canvas.style.cursor = this.getCursorForTool(tool);
    if (tool === "measure") {
      this.measureTool.activate();
    }
    if (tool !== "select") {
      this.selectedEntityIndex = -1;
    }
    this.requestRender();
  }
  getTool() {
    return this.currentTool;
  }
  getCursorForTool(tool) {
    switch (tool) {
      case "pan":
        return "grab";
      case "select":
        return "crosshair";
      case "measure":
        return "crosshair";
    }
  }
  // === Events ===
  on(event, callback) {
    this.emitter.on(event, callback);
  }
  off(event, callback) {
    this.emitter.off(event, callback);
  }
  // === Document Access ===
  getDocument() {
    return this.doc;
  }
  getEntities() {
    return this.doc?.entities ?? [];
  }
  // === Lifecycle ===
  resize() {
    this.renderer.updateSize();
    this.requestRender();
  }
  destroy() {
    this.destroyed = true;
    this.stopDebugLoop();
    this.inputHandler.destroy();
    this.resizeObserver.disconnect();
    this.renderer.destroy();
    this.emitter.removeAllListeners();
    this.spatialIndex.clear();
    clearBlockEntityBBoxCache();
    this.layerManager.clear();
    this.workerManager?.terminate();
    this.workerManager = null;
    this.doc = null;
  }
  // === Internal (called by InputHandler) ===
  /** @internal */
  requestRender() {
    if (this.destroyed) return;
    if (this.debugRafId) {
      this.doRender();
      return;
    }
    if (this.renderPending) return;
    this.renderPending = true;
    requestAnimationFrame(() => {
      this.renderPending = false;
      if (this.destroyed) return;
      this.doRender();
    });
  }
  doRender() {
    if (!this.doc) {
      this.renderer.renderEmpty(this.options.theme);
      return;
    }
    const vt = this.camera.getTransform();
    const w = this.renderer.getWidth();
    const h = this.renderer.getHeight();
    const vb = this.computeViewportBounds(vt, w, h);
    const hits = this.spatialIndex.search(vb.minX, vb.minY, vb.maxX, vb.maxY);
    const visibleIndices = /* @__PURE__ */ new Set();
    for (let i = 0; i < hits.length; i++) {
      visibleIndices.add(hits[i].entityIndex);
    }
    const renderStart = performance.now();
    const stats = this.renderer.render(
      this.doc,
      vt,
      this.options.theme,
      this.layerManager.getVisibleLayerNames(),
      this.selectedEntityIndex,
      visibleIndices,
      this.spatialIndex.getEntityBBoxes()
    );
    this.lastFrameTime = performance.now() - renderStart;
    this.lastRenderStats = stats;
    const now = performance.now();
    if (now - this.lastDoRenderTime >= 3) {
      this.frameTimestamps.push(now);
    }
    this.lastDoRenderTime = now;
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0] < now - 1e3) {
      this.frameTimestamps.shift();
    }
    if (this.currentTool === "measure" && this.measureTool.state.phase !== "idle") {
      const ctx = this.renderer.getContext();
      renderMeasureOverlay(
        ctx,
        this.camera.getTransform(),
        this.measureTool,
        this.mouseScreenX,
        this.mouseScreenY,
        this.options.theme
      );
    }
    if (this.debugEnabled) {
      const ctx = this.renderer.getContext();
      const debugStats = this.buildDebugStats();
      this.lastDebugStats = debugStats;
      renderDebugOverlay(
        ctx,
        debugStats,
        this.options.theme,
        this.debugOptions,
        this.renderer.getWidth(),
        this.renderer.getHeight()
      );
    }
  }
  // === Debug Mode ===
  /**
   * Enable or disable the debug overlay.
   * Pass `true` for defaults, `false` to disable, or an object for granular control.
   */
  setDebug(debug) {
    this.guardDestroyed();
    if (typeof debug === "boolean") {
      this.debugEnabled = debug;
    } else {
      this.debugEnabled = true;
      this.debugOptions = resolveDebugOptions(debug);
    }
    if (this.debugEnabled) {
      this.startDebugLoop();
    } else {
      this.stopDebugLoop();
      this.requestRender();
    }
  }
  startDebugLoop() {
    if (this.debugRafId) return;
    const loop = () => {
      if (!this.debugEnabled || this.destroyed) {
        this.debugRafId = 0;
        return;
      }
      this.doRender();
      this.debugRafId = requestAnimationFrame(loop);
    };
    this.debugRafId = requestAnimationFrame(loop);
  }
  stopDebugLoop() {
    if (this.debugRafId) {
      cancelAnimationFrame(this.debugRafId);
      this.debugRafId = 0;
    }
  }
  /**
   * Get the latest debug stats snapshot, or null if debug mode is off.
   */
  getDebugStats() {
    return this.debugEnabled ? this.lastDebugStats : null;
  }
  buildDebugStats() {
    const vt = this.camera.getTransform();
    const w = this.renderer.getWidth();
    const h = this.renderer.getHeight();
    const bounds = this.computeViewportBounds(vt, w, h);
    return {
      fps: this.frameTimestamps.length,
      frameTime: this.lastFrameTime,
      renderStats: this.lastRenderStats ?? {
        entitiesDrawn: 0,
        entitiesSkipped: 0,
        drawCalls: 0,
        byType: {}
      },
      entityCount: this.doc?.entities.length ?? 0,
      layerCount: this.doc?.layers.size ?? 0,
      visibleLayerCount: this.layerManager.getVisibleLayerNames().size,
      blockCount: this.doc?.blocks.size ?? 0,
      parseTime: this.parseTime,
      spatialIndexBuildTime: this.spatialIndexBuildTime,
      totalLoadTime: this.parseTime + this.spatialIndexBuildTime,
      zoom: vt.scale,
      pixelSize: vt.scale > 0 ? 1 / vt.scale : 0,
      viewportBounds: bounds,
      fileName: this.loadedFileName,
      fileSize: this.loadedFileSize,
      dxfVersion: this.doc?.header.acadVersion ?? null
    };
  }
  computeViewportBounds(vt, w, h) {
    const [x1, y1] = screenToWorld(vt, 0, h);
    const [x2, y2] = screenToWorld(vt, w, 0);
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2)
    };
  }
  // === Internal (called by InputHandler) ===
  /** @internal */
  handlePan(dx, dy) {
    this.camera.pan(dx, dy);
    this.requestRender();
    this.emitter.emit("viewchange", this.camera.getTransform());
  }
  /** @internal */
  handleZoom(screenX, screenY, factor) {
    this.camera.zoom(screenX, screenY, factor);
    this.requestRender();
    this.emitter.emit("viewchange", this.camera.getTransform());
  }
  /** @internal */
  handleClick(screenX, screenY) {
    if (!this.doc) return;
    const vt = this.camera.getTransform();
    const [wx, wy] = screenToWorld(vt, screenX, screenY);
    switch (this.currentTool) {
      case "select":
        this.handleSelect(wx, wy, screenX, screenY);
        break;
      case "measure": {
        const snaps = findSnaps(wx, wy, this.doc.entities, this.spatialIndex, vt.scale);
        const snap = snaps.length > 0 ? snaps[0] : null;
        const result = this.measureTool.handleClick(wx, wy, snap);
        this.requestRender();
        if (result) {
          this.emitter.emit("measure", result);
        }
        break;
      }
    }
  }
  /** @internal — called by InputHandler for mouse move */
  handleMouseMove(screenX, screenY) {
    this.mouseScreenX = screenX;
    this.mouseScreenY = screenY;
    if (this.currentTool === "measure" && this.doc) {
      const vt = this.camera.getTransform();
      const [wx, wy] = screenToWorld(vt, screenX, screenY);
      const snaps = findSnaps(wx, wy, this.doc.entities, this.spatialIndex, vt.scale);
      this.measureTool.handleMove(snaps[0] ?? null);
      this.requestRender();
    }
  }
  handleSelect(wx, wy, sx, sy) {
    if (!this.doc) return;
    const index = hitTest(
      wx,
      wy,
      this.doc.entities,
      this.spatialIndex,
      this.layerManager.getVisibleLayerNames(),
      this.camera.getTransform().scale
    );
    this.selectedEntityIndex = index;
    this.requestRender();
    if (index >= 0 && this.doc) {
      const entity = this.doc.entities[index];
      if (entity) {
        this.emitter.emit("select", {
          entity,
          entityIndex: index,
          worldPoint: { x: wx, y: wy },
          screenPoint: { x: sx, y: sy }
        });
      }
    }
  }
  computeDocumentBounds() {
    if (!this.doc) return null;
    if (this.doc.header.extMin && this.doc.header.extMax) {
      return {
        minX: this.doc.header.extMin.x,
        minY: this.doc.header.extMin.y,
        maxX: this.doc.header.extMax.x,
        maxY: this.doc.header.extMax.y
      };
    }
    return computeEntitiesBounds(this.doc.entities);
  }
};

globalThis.CadDxf = { parseDxf, aciToHex, trueColorToHex };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map
})();
