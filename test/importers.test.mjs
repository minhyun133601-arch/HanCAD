import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker as Thread } from 'node:worker_threads';
import test from 'node:test';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
function setup(extra = {}) {
  const context = vm.createContext({ console,TextDecoder,TextEncoder,ArrayBuffer,Uint8Array,WebAssembly,Blob,URL,setTimeout,clearTimeout,AbortController,atob, ...extra });
  context.window = context;
  context.HeechangTool = {core:{}};
  vm.runInContext(source('packages/legacy-bridge/runtime/cad-engine.js'),context);
  vm.runInContext(source('vendor/cad-dxf.js'),context);
  vm.runInContext(source('packages/legacy-bridge/runtime/cad-importers.js'),context);
  return context;
}
const record = (type, tags = []) => [0,type,...tags].join('\n')+'\n';
const dxf = (body, more = '') => record('SECTION',[2,'HEADER',9,'$INSUNITS',70,4])+record('ENDSEC')+more+record('SECTION',[2,'ENTITIES'])+body+record('ENDSEC')+record('EOF');
const namedFile = (text,name='drawing.dxf') => { const file = new Blob([text]);file.name=name;return file; };
const plain = value => JSON.parse(JSON.stringify(value));
test('DXF imports editable geometry, colors, units and clockwise conversion', async () => {
  const ctx=setup();
  const input=dxf(record('LINE',[8,'walls',420,0x12ab34,10,10,20,20,11,40,21,50])+record('ARC',[10,0,20,0,40,10,50,0,51,90])+record('TEXT',[10,3,20,4,40,2.5,1,'한글 \\U+00B0',50,90]));
  const {state,report}=await ctx.HeechangTool.core.cadImporters.read(namedFile(input));
  assert.equal(state.entities.length,3);
  assert.deepEqual(plain(state.entities[0].a),{x:10,y:-20});
  assert.equal(state.entities[0].color,'#12ab34');
  assert.equal(state.settings.unit,'mm');
  const arc=state.entities[1];assert.equal(arc.clockwise,false);assert.equal(arc.endAngle,-Math.PI/2);
  assert.match(state.entities[2].text,/한글 °/);assert.equal(state.entities[2].rotation,-Math.PI/2);
  assert.equal(report.skipped,0);
});
test('DXF polyline bulges retain the exact semicircle, including closure', () => {
  const ctx=setup();
  const {state,report}=ctx.HeechangTool.core.cadImporters.parseDxf(dxf(record('LWPOLYLINE',[70,1,10,0,20,0,42,1,10,10,20,0,10,10,20,10])));
  const poly=state.entities[0];assert.equal(poly.closed,true);assert.equal(poly.points.length,3);
  assert.deepEqual(plain(poly.bulges),[-1,0,0]);
  // Positive bulge travels counterclockwise along the lower world semicircle.
  assert.equal(ctx.HeechangTool.core.cadEngine.bounds(poly).maxY,5);
  assert.equal(ctx.HeechangTool.core.cadEngine.hitTest([poly],{x:5,y:5},1e-8)?.id,poly.id);
  assert.equal(report.approximated,0);
});
test('nested INSERT transforms, inherited layer/color, off/locked layer and dimensions', () => {
  const ctx=setup();
  const table=record('SECTION',[2,'TABLES'])+record('TABLE',[2,'LAYER'])+record('LAYER',[2,'fixture',62,-3,70,4])+record('ENDTAB')+record('ENDSEC');
  const blocks=record('SECTION',[2,'BLOCKS'])+record('BLOCK',[2,'piece',10,1,20,1])+record('LINE',[62,0,10,1,20,1,11,3,21,1])+record('ENDBLK')+record('BLOCK',[2,'outer',10,0,20,0])+record('INSERT',[2,'piece',62,0,10,10,20,0,41,2,42,2,50,90])+record('ENDBLK')+record('BLOCK',[2,'*D1',10,0,20,0])+record('LINE',[10,0,20,0,11,30,21,0])+record('TEXT',[10,10,20,2,40,2,1,'30'])+record('ENDBLK')+record('ENDSEC');
  const {state,report}=ctx.HeechangTool.core.cadImporters.parseDxf(dxf(record('INSERT',[2,'outer',8,'fixture',62,1,10,100,20,50])+record('DIMENSION',[2,'*D1',70,1]),table+blocks));
  assert.deepEqual(plain(state.entities[0].a),{x:110,y:-50});
  assert.deepEqual(plain(state.entities[0].b),{x:110,y:-54});
  assert.equal(state.entities[0].layer,'fixture');assert.equal(state.entities[0].color.toLowerCase(),'#ff0000');
  assert.equal(state.layers.find(l=>l.name==='fixture').visible,false);assert.equal(state.layers.find(l=>l.name==='fixture').locked,true);
  assert.equal(state.entities.length,3);assert.ok(report.warnings.some(v=>v.includes('치수')));
});
test('nonuniform scaled circles become finite elliptical polylines and unsupported objects are reported', () => {
  const ctx=setup();
  const blocks=record('SECTION',[2,'BLOCKS'])+record('BLOCK',[2,'round',10,0,20,0])+record('CIRCLE',[10,0,20,0,40,10])+record('ENDBLK')+record('ENDSEC');
  const {state,report}=ctx.HeechangTool.core.cadImporters.parseDxf(dxf(record('INSERT',[2,'round',41,2,42,1])+record('ACAD_PROXY_ENTITY',[10,0,20,0]),blocks));
  assert.equal(state.entities[0].type,'polyline');assert.ok(state.entities[0].points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  assert.ok(Math.max(...state.entities[0].points.map(p=>p.x))>19.99);
  assert.deepEqual(plain(report.unsupported),[{type:'ACAD_PROXY_ENTITY',count:1}]);assert.equal(report.skipped,1);
});
test('malformed numeric DXF and empty/unsupported drawings reject without state mutation', async () => {
  const ctx=setup(), importer=ctx.HeechangTool.core.cadImporters;
  await assert.rejects(importer.read(namedFile(dxf(record('LINE',[10,'NaN',20,1,11,3,21,4])))),/숫자/);
  await assert.rejects(importer.read(namedFile(dxf(record('LINE',[10,'0xff',20,1,11,3,21,4])))),/숫자/);
  assert.throws(()=>importer.parseDxf(dxf(record('3DSOLID'))),/2D 객체/);
  assert.throws(()=>importer.parseDxf(dxf(record('LINE',[10,0,20,0,11,1,21,1])).replace('EOF','BROKEN')),/EOF/);
  const controller=new AbortController();controller.abort();await assert.rejects(importer.read(namedFile(''),{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(importer.read(namedFile('AC9999junk','bad.dwg')),/서명/);
});
test('cyclic blocks are reported, and excessive block arrays are rejected as omissions', () => {
  const ctx=setup();
  const blocks=record('SECTION',[2,'BLOCKS'])+record('BLOCK',[2,'loop'])+record('INSERT',[2,'loop'])+record('ENDBLK')+record('ENDSEC');
  const {report}=ctx.HeechangTool.core.cadImporters.parseDxf(dxf(record('LINE',[10,0,20,0,11,10,21,10])+record('INSERT',[2,'loop'])+record('INSERT',[2,'loop',70,10001]),blocks));
  assert.equal(report.skipped,2);assert.ok(report.warnings.some(v=>v.includes('순환')));
});
test('all six native DIMENSION kinds round-trip through DXF with editable styles and measurements', () => {
  const ctx=setup();vm.runInContext(source('packages/legacy-bridge/runtime/cad-exporters.js'),ctx);
  const engine=ctx.HeechangTool.core.cadEngine;
  const common={type:'dimension',dimScale:1.6,textSize:4.2,arrowSize:2.2,extensionGap:0.3,extensionOvershoot:1.2,precision:3,unit:'mm',color:'#12ab34'};
  const dimensions=[
    {...common,kind:'aligned',a:{x:0,y:0},b:{x:30,y:-40},offset:17},
    {...common,kind:'horizontal',a:{x:0,y:0},b:{x:40,y:-30},offset:-21},
    {...common,kind:'vertical',a:{x:0,y:0},b:{x:40,y:-30},offset:24},
    {...common,kind:'radius',center:{x:40,y:20},radius:10,placement:{x:64,y:38}},
    {...common,kind:'diameter',center:{x:80,y:40},radius:15,placement:{x:60,y:25}},
    {...common,kind:'angular',center:{x:0,y:0},a:{x:80,y:0},b:{x:0,y:-80},offset:25,clockwise:false,unit:''},
    {...common,kind:'angular',center:{x:0,y:0},a:{x:80,y:0},b:{x:0,y:-80},offset:35,clockwise:true,unit:''},
  ];
  const state=engine.normalizeState({entities:dimensions});
  const text=ctx.HeechangTool.core.cadExporters.toDxf(state);
  const imported=ctx.HeechangTool.core.cadImporters.parseDxf(text);
  assert.equal(imported.report.skipped,0);assert.equal(imported.state.entities.length,dimensions.length);
  state.entities.forEach((before,i)=>{
    const after=imported.state.entities[i];assert.equal(after.type,'dimension');assert.equal(after.kind,before.kind);
    for(const key of ['precision','dimScale','textSize','arrowSize','extensionGap','extensionOvershoot']) assert.ok(Math.abs(after[key]-before[key])<1e-7,`${before.kind} ${key}`);
    const b=engine.dimensionGeometry(before),a=engine.dimensionGeometry(after);
    assert.ok(Math.abs(a.measurement-b.measurement)<1e-5,`${before.kind} ${a.measurement} versus ${b.measurement}`);
    assert.equal(a.label,b.label);assert.equal(a.arrowSize,b.arrowSize);assert.equal(a.textSize,b.textSize);
  });
});
test('DWG worker failure, timeout and cancellation dispose worker and object URL', async () => {
  for(const outcome of ['error','timeout','cancel']) {
    let terminated=0,revoked=0;
    class Worker { postMessage() { if(outcome==='error') setTimeout(()=>this.onmessage({data:{ok:false,message:'corrupt'}}),0); } terminate(){terminated++;} }
    const ctx=setup({Worker,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{revoked++;}}});
    ctx.CadOfflineAssets={workerSource:'test',wasmBase64:'AA=='};
    const controller=new AbortController();
    const promise=ctx.HeechangTool.core.cadImporters.read(namedFile('AC1015junk','broken.dwg'),{signal:controller.signal,timeoutMs:100});
    if(outcome==='cancel') setTimeout(()=>controller.abort(),10);
    await assert.rejects(promise,error=>{
      assert.equal(error.name,outcome==='cancel'?'AbortError':'CadImportError');
      assert.equal(error.diagnostic.namespace,'cad-import');
      assert.equal(error.diagnostic.code,{error:'dwg-decode-failed',timeout:'dwg-timeout',cancel:'cancelled'}[outcome]);
      if(outcome==='error') assert.equal(error.diagnostic.detail,'corrupt');
      return true;
    });
    assert.equal(terminated,1);assert.equal(revoked,1);
  }
});
test('entity capacity propagation uses its identity even with English fallback and external phrases are not fatal', () => {
  const ctx=setup(), original=ctx.HeechangTool.core.cadEngine;
  const input=dxf(record('LINE',[10,0,20,0,11,10,21,10])+record('CIRCLE',[10,0,20,0,40,1]));
  ctx.HeechangTool.core.cadEngine={...original,normalizeEntity(raw){
    if(raw.type==='circle') throw Object.assign(new Error('Entity capacity exceeded'),{name:'CadImportError',diagnostic:{namespace:'cad-import',code:'entity-limit',limit:1}});
    return original.normalizeEntity(raw);
  }};
  assert.throws(()=>ctx.HeechangTool.core.cadImporters.parseDxf(input),error=>error.message==='Entity capacity exceeded'&&error.diagnostic.code==='entity-limit');
  ctx.HeechangTool.core.cadEngine={...original,normalizeEntity(raw){
    if(raw.type==='circle') throw new Error('초과합니다: arbitrary external detail');
    return original.normalizeEntity(raw);
  }};
  const {report}=ctx.HeechangTool.core.cadImporters.parseDxf(input);
  assert.equal(report.imported,1);assert.equal(report.skipped,1);
  assert.deepEqual(plain(report.warningDiagnostics[0]),{namespace:'cad-import',code:'entity-skipped',entityType:'CIRCLE',reason:'초과합니다: arbitrary external detail'});
});
test('real official LibreDWG DWG fixture converts offline and imports editable entities', {timeout:90000}, async () => {
  const blobs=new Map();let next=0,terminated=0;
  class OfflineWorker {
    constructor(url) {
      this.ready=blobs.get(url).text().then(script=>{
        this.thread=new Thread(`const {parentPort}=require('node:worker_threads');globalThis.process=undefined;globalThis.self=globalThis;self.postMessage=d=>parentPort.postMessage(d);\n${script}\nparentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
        this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.({message:error.message}));
      });
    }
    postMessage(data,transfer){this.ready.then(()=>this.thread.postMessage(data,transfer));}
    terminate(){terminated++;this.ready.then(()=>this.thread.terminate());}
  }
  const ctx=setup({Worker:OfflineWorker,URL:{createObjectURL:blob=>{const url=`blob:${++next}`;blobs.set(url,blob);return url;},revokeObjectURL:url=>blobs.delete(url)}});
  ctx.CadOfflineAssets={workerSource:source('vendor/cad-dwg-worker.js'),wasmBase64:fs.readFileSync(path.join(root,'vendor/cadview-dwg/package/dist/libredwg.wasm')).toString('base64')};
  const file=namedFile(fs.readFileSync(path.join(root,'vendor/example_2000.dwg')),'example_2000.dwg');
  const {state,report}=await ctx.HeechangTool.core.cadImporters.read(file);
  console.log(`Official DWG fixture: ${report.imported} editable entities, ${report.skipped} skipped, ${report.approximated} approximated. Types: ${[...new Set(state.entities.map(e=>e.type))].join(', ')}`);
  assert.equal(report.format,'DWG');assert.equal(report.version,'AC1015');assert.ok(state.entities.length>50);
  assert.ok(state.entities.some(e=>e.type==='line'));assert.ok(state.entities.some(e=>e.type==='text'));
  assert.equal(report.imported,71);assert.equal(report.skipped,133);assert.equal(report.approximated,17);
  const retained=state.entities.find(e=>e.type==='polyline'&&e.layer==='Tavolo 3'&&e.points.length===3635);
  assert.ok(retained,'LWPOLYLINE handle 75B must remain an exact bulged polyline instead of exceeding the tessellated-point limit');
  assert.equal(retained.closed,true);assert.equal(retained.bulges.length,3635);
  assert.ok(retained.bulges.every(value=>Math.abs(value+0.52056705)<1e-10));
  assert.ok(retained.points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));

  assert.equal(terminated,1);assert.equal(blobs.size,0);
});
