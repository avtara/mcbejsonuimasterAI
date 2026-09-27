import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, access, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateChestContract, compileChestPlan, resolveChestResponse } from '../tools/_lib/chest-contract.mjs';

const ROOT=new URL('../',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(`examples/chest/${name}.json`,ROOT),'utf8'));
const action=await read('action-form-27'),native=await read('native-container-54');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
freeze(action);freeze(native);
for(const doc of [action,native]) {
  assert.equal(validateChestContract(doc).ok,true);
  const plan=compileChestPlan(doc);assert.equal(plan.ok,true);assert.equal(plan.runtimeVerified,false);assert.equal(plan.evidenceLevel,'authoring-contract');
  assert.equal(plan.pages[0].slotMap.length,doc.grid.columns*doc.grid.rows);
  for(const slot of plan.pages[0].slotMap)assert.equal(slot.index,slot.row*doc.grid.columns+slot.column);
  const shuffled=structuredClone(doc);shuffled.pages[0].slots.reverse();assert.deepEqual(compileChestPlan(shuffled),plan);
}
const plan=compileChestPlan(action),active={pageId:'main',snapshotId:'open-1'};
const respond=response=>resolveChestResponse(plan,{...active,response},active);
assert.equal(respond({canceled:false,selection:0}).semanticId,'sample-item');
assert.equal(respond({canceled:false,selection:0}).actionId,'inspect-item');
assert.equal(respond({canceled:true,selection:0}).kind,'canceled');
assert.equal(respond({canceled:true}).kind,'canceled');
assert.equal(respond({canceled:false,selection:1}).kind,'ignored');
assert.equal(respond({canceled:false,selection:26}).kind,'close');
for(const response of [{canceled:false,selection:27},{canceled:false,selection:-1},{canceled:false,selection:0.5},{selection:0}])assert.equal(respond(response).ok,false);
assert.equal(resolveChestResponse(plan,{...active,snapshotId:'old',response:{canceled:false,selection:0}},active).code,'CHEST_RESPONSE_STALE');
assert.equal(resolveChestResponse(plan,{...active,pageId:'old',response:{canceled:false,selection:0}},active).code,'CHEST_RESPONSE_STALE');
assert.equal(resolveChestResponse(compileChestPlan(native),{...active,response:{canceled:false,selection:0}},active).code,'CHEST_RESPONSE_TRANSPORT');
assert.equal(resolveChestResponse(plan,{...active,response:{canceled:false,selection:0}},null).ok,false);
for(const malformed of [{...plan,pages:null},{...plan,schema:'wrong'},{...plan,pages:[null]},{...plan,pages:[{id:'main',slotMap:[{selectionIndex:0,enabled:true,action:{type:'unknown'}}]}]}])assert.equal(resolveChestResponse(malformed,{...active,response:{canceled:false,selection:0}},active).code,'CHEST_RESPONSE_PLAN');
assert.equal(resolveChestResponse(JSON.parse(JSON.stringify(plan)),{...active,response:{canceled:false,selection:0}},active).kind,'callback');
for(const change of [
  p=>{p.pages[0].slotMap[0].index=-9;},
  p=>{p.pages[0].slotMap[0].role='invented';},
  p=>{p.pages[0].slotMap[0].enabled='false';},
  p=>{delete p.pages[0].slotMap[0].enabled;},
  p=>{p.pages.push(structuredClone(p.pages[0]));},
  p=>{p.pages[0].slotMap[1].selectionIndex=0;},
  p=>{p.pages[0].slotMap[0].selectionIndex=27;},
  p=>{p.pages[0].slotMap[0].row=1;},
  p=>{p.pages[0].slotMap[0].semanticId=null;},
  p=>{p.pages[0].slotMap[0].action={type:'close'};},
  p=>{p.pages[0].slotMap[0].action={type:'page',pageId:'missing'};},
  p=>{p.pages[0].slotMap[0].action={type:'callback',id:1};},
  p=>{p.pages[0].slotMap[0].source={collection:'container_items',index:0};},
  p=>{delete p.grid;},
]){const malformed=structuredClone(plan);change(malformed);assert.equal(resolveChestResponse(malformed,{...active,response:{canceled:false,selection:0}},active).code,'CHEST_RESPONSE_PLAN');}
const disabled=structuredClone(action);disabled.pages[0].slots[0].enabled=false;
assert.equal(resolveChestResponse(compileChestPlan(disabled),{...active,response:{canceled:false,selection:0}},active).kind,'ignored');
const pages=structuredClone(action);pages.pages.push({...structuredClone(pages.pages[0]),id:'details'});pages.pages[0].slots[0].action={type:'page',pageId:'details'};
const paged=compileChestPlan(pages);assert.equal(paged.ok,true);assert.equal(resolveChestResponse(paged,{...active,response:{canceled:false,selection:0}},active).pageId,'details');
const reversed=structuredClone(pages);reversed.pages.reverse();assert.deepEqual(compileChestPlan(reversed),paged);

for(const [name,original,change,code] of [
  ['duplicate index',action,d=>{d.pages[0].slots[1].index=0;},'CHEST_SLOT_INDEX_DUPLICATE'],
  ['missing placeholder',action,d=>{d.pages[0].slots.pop();},'CHEST_SLOT_COUNT'],
  ['out of range',action,d=>{d.pages[0].slots[1].index=27;},'CHEST_SLOT_INDEX_RANGE'],
  ['compacted selection',action,d=>{d.pages[0].slots[26].selectionIndex=1;},'CHEST_SELECTION_ORDER'],
  ['clickable placeholder',action,d=>{d.pages[0].slots[1].action={type:'callback',id:'wrong'};},'CHEST_PLACEHOLDER_ACTIVE'],
  ['duplicate semantics',action,d=>{d.pages[0].slots[26].semanticId='sample-item';},'CHEST_SEMANTIC_ID_DUPLICATE'],
  ['missing semantics',action,d=>{delete d.pages[0].slots[0].semanticId;},'CHEST_SEMANTIC_ID_REQUIRED'],
  ['missing action',action,d=>{delete d.pages[0].slots[0].action;},'CHEST_ACTION_REQUIRED'],
  ['missing page',action,d=>{d.pages[0].slots[0].action={type:'page',pageId:'missing'};},'CHEST_PAGE_TARGET'],
  ['duplicate page',action,d=>{d.pages.push(structuredClone(d.pages[0]));},'CHEST_PAGE_DUPLICATE'],
  ['missing initial page',action,d=>{d.initialPage='missing';},'CHEST_INITIAL_PAGE'],
  ['cancel order',action,d=>{d.actionForm.cancelPolicy='selection-first';},'CHEST_SCHEMA_INVALID'],
  ['close missing',action,d=>{d.pages[0].slots[26].action={type:'callback',id:'other'};},'CHEST_CLOSE_MAPPING'],
  ['fractional count',action,d=>{d.pages[0].slots[0].count=1.5;},'CHEST_SCHEMA_INVALID'],
  ['negative count',action,d=>{d.pages[0].slots[0].count=-1;},'CHEST_SCHEMA_INVALID'],
  ['unversioned aux',action,d=>{d.pages[0].slots[0].icon={mode:'aux',value:1};},'CHEST_SCHEMA_INVALID'],
  ['unqualified item',action,d=>{d.pages[0].slots[0].icon={mode:'item-id',value:'diamond'};},'CHEST_SCHEMA_INVALID'],
  ['icon mode',action,d=>{d.pages[0].slots[0].icon={mode:'automatic',value:'x'};},'CHEST_SCHEMA_INVALID'],
  ['path traversal',action,d=>{d.pages[0].slots[0].icon.value='../outside';},'CHEST_ICON_PATH'],
  ['native selection',native,d=>{d.pages[0].slots[0].selectionIndex=0;},'CHEST_TRANSPORT_FIELD'],
  ['unknown collection',native,d=>{d.pages[0].slots[0].source.collection='unknown';},'CHEST_COLLECTION_UNKNOWN'],
  ['duplicate collection',native,d=>{d.nativeContainer.collections.push({...d.nativeContainer.collections[0]});},'CHEST_COLLECTION_DUPLICATE'],
  ['source out of range',native,d=>{d.pages[0].slots[0].source.index=54;},'CHEST_SOURCE_INDEX_RANGE'],
  ['duplicate source',native,d=>{d.pages[0].slots[1].source.index=0;},'CHEST_SOURCE_INDEX_DUPLICATE'],
  ['missing source',native,d=>{delete d.pages[0].slots[0].source;},'CHEST_SOURCE_REQUIRED'],
  ['native close event',native,d=>{d.nativeContainer.closeEvent='invented';},'CHEST_NATIVE_EVENT'],
  ['native control event',native,d=>{d.pages[0].slots[0]={index:0,role:'control',semanticId:'control',event:'invented'};},'CHEST_NATIVE_EVENT'],
  ['native callback',native,d=>{d.pages[0].slots[0].action={type:'callback',id:'forbidden'};},'CHEST_TRANSPORT_FIELD'],
  ['action source',action,d=>{d.pages[0].slots[0].source={collection:'container_items',index:0};},'CHEST_TRANSPORT_FIELD'],
]) {
  const copy=structuredClone(original);change(copy);const result=validateChestContract(copy);
  assert.equal(result.ok,false,name);assert.ok(result.diagnostics.some(d=>d.code===code),`${name}: ${JSON.stringify(result.diagnostics)}`);assert.equal(compileChestPlan(copy).ok,false);
}
for(const input of [null,{},[],{...structuredClone(action),extra:true}])assert.equal(validateChestContract(input).ok,false);
const declared=structuredClone(native);declared.nativeContainer.collections[0].name='target_inventory';declared.pages[0].slots.forEach(s=>{s.source.collection='target_inventory';});assert.equal(validateChestContract(declared).ok,true);
const nativeControl=structuredClone(native);nativeControl.pages[0].slots[0]={index:0,role:'control',semanticId:'close',event:native.nativeContainer.closeEvent};nativeControl.pages[0].slots[1]={index:1,role:'placeholder'};assert.equal(validateChestContract(nativeControl).ok,true);
const targeted=structuredClone(native);targeted.nativeContainer.events.push('declared.take');targeted.pages[0].slots[1]={index:1,role:'control',semanticId:'take-first',event:'declared.take',targetSource:{collection:'container_items',index:0}};
assert.equal(validateChestContract(targeted).ok,true,'A control may target the same source represented by an item slot');
assert.deepEqual(compileChestPlan(targeted).pages[0].slotMap[1].targetSource,{collection:'container_items',index:0});
for(const [original,change,code] of [
  [targeted,d=>{d.pages[0].slots[1].targetSource.collection='unknown';},'CHEST_COLLECTION_UNKNOWN'],
  [targeted,d=>{d.pages[0].slots[1].targetSource.index=54;},'CHEST_SOURCE_INDEX_RANGE'],
  [targeted,d=>{d.pages[0].slots[1].targetSource.index=-1;},'CHEST_SCHEMA_INVALID'],
  [targeted,d=>{d.pages[0].slots[0].targetSource={collection:'container_items',index:1};},'CHEST_TRANSPORT_FIELD'],
  [nativeControl,d=>{d.pages[0].slots[1].targetSource={collection:'container_items',index:0};},'CHEST_PLACEHOLDER_ACTIVE'],
  [action,d=>{d.pages[0].slots[26].targetSource={collection:'container_items',index:0};},'CHEST_TRANSPORT_FIELD'],
]){const changed=structuredClone(original);change(changed);assert.ok(validateChestContract(changed).diagnostics.some(d=>d.code===code));}
for(const icon of [{mode:'none'},{mode:'item-id',value:'minecraft:diamond'},{mode:'aux',value:0,mappingRevision:'declared-test-revision'}]){const copy=structuredClone(action);copy.pages[0].slots[0].icon=icon;copy.pages[0].slots[0].count=0;assert.equal(validateChestContract(copy).ok,true);assert.deepEqual(compileChestPlan(copy).pages[0].slotMap[0].icon,icon);}
const run=args=>spawnSync(process.execPath,['tools/chest-contract.mjs',...args],{cwd:ROOT,encoding:'utf8'});
const file='examples/chest/action-form-27.json';
for(const args of [[],['--contract'],['--contract',file,'--unknown'],['--contract',file,'--contract',file],['--contract',file,'--max-chars','NaN'],['--contract',file,'--json','--json']]){const r=run(args);assert.equal(r.status,64,r.stderr);assert.equal(r.stdout,'');}
for(const args of [['--contract',file,'--page','"\\\n'.repeat(6000)],['--contract',file,'--'+'x'.repeat(18000)]]){const r=run(args);assert.equal(r.status,64);assert.equal(r.stdout,'');assert.ok(r.stderr.length<=1000);assert.equal(JSON.parse(r.stderr).ok,false);}
const compact=run(['--contract',file,'--json']);assert.equal(compact.status,0,compact.stderr);assert.equal(JSON.parse(compact.stdout).runtimeVerified,false);assert.ok(compact.stdout.length<=7501);assert.equal(Object.hasOwn(JSON.parse(compact.stdout).pages[0],'slotMap'),false);
const detailed=run(['--contract',file,'--page','main','--json']);assert.equal(detailed.status,0,detailed.stderr);assert.equal(JSON.parse(detailed.stdout).pages[0].slotMap.length,27);
assert.equal(run(['--contract',file,'--page','missing','--json']).status,64);
const nativeFile='examples/chest/native-container-54.json';
const nativeSummary=run(['--contract',nativeFile]);assert.equal(nativeSummary.status,0,nativeSummary.stderr);assert.ok(nativeSummary.stdout.length<=7501);
const nativeDetail=run(['--contract',nativeFile,'--page','main','--max-chars','16000']);assert.equal(nativeDetail.status,0,nativeDetail.stderr);assert.equal(JSON.parse(nativeDetail.stdout).pages[0].slotMap.length,54);
const temp=await mkdtemp(join(tmpdir(),'mcbe-chest-contract-'));
try{
  const report=join(temp,'report.json');const r=run(['--contract',file,'--report',report,'--json']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(await readFile(report,'utf8')).pages[0].slotMap.length,27);assert.notEqual(run(['--contract',file,'--report',file]).status,0);
  const previous=await readFile(report,'utf8');const overwrite=run(['--contract',file,'--report',report]);assert.equal(overwrite.status,1);assert.equal(overwrite.stdout,'');assert.equal(await readFile(report,'utf8'),previous);
  const original=join(temp,'input.json'),alias=join(temp,'input-alias.json');const originalText=JSON.stringify(action);await writeFile(original,originalText);await link(original,alias);
  const linked=run(['--contract',original,'--report',alias]);assert.equal(linked.status,1);assert.equal(linked.stdout,'');assert.equal(await readFile(original,'utf8'),originalText);assert.equal(await readFile(alias,'utf8'),originalText);
  const invalid=join(temp,'invalid.json');await writeFile(invalid,JSON.stringify({...action,initialPage:'missing'}));const rejected=run(['--contract',invalid]);assert.equal(rejected.status,9,rejected.stderr);assert.equal(JSON.parse(rejected.stdout).ok,false);
  const tooLarge=join(temp,'not-written.json');const bounded=run(['--contract',nativeFile,'--page','main','--report',tooLarge]);assert.equal(bounded.status,64);assert.equal(bounded.stdout,'');await assert.rejects(access(tooLarge),{code:'ENOENT'});
}finally{await rm(temp,{recursive:true,force:true});}
console.log('chest-contract: transports, slot/page mappings, placeholders, zero/cancel/stale responses, immutable input, schema and bounded CLI passed; runtime unverified');
