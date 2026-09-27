import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadDesignLibrary, designContext, pixelArtMethod, chestContext, boundedJson, validateLock, validateDesignLibrary, safeRelative, cachePath, storePinned, fetchPinned, hash, ROOT, contrast } from '../tools/_lib/design-library.mjs';

const db=await loadDesignLibrary();validateLock(db.lock);
for(const topic of db.chest.topics) {
  const card=chestContext(db,{topic:topic.id});
  assert.equal(card.runtimeVerified,false);
  assert.deepEqual(card.sources.map(s=>s.id).sort(),[...topic.sourceIds].sort());
  assert.deepEqual(JSON.parse(boundedJson(card,6000)),card);
  assert.equal(card.pathScope,'upstream');
  assert.ok(!Object.hasOwn(card,'methods')&&!Object.hasOwn(card,'style'),'One chest query excludes pixel workflows and style cards');
}
assert.throws(()=>chestContext(db,{topic:'missing'}),/Unknown chest topic/);
for(const mutation of [d=>d.chest.topics.push(d.chest.topics[0]),d=>d.chest.topics[0].evidence[0].sha256='0'.repeat(64),d=>d.chest.topics[0].sourceIds=['unknown'],d=>d.chest.runtimeVerified=true,d=>d.chest.topics[0].transport='inventory']) {
  const changed=structuredClone(db); mutation(changed); assert.throws(()=>validateDesignLibrary(changed));
}
assert.equal(db.styles.length,6);
for(const style of db.styles){
  const value=designContext(db,{style:style.id,role:'inventory',input:'touch'});
  assert.equal(value.decisionStatus,'authored-proposal');
  assert.ok(value.checks.some(x=>x.includes('hover')));
  assert.ok(contrast(style.palette.text,style.palette.surface)>=4.5,'Proposed body color must remain readable on its opaque surface');
  assert.ok(JSON.parse(boundedJson(value)).sources.every(s=>s.license&&s.revision&&s.reuse&&s.runtime==='unverified'));
}
assert.equal(designContext(db,{style:'아기자기'}).style.id,'cozy-vanilla-16');
assert.equal(designContext(db,{style:'Cozy16'}).style.id,'cozy-vanilla-16');
const mixed=designContext(db,{style:'cozy',role:'inventory,shop',input:'mixed'});
assert.ok(mixed.checks.some(c=>c.includes('잔액')));
assert.ok(mixed.checks.some(c=>c.includes('첫 초점')));
assert.ok(mixed.checks.some(c=>c.includes('손가락')));
assert.ok(mixed.patterns.some(p=>p.id==='chest-form-fixed-slot-index'));
assert.ok(!mixed.patterns.some(p=>p.sourceId==='islocal-chest-gui'));
assert.deepEqual(Object.keys(mixed),['schema','reviewedAt','decisionStatus','style','role','input','paletteCheck','checks','patterns','sources','optionalReference','boundary']);
assert.ok(!Object.hasOwn(mixed,'methods')&&!JSON.stringify(mixed).includes('mcbe-pixel-art-method'),'Optional workflows stay out of ordinary style context');
assert.ok(!Object.hasOwn(mixed,'chest')&&!mixed.sources.some(s=>s.id==='minato-web-apps-chest-ui-editor'),'Native chest research stays out of ordinary style context');
assert.deepEqual(designContext(db,{style:' cozy16 ',role:'inventory, shop'}).checks,mixed.checks);
for(const args of [{style:'unknown'},{style:'cozy',role:'webpage'},{style:'cozy',input:'vr'},{style:'cozy',limit:99}])assert.throws(()=>designContext(db,args));
const oversized={sources:[{license:'retained'}],patterns:[{summary:'x'.repeat(3000)},{summary:'y'.repeat(3000)}]};
const bounded=JSON.parse(boundedJson(oversized,1500));assert.equal(bounded.omittedPatterns,2);assert.equal(bounded.sources[0].license,'retained');
assert.throws(()=>boundedJson({sources:['x'.repeat(3000)]},1500),/BUDGET/);
const exactBudget={value:'x'.repeat(1488)};
assert.equal(JSON.stringify(exactBudget).length,1500);
assert.throws(()=>boundedJson(exactBudget,1500),/requires 1501/);
assert.equal(boundedJson(exactBudget,1501).length+1,1501);
// A smaller context keeps all required style provenance, not sources belonging only to omitted cards.
const compact=JSON.parse(boundedJson(mixed,2600));
assert.equal(compact.patterns.length,0);assert.equal(compact.omittedPatterns,mixed.patterns.length);
assert.deepEqual(compact.sources.map(s=>s.id).sort(),[...mixed.style.sources].sort());
assert.ok(compact.sources.every(s=>s.license&&s.revision&&s.reuse));
assert.equal(mixed.patterns.length,2,'Budgeting must not mutate the caller context');
assert.throws(()=>contrast('#XYZXYZ','#FFFFFF'),/RRGGBB/);
assert.deepEqual(db.methods.methods.map(m=>m.id),['ui-kit-spec-first','palette-and-clusters','sprite-animation','atlas-nine-slice']);
for(const method of db.methods.methods) {
  for(const style of [undefined,'Cozy16']) {
    const context=pixelArtMethod(db,{method:method.id,style});
    assert.equal(context.runtime,'unverified');assert.equal(context.decisionStatus,'authored-adaptation');
    assert.deepEqual(context.method,method);
    assert.equal(Object.hasOwn(context,'style'),style!==undefined);
    assert.ok(!Object.hasOwn(context,'checks')&&!Object.hasOwn(context,'patterns'),'Method cards must not pull in unrelated game checks');
    const expected=new Set([...method.sourceIds,...(context.style?.sources??[])]);
    assert.deepEqual(context.sources.map(s=>s.id).sort(),[...expected].sort());
    assert.ok(context.sources.every(s=>s.license&&s.revision&&s.reuse&&s.runtime==='unverified'));
    for(const source of context.sources)if(db.sources.find(s=>s.id===source.id).evidence){assert.deepEqual(source.evidence,db.sources.find(s=>s.id===source.id).evidence);assert.equal(source.pathScope,'upstream');}
    assert.deepEqual(JSON.parse(boundedJson(context)),context);
    if(style)assert.deepEqual(context.style,designContext(db,{style,limit:0}).style);
  }
}
for(const args of [{},{method:'unknown'},{method:'ui-kit-spec-first',style:'unknown'},{method:'ui-kit-spec-first',style:''}])assert.throws(()=>pixelArtMethod(db,args),/Unknown (method|style)/);
const longMethod=pixelArtMethod(db,{method:'ui-kit-spec-first'});
longMethod.method=structuredClone(longMethod.method);longMethod.method.steps.push('x'.repeat(2000));
assert.throws(()=>boundedJson(longMethod,1500),/BUDGET/,'Mandatory steps, sources and limits cannot be silently truncated');
for(const bad of ['../escape','a/../../b','/absolute','C:/absolute','a\\b','a//b','a/..','a/nul.json','a/dir.','a/file:stream'])assert.throws(()=>safeRelative(bad));
const fixture=structuredClone(db.lock.slice(0,1));fixture[0].files[0].url='https://example.com/script.js';assert.throws(()=>validateLock(fixture),/origin/);
// A valid hash must not permit attribution to the wrong repository/path or colliding Windows paths.
for(const [label,mutate,expected] of [
  ['wrong repository',s=>{s.files[0].url=s.files[0].url.replace('/Mojang/bedrock-samples/','/another/repository/');},/source\/path mismatch/],
  ['wrong file',s=>{s.files[0].url=s.files[0].url.replace('LICENSE.md','UNRELATED.md');},/source\/path mismatch/],
  ['unknown transport',s=>{s.kind='remote-script';},/kind/],
  ['case collision',s=>{s.files.push({...s.files[0],path:s.files[0].path.toLowerCase()});},/Duplicate file/],
  ['file as parent',s=>{s.files.push({...s.files[0],path:`${s.files[0].path}/child`,url:`${s.files[0].url}/child`});},/File\/directory collision/],
  ['URL query',s=>{s.files[0].url+='?branch=main';},/origin/],
  ['malformed file',s=>{s.files[0]=null;},/Unsafe relative/],
]) {
  const lock=structuredClone(db.lock.slice(0,1));mutate(lock[0]);assert.throws(()=>validateLock(lock),expected,label);
}
const archive=structuredClone(db.lock.filter(s=>s.kind==='asset-archive').slice(0,1));
archive[0].revision=`sha256:${'0'.repeat(64)}`;assert.throws(()=>validateLock(archive),/archive source/);
for(const value of [null,{},[],[null]])assert.throws(()=>validateLock(value));
for(const [label,mutate,expected] of [
  ['skill stale revision',d=>{d.skills[0].revision='0'.repeat(40);},/metadata mismatch/],
  ['skill changed license',d=>{d.skills[0].license='CC0-1.0';},/metadata mismatch/],
  ['source missing',d=>{d.sources.pop();},/IDs differ/],
  ['duplicate style',d=>{d.styles.push(d.styles[0]);},/duplicate styles/],
  ['ambiguous alias',d=>{d.styles[1].aliases.push(d.styles[0].aliases[0].toUpperCase());},/Ambiguous/],
  ['unknown palette value',d=>{d.styles[0].palette.text='transparent';},/palette/],
  ['source count drift',d=>{d.sources[0].fileCount++;},/inventory mismatch/],
  ['unknown source category',d=>{d.sources[0].kind='runtime-proof';},/catalog kind/],
  ['unknown skill treatment',d=>{d.skills[0].treatment='copy-verbatim';},/skill treatment/],
  ['invalid evidence range',d=>{d.skills[0].evidence[0].lineEnd=0;},/evidence mismatch/],
  ['evidence digest drift',d=>{d.skills[0].evidence[0].sha256='0'.repeat(64);},/evidence mismatch/],
  ['missing pinned pattern file',d=>{d.patterns[0].paths=['unknown.json'];},/pinned file/],
  ['unknown pattern context policy',d=>{d.patterns[0].contextPolicy='automatic-anywhere';},/context policy/],
  ['unknown screen role',d=>{d.patterns[0].screenRoles=['unregistered-screen'];},/screen role/],
  ['malformed input checks',d=>{d.game.inputs.touch='unstructured';},/input touch/],
  ['unknown method schema',d=>{d.methods.schema='unknown';},/methods schema/],
  ['malformed method date',d=>{d.methods.reviewedAt='2026-02-30';},/review date/],
  ['duplicate method id',d=>{d.methods.methods.push(d.methods.methods[0]);},/duplicate pixel art methods/],
  ['unregistered method source',d=>{d.methods.methods[0].sourceIds=['unknown-source'];},/Method missing source/],
  ['empty method inputs',d=>{d.methods.methods[0].inputs=[];},/inputs/],
  ['malformed method checks',d=>{d.methods.methods[0].checks='unchecked';},/checks/],
  ['blank method use case',d=>{d.methods.methods[0].useWhen=' ';},/useWhen/],
  ['method source execution',d=>{d.methods.policy.executeSourceCode=true;},/execution\/context policy/],
  ['unbounded method default',d=>{d.methods.policy.defaultLoad='all';},/execution\/context policy/],
]) {
  const copy=structuredClone(db);mutate(copy);assert.throws(()=>validateDesignLibrary(copy),expected,label);
}
const temp=await mkdtemp(join(tmpdir(),'mcbe-design-library-'));
try{
  const bytes=Buffer.from('pinned-reference');const file={bytes:bytes.length,sha256:hash(bytes)};
  assert.equal(await storePinned(temp,'source/a.txt',file,bytes),'downloaded');
  assert.equal(await storePinned(temp,'source/a.txt',file,bytes),'cached');
  await assert.rejects(storePinned(temp,'source/a.txt',file,Buffer.from('changed')),/HASH/);
  await writeFile(join(temp,'source/a.txt'),'local changes');
  await assert.rejects(storePinned(temp,'source/a.txt',file,bytes),/preserve/);
  assert.equal(await readFile(join(temp,'source/a.txt'),'utf8'),'local changes');
  await symlink(join(temp,'source'),join(temp,'redirect'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(cachePath(temp,'redirect/escape.txt',true),/symlink/);
  await assert.rejects(cachePath(join(temp,'redirect','nested'),'escape.txt',true),/symlink/);
  const writes=await Promise.all(Array.from({length:8},()=>storePinned(temp,'concurrent/pinned.txt',file,bytes)));
  assert.equal(writes.filter(status=>status==='downloaded').length,1);
  assert.equal(writes.filter(status=>status==='cached').length,7);
  assert.deepEqual(await readdir(join(temp,'concurrent')),['pinned.txt'],'Concurrent writers must clean temporary files');
  assert.equal(hash(await readFile(join(temp,'concurrent/pinned.txt'))),file.sha256);
}finally{await rm(temp,{recursive:true,force:true});}
// Pin verification applies to streamed downloads without network or upstream execution.
const originalFetch=globalThis.fetch;
try{
  const bytes=Buffer.from('known bytes'),file={url:'https://example.invalid/never-fetched',bytes:bytes.length,sha256:hash(bytes)};
  let options;
  globalThis.fetch=async(_url,opts)=>{options=opts;return new Response(bytes);};
  assert.deepEqual(await fetchPinned(file),bytes);assert.equal(options.redirect,'error');assert.ok(options.signal);
  globalThis.fetch=async()=>new Response(Buffer.concat([bytes,Buffer.from('too large')]));
  await assert.rejects(fetchPinned(file),/exceeds pinned size/);
  globalThis.fetch=async()=>new Response(Buffer.from('short'));
  await assert.rejects(fetchPinned(file),/HASH_MISMATCH/);
  globalThis.fetch=async()=>new Response(Buffer.from('wrong bytes'));
  await assert.rejects(fetchPinned(file),/HASH_MISMATCH/);
}finally{globalThis.fetch=originalFetch;}
for(const args of [['styles'],['context','--style','cozy','--role','inventory','--input','gamepad'],['methods'],['method','--method','ui-kit-spec-first'],['method','--method','atlas-nine-slice','--style','cozy16'],['verify'],['sources'],['skills']]){
  const result=spawnSync(process.execPath,['tools/design-library.mjs',...args],{cwd:ROOT,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.doesNotThrow(()=>JSON.parse(result.stdout));assert.ok(result.stdout.length<16001);
  const value=JSON.parse(result.stdout);
  if(args[0]==='styles')assert.deepEqual(value,{styles:db.styles.map(({id,name,roles})=>({id,name,roles}))});
  if(args[0]==='methods')assert.deepEqual(value,{methods:db.methods.methods.map(({id,name,useWhen})=>({id,name,useWhen}))});
  if(args[0]==='verify')assert.deepEqual(Object.keys(value),['ok','styles','sources','skills','patterns','files','runtime']);
  if(args[0]==='skills')assert.deepEqual(value,{sources:db.skills});
}
const plan=spawnSync(process.execPath,['tools/design-source-sync.mjs','--source','kenney-tiny-town'],{cwd:ROOT,encoding:'utf8'});
assert.equal(plan.status,0,plan.stderr);assert.equal(JSON.parse(plan.stdout).mode,'plan');
for(const sourceId of ['au12jp-geoui-studio','microsoftdocs-minecraft-creator','mirzahilmi-3d-totem']){
  const selected=spawnSync(process.execPath,['tools/design-library.mjs','patterns','--source',sourceId,'--max-chars','16000'],{cwd:ROOT,encoding:'utf8'});
  assert.equal(selected.status,0,selected.stderr);
  const value=JSON.parse(selected.stdout);
  assert.equal(value.schema,'mcbe-source-pattern-context@1');assert.equal(value.runtimeVerified,false);
  assert.deepEqual(value.sources.map(s=>s.id),[sourceId]);
  assert.ok(value.sources[0].revision&&value.sources[0].license&&value.sources[0].reuse);
  assert.deepEqual(value.patterns,db.patterns.filter(p=>p.sourceId===sourceId));
  assert.ok(!Object.hasOwn(value,'styles')&&!Object.hasOwn(value,'skills'));
  const small=spawnSync(process.execPath,['tools/design-library.mjs','patterns','--source',sourceId,'--max-chars','1500'],{cwd:ROOT,encoding:'utf8'});
  assert.equal(small.status,0,small.stderr);const reduced=JSON.parse(small.stdout);
  assert.ok(small.stdout.length<=1500);assert.deepEqual(reduced.sources,value.sources);
  assert.equal(reduced.patterns.length+(reduced.omittedPatterns??0),value.patterns.length);
}
const allVanilla=spawnSync(process.execPath,['tools/design-library.mjs','patterns','--source','mojang-bedrock-samples','--max-chars','16000'],{cwd:ROOT,encoding:'utf8'});
assert.equal(allVanilla.status,0,allVanilla.stderr);
const oneLess=spawnSync(process.execPath,['tools/design-library.mjs','patterns','--source','mojang-bedrock-samples','--max-chars',String(allVanilla.stdout.length-1)],{cwd:ROOT,encoding:'utf8'});
assert.equal(oneLess.status,0,oneLess.stderr);assert.ok(oneLess.stdout.length<allVanilla.stdout.length);
assert.ok(JSON.parse(oneLess.stdout).omittedPatterns>0,'Whole-card omission must include console newline budget');
for(const [tool,args,expected] of [
  ['design-source-sync',['--source','kenney-tiny-town','--json','--json'],/Duplicate option/],
  ['design-source-sync',['--source','--verify'],/Missing value/],
  ['design-source-sync',['--source','kenney-tiny-town','--verify','--verify'],/Duplicate option/],
  ['design-source-sync',['--source','kenney-tiny-town','--download','--verify'],/Choose download or verify/],
  ['design-source-sync',['--source','unknown'],/known --source/],
  ['design-library',['context','--style','cozy','--limit','NaN'],/limit must/],
  ['design-library',['context','--style','cozy','--max-chars','1'],/max-chars must/],
  ['design-library',['styles','--json','--json'],/Duplicate option/],
  ['design-library',['context','--style','cozy','--style','fantasy'],/Duplicate option/],
  ['design-library',['sources','--source','unknown'],/Unknown source/],
  ['design-library',['patterns'],/known --source/],
  ['design-library',['patterns','--source','unknown'],/known --source/],
  ['design-library',['patterns','--source','au12jp-geoui-studio','--style','cozy'],/Unknown option/],
  ['design-library',['method'],/Unknown method/],
  ['design-library',['method','--method','unknown'],/Unknown method/],
  ['design-library',['method','--method','ui-kit-spec-first','--style','unknown'],/Unknown style/],
  ['design-library',['method','--method','ui-kit-spec-first','--method','sprite-animation'],/Duplicate option/],
  ['design-library',['methods','--method','ui-kit-spec-first'],/Unknown option/],
  ['design-library',['context','--method','ui-kit-spec-first'],/Unknown option/],
]) {
  const result=spawnSync(process.execPath,[`tools/${tool}.mjs`,...args],{cwd:ROOT,encoding:'utf8'});
  assert.equal(result.status,2,`${tool} ${args.join(' ')}`);assert.equal(result.stdout,'');assert.match(JSON.parse(result.stderr).error,expected);
}
console.log('design-library: selection, bounded provenance, metadata drift, pinned origin/path, concurrent cache writes, streamed hashes, path/junction defenses and CLI failures passed');
