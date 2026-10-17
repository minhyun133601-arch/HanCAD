(function createCadImporters(Tool) {
  "use strict";
  const TAU = Math.PI * 2;
  const LIMIT = Tool.core.cadEngine.ENTITY_LIMIT;
  const MAX_BYTES = 64 * 1024 * 1024;
  const IDENTITY = [1, 0, 0, 1, 0, 0];
  const finite = n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e12;
  const mod = n => ((n % TAU) + TAU) % TAU;
  const validPoint = p => p && finite(p.x) && finite(p.y) && (p.z === undefined || finite(p.z));
  const diagnostic = (code, details = {}) => ({ namespace: "cad-import", code, ...details });
  const failure = (code, message, details = {}) => Object.assign(new Error(message), { name: code === "cancelled" ? "AbortError" : "CadImportError", diagnostic: diagnostic(code, details) });
  const invalid = (reason, message) => failure("invalid-geometry", message, { reason });
  const abort = () => failure("cancelled", "가져오기를 취소했습니다.");
  function progress(options, code, fallback, details = {}) { options.onProgress?.(fallback); options.onDiagnosticProgress?.(diagnostic(code, details)); }
  function check(signal) { if (signal?.aborted) throw abort(); }
  function multiply(a, b) {
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  }
  function transform(p, m) {
    if (!validPoint(p)) throw invalid("point", "올바르지 않은 좌표");
    const result = { x: m[0]*p.x+m[2]*p.y+m[4], y: -(m[1]*p.x+m[3]*p.y+m[5]), ...(p.z ? { z: p.z } : {}) };
    if (!validPoint(result)) throw invalid("coordinate-range", "좌표 범위 초과");
    return result;
  }
  function decodeDxf(buffer) {
    const bytes = new Uint8Array(buffer);
    if (new TextDecoder().decode(bytes.subarray(0, 22)).startsWith("AutoCAD Binary DXF")) throw failure("binary-dxf", "바이너리 DXF는 지원하지 않습니다. CAD에서 ASCII DXF로 저장해 주세요.");
    let text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
    const version = text.match(/\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/)?.[1];
    if (version && version < "AC1021") {
      const cp = text.match(/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/)?.[1];
      const pages = { ANSI_949: "euc-kr", ANSI_932: "shift_jis", ANSI_936: "gbk", ANSI_950: "big5", ANSI_1252: "windows-1252" };
      if (cp && pages[cp]) text = new TextDecoder(pages[cp]).decode(bytes);
    }
    return text.replace(/\\U\+([\da-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  function validateDxf(text) {
    if (typeof text !== "string" || text.length > MAX_BYTES * 4) throw failure("dxf-size", "DXF 데이터가 너무 큽니다.");
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines.length % 2) throw failure("dxf-pairs", "DXF 그룹 코드와 값의 쌍이 손상되었습니다.");
    let section = "", entities = false, eof = false;
    for (let i = 0; i < lines.length; i += 2) {
      const codeText = lines[i].trim(), value = lines[i + 1].trim();
      if (!/^\d+$/.test(codeText) || Number(codeText) > 1071) throw failure("dxf-group-code", `DXF ${i + 1}행의 그룹 코드가 올바르지 않습니다.`, { line: i + 1 });
      const code = Number(codeText);
      if (code === 0 && value === "SECTION") {
        if (section || lines[i + 2]?.trim() !== "2") throw failure("dxf-structure", "DXF SECTION 구조가 손상되었습니다.", { part: "SECTION" });
        section = lines[i + 3]?.trim() || ""; if (section === "ENTITIES") entities = true;
      }
      if (code === 0 && value === "ENDSEC") { if (!section) throw failure("dxf-structure", "DXF ENDSEC 구조가 손상되었습니다.", { part: "ENDSEC" }); section = ""; }
      if (code === 0 && value === "EOF") { eof = true; if (i !== lines.length - 2) throw failure("dxf-structure", "DXF EOF 뒤에 데이터가 있습니다.", { part: "EOF-after" }); }
      // Reject malformed numbers instead of letting parser defaults alter geometry.
      if (((code >= 10 && code <= 59) || (code >= 110 && code <= 149) || (code >= 210 && code <= 239)) && (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)))) throw failure("dxf-number", `DXF ${i + 2}행에 유효하지 않은 숫자가 있습니다.`, { line: i + 2 });
    }
    if (section || !entities || !eof) throw failure("dxf-structure", "완전한 DXF ENTITIES / ENDSEC / EOF 구조를 찾을 수 없습니다.", { part: "complete" });
  }
  function plainText(value) {
    return String(value || "").replace(/%%d/gi, "°").replace(/%%p/gi, "±").replace(/%%c/gi, "Ø")
      .replace(/\\P/g, "\n").replace(/\\~/g, " ").replace(/\\S([^;]*);/g, (_, text) => text.replace(/[\^#]/g, "/"))
      .replace(/\\[fFHWQTCAa][^;]*;/g, "").replace(/\\[LlOoKk]/g, "").replace(/[{}]/g, "").replace(/\\\\/g, "\\");
  }
  function attachDimStyles(text, document) {
    const lines = text.replace(/\r\n?/g,"\n").split("\n");
    document.dimStyles = new Map();
    const overrides = new Map(), anonymous = new Map();
    const recordTypes = new Set(["DIMSTYLE", "DIMENSION", "BLOCK", "ENDBLK", "POLYLINE", "VERTEX", "SEQEND"]);
    const polylineZ = new Map(), anonymousPolylineZ = new Map();
    let activePolyline = null;
    let activeBlock = null;
    for (let i=0;i<lines.length-1;i+=2) {
      if (lines[i].trim() !== "0" || !recordTypes.has(lines[i+1].trim())) continue;
      const recordType = lines[i+1].trim();
      const tags = new Map();
      // Numeric/identifier whitespace is padding; dimension text and DIMPOST whitespace is data.
      for (i+=2;i<lines.length-1 && lines[i].trim() !== "0";i+=2) {
        const code = Number(lines[i]);
        tags.set(code, code === 1 || code === 3 ? lines[i+1] : lines[i+1].trim());
      }
      i-=2;
      if (recordType === "BLOCK") { activeBlock = tags.get(2); continue; }
      if (recordType === "ENDBLK") { activeBlock = null; continue; }
      // The offline vendor parser omits VERTEX group 30; retain it in this adapter.
      if (recordType === "POLYLINE") {
        activePolyline = { elevation: Number(tags.get(30)) || 0, vertices: [] };
        if (tags.has(5)) polylineZ.set(tags.get(5), activePolyline);
        else { const queue = anonymousPolylineZ.get(activeBlock) || []; queue.push(activePolyline); anonymousPolylineZ.set(activeBlock, queue); }
        continue;
      }
      if (recordType === "VERTEX") { if (activePolyline) activePolyline.vertices.push(tags.has(30) ? Number(tags.get(30)) : activePolyline.elevation); continue; }
      if (recordType === "SEQEND") { activePolyline = null; continue; }
      if (recordType === "DIMENSION") {
        const value = {};
        if (tags.has(53)) value.explicitTextRotation = Number(tags.get(53));
        if (tags.has(1)) value.textOverride = tags.get(1);
        if (tags.has(5)) overrides.set(tags.get(5), value);
        else { const queue = anonymous.get(activeBlock) || []; queue.push(value); anonymous.set(activeBlock, queue); }
        continue;
      }
      const name=tags.get(2);
      if (name) document.dimStyles.set(name,{dimScale:Number(tags.get(40)) || 1,textSize:Number(tags.get(140)) || 2.5,arrowSize:tags.has(41)?Number(tags.get(41)):2.5,extensionGap:Number(tags.get(42)) || 0,extensionOvershoot:Number(tags.get(44)) || 0,precision:tags.has(271)?Number(tags.get(271)):2,measurementFactor:tags.has(144)?Number(tags.get(144)):1,textGap:tags.has(147)?Number(tags.get(147)):undefined,zeroSuppression:Number(tags.get(78)) || 0,post:tags.get(3) || ""});
    }
    const applyOverrides = (entities, blockName = null) => {
      const queue = anonymous.get(blockName) || []; let index = 0;
      const polylines = anonymousPolylineZ.get(blockName) || []; let polylineIndex = 0;
      for (const entity of entities) if (entity.type === "DIMENSION") {
        const value = entity.handle ? overrides.get(entity.handle) : queue[index++];
        if (value) Object.assign(entity, value);
      } else if (entity.type === "POLYLINE") {
        const value = entity.handle ? polylineZ.get(entity.handle) : polylines[polylineIndex++];
        if (value) entity.vertices.forEach((vertex, i) => { if (value.vertices[i] !== undefined) vertex.z = value.vertices[i]; });
      }
    };
    applyOverrides(document.entities);
    for (const [name, block] of document.blocks) applyOverrides(block.entities, name);
    return document;
  }
  function convertDocument(document, options = {}) {
    const parser = globalThis.CadDxf;
    const report = { format: options.format || "DXF", version: options.version || document.header?.acadVersion || "", imported: 0, sourceEntities: document.entities.length, skipped: 0, approximated: 0, unsupported: [], warnings: [] };
    const missing = new Map(), warnings = new Map(), entities = [];
    const addWarning = (message, identity) => warnings.set(message, identity || null);
    const skip = (type, reason, identity) => { report.skipped++; missing.set(type, (missing.get(type) || 0) + 1); if (reason) addWarning(reason, identity); };
    function hex(aci, trueColor) {
      if (Number.isInteger(trueColor) && trueColor >= 0 && trueColor <= 0xffffff) return `#${trueColor.toString(16).padStart(6, "0")}`;
      return parser.aciToHex(Math.abs(aci)) || "#e2e8f0";
    }
    const layers = [...document.layers.values()].map(l => ({ name: l.name || "0", color: hex(l.color, l.trueColor), aci: Math.abs(l.color ?? 7), trueColor: l.trueColor, linetype: l.lineType || "CONTINUOUS", lineweight: l.lineWeight ?? -3, visible: !l.isOff && !l.isFrozen, locked: !!l.isLocked }));
    function style(e, inherited) {
      const layer = e.layer === "0" && inherited ? inherited.layer : e.layer || "0";
      const table = document.layers.get(layer);
      const trueColorValue = value => Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : undefined;
      let aci = Math.abs(e.color ?? 256), trueColor = trueColorValue(e.trueColor);
      // Flattening must resolve ByBlock against the INSERT's layer, not the child's layer.
      // Keep ACI 7 symbolic so its dark/light background inversion remains dynamic.
      if (trueColor === undefined && aci === 0 && inherited) {
        aci = inherited.resolvedColor.aci; trueColor = inherited.resolvedColor.trueColor;
      }
      const resolvedColor = trueColor !== undefined ? { aci, trueColor }
        : aci === 256 ? { aci: Math.abs(table?.color ?? 7), trueColor: trueColorValue(table?.trueColor) }
        : { aci: aci === 0 ? 7 : aci };
      let linetype = (e.lineType || "BYLAYER").toUpperCase();
      if (linetype === "BYBLOCK" && inherited) linetype = inherited.resolvedLinetype;
      const resolvedLinetype = linetype === "BYLAYER" ? (table?.lineType || "CONTINUOUS").toUpperCase()
        : linetype === "BYBLOCK" ? "CONTINUOUS" : linetype;
      let lineweight = e.lineWeight ?? -1;
      if (lineweight === -2 && inherited) lineweight = inherited.resolvedLineweight;
      const layerWeight = table?.lineWeight ?? -3;
      const resolvedLineweight = lineweight === -1 ? (layerWeight >= 0 ? layerWeight : -3)
        : lineweight === -2 ? -3 : lineweight;
      return { layer, color: hex(resolvedColor.aci, resolvedColor.trueColor), aci, trueColor,
        linetype, linetypeScale: e.lineTypeScale ?? 1, lineweight,
        lineWidth: Math.max(0.25, Math.min(100, resolvedLineweight > 0 ? resolvedLineweight / 100 : 1.5)),
        resolvedColor, resolvedLinetype, resolvedLineweight };
    }
    function add(raw) {
      if (entities.length >= LIMIT) throw failure("entity-limit", `가져올 객체가 ${LIMIT.toLocaleString()}개를 초과합니다. CAD에서 필요한 영역만 분리해 주세요.`, { limit: LIMIT });
      const entity = Tool.core.cadEngine.normalizeEntity({ ...raw, id: `import-${entities.length + 1}` });
      if (!entity) throw invalid("entity", "유효하지 않은 객체 데이터");
      entities.push(entity);
    }
    function poly(points, closed, m, s) {
      if (!Array.isArray(points) || points.length < 2 || points.length > 10000) throw invalid("polyline-vertices", "폴리선 정점 수가 올바르지 않습니다.");
      add({ ...s, type: "polyline", points: points.map(p => transform(p, m)), closed });
    }
    function bulgePoints(vertices, closed) {
      if (!Array.isArray(vertices) || vertices.length < 2 || vertices.length > 5000) throw invalid("polyline-vertices", "폴리선 정점 수가 올바르지 않습니다.");
      const result = [];
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        if (!validPoint(a) || !finite(a.bulge ?? 0)) throw invalid("polyline-point", "폴리선 좌표가 올바르지 않습니다.");
        result.push(a);
        const bulge = a.bulge || 0;
        if ((!closed && i === vertices.length - 1) || Math.abs(bulge) < 1e-10) continue;
        if (!validPoint(b)) throw invalid("polyline-point", "폴리선 좌표가 올바르지 않습니다.");
        const dx = b.x-a.x, dy = b.y-a.y, chord = Math.hypot(dx, dy);
        if (chord < 1e-8) continue;
        const cx = (a.x+b.x)/2 - dy*(1-bulge*bulge)/(4*bulge), cy = (a.y+b.y)/2 + dx*(1-bulge*bulge)/(4*bulge);
        const radius = chord*(1+bulge*bulge)/(4*Math.abs(bulge)), start = Math.atan2(a.y-cy, a.x-cx), sweep = 4*Math.atan(bulge);
        const steps = Math.max(2, Math.min(256, Math.ceil(Math.abs(sweep)/(Math.PI/90))));
        for (let j = 1; j < steps; j++) result.push({ x: cx+radius*Math.cos(start+sweep*j/steps), y: cy+radius*Math.sin(start+sweep*j/steps) });
        if (result.length > 10000) throw invalid("polyline-curve-vertices", "폴리선 곡선 정점 수가 너무 많습니다.");
      }
      return result;
    }
    function ellipse(e, m, s) {
      const axis = e.majorAxis, center = e.center;
      if (!validPoint(axis) || !validPoint(center) || !finite(e.minorRatio) || e.minorRatio <= 0 || !finite(e.startParam) || !finite(e.endParam)) throw invalid("ellipse", "타원 데이터가 올바르지 않습니다.");
      const span = Math.abs(e.endParam-e.startParam) >= TAU-1e-8 ? TAU : mod(e.endParam-e.startParam);
      if (!span || Math.hypot(axis.x, axis.y) < 1e-8) throw invalid("empty-ellipse", "빈 타원");
      const steps = Math.max(8, Math.ceil(span/(Math.PI/90))), points = [];
      for (let n = 0; n <= steps; n++) { const t = e.startParam+span*n/steps; points.push({ x: center.x+axis.x*Math.cos(t)-axis.y*e.minorRatio*Math.sin(t), y: center.y+axis.y*Math.cos(t)+axis.x*e.minorRatio*Math.sin(t) }); }
      poly(points, span >= TAU-1e-8, m, s); report.approximated++; addWarning("곡선 폴리선 / 타원 / 비균일 축척의 원은 편집 가능한 폴리선으로 근사합니다.", diagnostic("curve-approximated"));
    }
    function spline(e, m, s) {
      const p = e.degree, cp = e.controlPoints, knots = e.knots;
      if (!Number.isInteger(p) || p < 1 || p > 10 || !Array.isArray(cp) || cp.length <= p || cp.length > 1000 || cp.some(v => !validPoint(v)) || knots.length !== cp.length+p+1 || knots.some((v, i) => !finite(v) || i && v < knots[i-1])) throw invalid("spline", "스플라인의 차수 / 매듭 / 제어점이 올바르지 않습니다.");
      const start = knots[p], end = knots[cp.length];
      if (end <= start) throw invalid("spline-interval", "스플라인 구간이 없습니다.");
      const weights = e.weights.length ? e.weights : cp.map(() => 1);
      if (weights.length !== cp.length || weights.some(v => !finite(v) || v <= 0)) throw invalid("spline-weights", "스플라인 가중치가 올바르지 않습니다.");
      const steps = Math.min(2000, Math.max(32, cp.length*12)), points = [];
      for (let step = 0; step <= steps; step++) {
        const t = start+(end-start)*step/steps;
        let k = cp.length-1;
        if (step !== steps) { k = p; while (k < cp.length-1 && knots[k+1] <= t) k++; }
        const d = Array.from({ length: p+1 }, (_, j) => { const i = k-p+j; return [cp[i].x*weights[i], cp[i].y*weights[i], weights[i]]; });
        for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) { const i = k-p+j, den = knots[i+p-r+1]-knots[i], alpha = den ? (t-knots[i])/den : 0; d[j] = d[j].map((v, n) => (1-alpha)*d[j-1][n]+alpha*v); }
        points.push({ x: d[p][0]/d[p][2], y: d[p][1]/d[p][2] });
      }
      poly(points, !!(e.flags & 1), m, s); report.approximated++; addWarning("스플라인은 편집 가능한 폴리선으로 근사합니다.", diagnostic("spline-approximated"));
    }
    function visit(e, m, inherited, stack = []) {
      check(options.signal);
      if (e.paperSpace || e.visible === false) { report.skipped++; addWarning("배치 공간 또는 숨김 객체는 가져오지 않습니다. 레이어 숨김 / 잠금은 유지합니다.", diagnostic("hidden-skipped")); return; }
      const s = style(e, inherited);
      if (e.extrusion && (Math.abs(e.extrusion.x) > 1e-8 || Math.abs(e.extrusion.y) > 1e-8)) { skip(e.type, "기울어진 3D 객체는 가져오지 않습니다.", diagnostic("tilted-skipped")); return; }
      if (e.extrusion?.z < 0 && !["LINE", "DIMENSION", "INSERT"].includes(e.type)) m = multiply(m, [-1,0,0,1,0,0]);
      try {
        if (e.type === "INSERT") {
          const block = document.blocks.get(e.blockName);
          if (!block || stack.includes(e.blockName) || stack.length >= 32) { const name = String(e.blockName).slice(0, 80); skip("INSERT", `블록 누락 또는 순환 참조: ${name}`, diagnostic("block-reference", { name })); return; }
          const { scaleX: sx, scaleY: sy, rotation, columnCount: cols, rowCount: rows } = e;
          if (![sx, sy, rotation, e.columnSpacing, e.rowSpacing].every(finite) || !sx || !sy || !Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols*rows > 10000 || !validPoint(e.insertionPoint) || !validPoint(block.basePoint)) throw invalid("block-transform", "블록 변환 데이터가 올바르지 않습니다.");
          const angle = rotation*Math.PI/180, c = Math.cos(angle), n = Math.sin(angle), b = block.basePoint;
          for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
            const dx = col*e.columnSpacing, dy = row*e.rowSpacing;
            const local = [c*sx,n*sx,-n*sy,c*sy,e.insertionPoint.x+c*dx-n*dy-c*sx*b.x+n*sy*b.y,e.insertionPoint.y+n*dx+c*dy-n*sx*b.x-c*sy*b.y];
            const next = multiply(m, local);
            for (const child of block.entities) visit(child, next, s, [...stack,e.blockName]);
          }
          for (const attr of e.attribs || []) visit({ ...e, ...attr, type: "TEXT", widthFactor: 1, hAlign: 0, vAlign: 0, generationFlags: 0 }, m, s, stack);
          addWarning("블록은 개별 편집 객체로 분해합니다.", diagnostic("blocks-exploded")); return;
        }
        if (e.type === "DIMENSION") {
          const type=e.dimType & 7;
          const ds=document.dimStyles?.get(e.dimStyle) || {};
          const scale=Math.hypot(m[0],m[1]);
          const native={...s,type:"dimension",dimScale:(ds.dimScale || 1)*scale,textSize:ds.textSize || 2.5,arrowSize:ds.arrowSize ?? 2.5,extensionGap:ds.extensionGap ?? 1,extensionOvershoot:ds.extensionOvershoot ?? 2,precision:ds.precision ?? 2,unit:"",textGap:ds.textGap,measurementFactor:ds.measurementFactor ?? 1,zeroSuppression:ds.zeroSuppression || 0};
          if (Number.isFinite(e.explicitTextRotation)) { const angle=e.explicitTextRotation*Math.PI/180; native.textRotation=Math.atan2(-(m[1]*Math.cos(angle)+m[3]*Math.sin(angle)),m[0]*Math.cos(angle)+m[2]*Math.sin(angle)); }
          const override=plainText(e.textOverride || ""), post=plainText(ds.post || "");
          if (override && override !== "<>") native.text=override;
          if (post && post !== "<>") native.post=post;
          if ([0,1].includes(type) && validPoint(e.defPoint2) && validPoint(e.defPoint3)) {
            const a=transform(e.defPoint2,m),b=transform(e.defPoint3,m),d=transform(e.defPoint,m);
            const angle=type===1 ? Math.atan2(b.y-a.y,b.x-a.x) : Math.atan2(-(m[1]*Math.cos(e.rotation*Math.PI/180)+m[3]*Math.sin(e.rotation*Math.PI/180)),m[0]*Math.cos(e.rotation*Math.PI/180)+m[2]*Math.sin(e.rotation*Math.PI/180));
            add({...native,kind:type===1?"aligned":Math.abs(Math.cos(angle))<1e-8?"vertical":"horizontal",a,b,axisAngle:angle,offset:(d.x-a.x)*-Math.sin(angle)+(d.y-a.y)*Math.cos(angle)});
            return;
          }
          const uniform=Math.abs(Math.hypot(m[0],m[1])-Math.hypot(m[2],m[3]))<1e-8 && Math.abs(m[0]*m[2]+m[1]*m[3])<1e-8;
          if ([3,4].includes(type) && uniform && validPoint(e.defPoint4)) {
            const p=transform(e.defPoint,m),rim=transform(e.defPoint4,m),center=type===4?p:{x:(p.x+rim.x)/2,y:(p.y+rim.y)/2};
            const radius=Math.hypot(rim.x-center.x,rim.y-center.y),distance=radius+Math.max(0,e.leaderLength || 0)*scale;
            add({...native,kind:type===4?"radius":"diameter",center,radius,placement:{x:center.x+(rim.x-center.x)*distance/radius,y:center.y+(rim.y-center.y)*distance/radius}});
            return;
          }
          if (type===5 && uniform && validPoint(e.defPoint2) && validPoint(e.defPoint3) && validPoint(e.defPoint4)) {
            const a=transform(e.defPoint2,m),b=transform(e.defPoint3,m),center=transform(e.defPoint4,m),arc=transform(e.defPoint,m);
            add({...native,kind:"angular",a,b,center,offset:Math.hypot(arc.x-center.x,arc.y-center.y),clockwise:m[0]*m[3]-m[1]*m[2]<0});return;
          }
          const block = document.blocks.get(e.blockName);
          if (block && !stack.includes(e.blockName) && stack.length < 32) { for (const child of block.entities) visit(child,m,s,[...stack,e.blockName]); report.approximated++; addWarning("기존 CAD 치수는 표시 형상을 개별 객체로 가져옵니다. 새 치수는 치수 도구로 작성합니다.", diagnostic("dimensions-exploded")); return; }
          if ((e.dimType & 7) === 1 && validPoint(e.defPoint2) && validPoint(e.defPoint3)) {
            const a = transform(e.defPoint2,m), b = transform(e.defPoint3,m), d = transform(e.defPoint,m), len = Math.hypot(b.x-a.x,b.y-a.y);
            add({ ...s, type: "dimension", a,b,offset: ((d.x-a.x)*-(b.y-a.y)+(d.y-a.y)*(b.x-a.x))/len, textSize: 2.5, text: plainText(e.textOverride).replace(/<>/g, `${Math.round(len*1000)/1000}`) || undefined }); return;
          }
          skip("DIMENSION", "표시 블록이 없는 비정렬 치수는 생략합니다.", diagnostic("dimension-skipped")); return;
        }
        if (e.type === "LINE") add({ ...s, type: "line", a: transform(e.start,m), b: transform(e.end,m) });
        else if (["LWPOLYLINE","POLYLINE"].includes(e.type)) {
          poly(bulgePoints(e.vertices.map(v => e.elevation ? {...v,z:e.elevation} : v),e.closed),e.closed,m,s);
          if (e.vertices.some(v => Math.abs(v.bulge || 0) > 1e-10)) { report.approximated++; addWarning("곡선 폴리선 / 타원 / 비균일 축척의 원은 편집 가능한 폴리선으로 근사합니다.", diagnostic("curve-approximated")); }
          if (e.is3d) addWarning("3D 폴리선의 Z 좌표를 보존하며 화면에는 XY 평면으로 투영합니다.", diagnostic("polyline-projected"));
        } else if (["CIRCLE","ARC"].includes(e.type)) {
          if (!validPoint(e.center) || !finite(e.radius) || e.radius <= 1e-8) throw invalid("circle-radius", "원 반지름이 올바르지 않습니다.");
          const sx = Math.hypot(m[0],m[1]), sy = Math.hypot(m[2],m[3]), orthogonal = Math.abs(m[0]*m[2]+m[1]*m[3]) < 1e-8*Math.max(1,sx*sy);
          const start = e.type === "ARC" ? e.startAngle*Math.PI/180 : 0, end = e.type === "ARC" ? e.endAngle*Math.PI/180 : TAU;
          if (![start,end].every(finite)) throw invalid("arc-angle", "원호 각도가 올바르지 않습니다.");
          if (Math.abs(sx-sy) < 1e-8*Math.max(1,sx,sy) && orthogonal) {
            const common = { ...s, type: e.type.toLowerCase(), center: transform(e.center,m), radius: e.radius*sx };
            const angle = t => Math.atan2(-(m[1]*Math.cos(t)+m[3]*Math.sin(t)),m[0]*Math.cos(t)+m[2]*Math.sin(t));
            add(e.type === "ARC" ? { ...common,startAngle: angle(start),endAngle: angle(end),clockwise: m[0]*m[3]-m[1]*m[2] < 0 } : common);
          } else ellipse({ center:e.center,majorAxis:{x:e.radius,y:0},minorRatio:1,startParam:start,endParam:end },m,s);
        } else if (e.type === "ELLIPSE") ellipse(e,m,s);
        else if (e.type === "SPLINE") spline(e,m,s);
        else if (["TEXT","MTEXT"].includes(e.type)) {
          const text = plainText(e.text), size = e.height*Math.hypot(m[2],m[3]);
          if (!text.trim() || !finite(size) || size <= 0) throw invalid("text-content-size", "문자 내용 / 크기가 올바르지 않습니다.");
          const rotation = e.textDirection ? Math.atan2(e.textDirection.y,e.textDirection.x) : e.rotation*Math.PI/180;
          if (!finite(rotation)) throw invalid("text-rotation", "문자 회전이 올바르지 않습니다.");
          const dir = { x:m[0]*Math.cos(rotation)+m[2]*Math.sin(rotation), y:-(m[1]*Math.cos(rotation)+m[3]*Math.sin(rotation)) };
          let p = transform(e.alignmentPoint && (e.hAlign || e.vAlign) ? e.alignmentPoint : e.insertionPoint,m);
          const angle = Math.atan2(dir.y,dir.x), width = Math.max(...text.split("\n").map(v => Array.from(v).length))*size*0.7;
          const horizontal = e.type === "MTEXT" ? (e.attachmentPoint-1)%3 : (e.hAlign === 1 || e.hAlign === 4) ? 1 : e.hAlign === 2 ? 2 : 0;
          p = { x:p.x-Math.cos(angle)*width*horizontal/2, y:p.y-Math.sin(angle)*width*horizontal/2 };
          if (e.type === "MTEXT") p = { x:p.x-Math.sin(angle)*size, y:p.y+Math.cos(angle)*size };
          add({ ...s,type:"text",point:p,text,textSize:size,rotation:angle });
          if (e.type === "MTEXT" || e.widthFactor !== 1 || e.obliqueAngle || e.generationFlags || e.hAlign || e.vAlign) { report.approximated++; addWarning("문자 서식 / 글꼴 / 정렬은 기본 문자로 근사합니다.", diagnostic("text-approximated")); }
        } else if (["SOLID","TRACE","3DFACE"].includes(e.type)) {
          const p = [...e.points]; if (e.type !== "3DFACE" && p.length === 4) [p[2],p[3]] = [p[3],p[2]];
          poly(p,true,m,s); report.approximated++; addWarning("솔리드 / 해치 채움은 윤곽선으로 가져옵니다.", diagnostic("fill-outlined"));
        } else if (e.type === "HATCH") {
          if (!e.boundaryPaths.length) throw invalid("hatch-boundary", "해치 경계가 없습니다.");
          const before = entities.length;
          for (const boundary of e.boundaryPaths) {
            if (boundary.type === "polyline") poly(bulgePoints(boundary.vertices.map((v,i)=>({...v,bulge:boundary.bulges?.[i] || 0})),!!boundary.isClosed),!!boundary.isClosed,m,s);
            else for (const edge of boundary.edges || []) {
              if (edge.type === "line") add({ ...s,type:"line",a:transform(edge.start,m),b:transform(edge.end,m) });
              else if (edge.type === "arc") visit({ ...e,...edge,type:"ARC",startAngle:edge.ccw ? edge.startAngle : edge.endAngle,endAngle:edge.ccw ? edge.endAngle : edge.startAngle },m,inherited,stack);
              else if (edge.type === "ellipse") ellipse({ ...edge,startParam:edge.startAngle,endParam:edge.endAngle },m,s);
              else skip("HATCH SPLINE","스플라인 해치 경계는 생략합니다.", diagnostic("hatch-spline-skipped"));
            }
          }
          if (before === entities.length) throw invalid("hatch-visible-boundary", "표시 가능한 해치 경계가 없습니다.");
          report.approximated++; addWarning("솔리드 / 해치 채움은 윤곽선으로 가져옵니다.", diagnostic("fill-outlined"));
        } else skip(e.type,"지원하지 않는 객체는 보고서에 표시하고 생략합니다.", diagnostic("unsupported-skipped"));
      } catch (error) {
        if (error?.name === "AbortError" || error?.name === "CadImportError" && error.diagnostic?.namespace === "cad-import" && error.diagnostic.code === "entity-limit" && Number.isSafeInteger(error.diagnostic.limit) && error.diagnostic.limit > 0) throw error;
        const message = typeof error?.message === "string" ? error.message : String(error);
        const reason = error?.name === "CadImportError" && error.diagnostic?.namespace === "cad-import" ? error.diagnostic : message;
        skip(e.type,`${e.type}: ${message}`, diagnostic("entity-skipped", { entityType: e.type, reason }));
      }
    }
    for (const e of document.entities) visit(e,IDENTITY);
    if (!entities.length) throw failure("no-editable-entities", "편집 가능한 2D 객체가 없습니다. 원래 도면은 그대로 유지됩니다.");
    if (layers.length > 256) throw failure("layer-limit", "레이어가 256개를 초과합니다. 필요한 레이어만 분리해 주세요.", { limit: 256 });
    const unit = ({4:"mm",5:"cm",6:"m"})[document.header?.insUnits] ?? "";
    if (!unit) addWarning("도면 단위가 mm / cm / m로 지정되지 않아 단위 없는 좌표로 가져옵니다.", diagnostic("unit-unspecified"));
    const linetypes = [...document.lineTypes.values()].map((entry) => ({ name: entry.name, description: entry.description || "", pattern: entry.pattern || [] }));
    const state = Tool.core.cadEngine.normalizeState({ version:1,entities,layers,linetypes,selectedIds:[],settings:{ unit,layer:"0" } });
    if (state.entities.length !== entities.length) throw failure("imported-invalid", "가져온 도면 검증에 실패했습니다.");
    report.imported = state.entities.length;
    report.unsupported = [...missing].map(([type,count])=>({type,count}));
    report.warnings = [...warnings.keys()];
    report.warningDiagnostics = [...warnings.values()];
    return { state,report };
  }
  function convertDwg(buffer, { signal,timeoutMs = 90000 } = {}) {
    check(signal);
    if (typeof Worker !== "function" || typeof WebAssembly !== "object") return Promise.reject(failure("dwg-browser-unavailable", "DWG 읽기를 지원하는 Chrome 또는 Edge에서 실행해 주세요."));
    const assets = globalThis.CadOfflineAssets;
    if (!assets?.workerSource || !assets.wasmBase64) return Promise.reject(failure("dwg-engine-unavailable", "DWG 엔진을 불러오지 못했습니다. HanCAD 앱을 다시 실행하거나 최신 버전으로 빌드해 주세요."));
    return new Promise((resolve,reject) => {
      let worker,url,timer,done = false;
      const finish = (error,value) => {
        if (done) return; done = true;
        clearTimeout(timer); signal?.removeEventListener("abort",cancel);
        worker?.terminate(); if (url) URL.revokeObjectURL(url);
        error ? reject(error) : resolve(value);
      };
      const cancel = () => finish(abort());
      try {
        const wasmBinary = Uint8Array.from(atob(assets.wasmBase64),c=>c.charCodeAt(0));
        url = URL.createObjectURL(new Blob([assets.workerSource],{type:"text/javascript"}));
        worker = new Worker(url,{name:"local-dwg-reader"});
        worker.onmessage = event => { if (event.data?.ok) finish(null,event.data.dxf); else { const detail = String(event.data?.message || "").slice(0,200); finish(failure("dwg-decode-failed", `DWG 해석에 실패했습니다. 파일 버전 / 손상 여부를 확인해 주세요. ${detail}`, { detail })); } };
        worker.onerror = event => { event.preventDefault?.(); const detail = String(event.message || ""); finish(failure("dwg-engine-failed", `DWG 엔진 오류: ${detail || "작업 중단"}`, { detail })); };
        timer = setTimeout(()=>finish(failure("dwg-timeout", "DWG 읽기 제한 시간을 초과했습니다. 필요한 영역만 분리한 파일로 다시 시도해 주세요.")),Math.min(600000,Math.max(100,Number(timeoutMs) || 90000)));
        signal?.addEventListener("abort",cancel,{once:true}); check(signal);
        worker.postMessage({buffer,wasmBinary},[buffer,wasmBinary.buffer]);
      } catch (error) { finish(error); }
    });
  }
  async function read(file, options = {}) {
    check(options.signal);
    if (!file || typeof file.arrayBuffer !== "function" || !file.size || file.size > MAX_BYTES) throw failure("file-size", "64 MB 이하의 DWG / DXF 파일을 선택해 주세요.");
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    if (!["dwg","dxf"].includes(extension)) throw failure("file-extension", "DWG 또는 DXF 파일만 가져올 수 있습니다.");
    progress(options, "file-reading", "파일 읽는 중");
    const buffer = await file.arrayBuffer(); check(options.signal);
    let text,version = "";
    if (extension === "dwg") {
      version = new TextDecoder().decode(new Uint8Array(buffer,0,Math.min(6,buffer.byteLength)));
      if (!/^AC10\d{2}$/.test(version)) throw failure("dwg-signature", "DWG 파일 서명이 올바르지 않습니다.");
      if (!["AC1012","AC1014","AC1015","AC1018","AC1021","AC1024","AC1027","AC1032"].includes(version)) throw failure("dwg-version", "R13 ~ R2018 형식의 DWG를 지원합니다. CAD에서 해당 형식으로 다시 저장해 주세요.", { version });
      progress(options, "dwg-converting", "DWG 해석 중 (오프라인)"); text = await convertDwg(buffer,options);
    } else text = decodeDxf(buffer);
    check(options.signal); progress(options, "entities-importing", "2D 객체 가져오는 중");
    await new Promise(resolve=>setTimeout(resolve,0)); check(options.signal);
    validateDxf(text);
    if (!globalThis.CadDxf?.parseDxf) throw failure("dxf-engine-unavailable", "DXF 해석 엔진을 찾을 수 없습니다.");
    const document = attachDimStyles(text,globalThis.CadDxf.parseDxf(text));
    progress(options, "entities-preparing", `원본 객체 ${document.entities.length.toLocaleString()}개 · 도면층 ${document.layers.size.toLocaleString()}개 · 블록 ${document.blocks.size.toLocaleString()}개: 표시할 객체 준비 중`, { sourceEntities: document.entities.length, layers: document.layers.size, blocks: document.blocks.size });
    await new Promise(resolve=>setTimeout(resolve,0)); check(options.signal);
    const result = convertDocument(document,{...options,format:extension.toUpperCase(),version});
    if (extension === "dwg") { result.report.warnings.unshift("DWG는 LibreDWG로 읽습니다. 프록시 / 전문 3D 객체 일부는 변환 엔진에서 누락될 수 있습니다."); result.report.warningDiagnostics.unshift(diagnostic("dwg-lossy")); }
    check(options.signal); return result;
  }
  Tool.core.cadImporters = Object.freeze({ read,parseDxf(text,options={}) { validateDxf(text);return convertDocument(attachDimStyles(text,globalThis.CadDxf.parseDxf(text)),options); },convertDocument });
})(window.HeechangTool);
