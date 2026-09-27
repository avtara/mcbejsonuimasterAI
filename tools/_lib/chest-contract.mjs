import { readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { safeRelative } from './design-library.mjs';

const schema=JSON.parse(readFileSync(new URL('../../schemas/chest-contract.schema.json',import.meta.url),'utf8'));
const validateShape=new Ajv({allErrors:true,strict:false}).compile(schema);
const evidence={evidenceLevel:'authoring-contract',runtimeVerified:false};
const boundary='This validates declared mappings, not extracted BP/RP or live container behavior. Hidden/disabled UI does not authorize server actions; validate current state and permissions on the server.';
const sorted=(values,key)=>[...values].sort((a,b)=>a[key]<b[key]?-1:a[key]>b[key]?1:0);

export function validateChestContract(document) {
  const diagnostics=[];
  const add=(code,path,message)=>diagnostics.push({code,path,message});
  const result=()=>({ok:diagnostics.length===0,diagnostics:diagnostics.slice(0,64),diagnosticCount:diagnostics.length,...evidence});
  if(!validateShape(document)) {
    for(const error of validateShape.errors)add('CHEST_SCHEMA_INVALID',error.instancePath||'/',error.message);
    return result();
  }
  const capacity=document.grid.columns*document.grid.rows,pageIds=new Set();
  for(const page of document.pages){if(pageIds.has(page.id))add('CHEST_PAGE_DUPLICATE','/pages',`Duplicate page ${page.id}`);pageIds.add(page.id);}
  if(!pageIds.has(document.initialPage))add('CHEST_INITIAL_PAGE','/initialPage','Initial page is not declared');
  const actionForm=document.transport==='action-form',collections=new Map(),events=new Set(document.nativeContainer?.events??[]);
  for(const collection of document.nativeContainer?.collections??[]){if(collections.has(collection.name))add('CHEST_COLLECTION_DUPLICATE','/nativeContainer/collections',`Duplicate collection ${collection.name}`);collections.set(collection.name,collection.size);}
  if(!actionForm && !events.has(document.nativeContainer.closeEvent))add('CHEST_NATIVE_EVENT','/nativeContainer/closeEvent','Close event must be explicitly declared');
  for(const [pageIndex,page] of document.pages.entries()) {
    const path=`/pages/${pageIndex}`,indices=new Set(),semantics=new Set(),sources=new Set();
    if(page.slots.length!==capacity)add('CHEST_SLOT_COUNT',`${path}/slots`,`Expected ${capacity} physical slots including placeholders`);
    for(const [slotIndex,slot] of page.slots.entries()) {
      const at=`${path}/slots/${slotIndex}`;
      if(slot.index>=capacity)add('CHEST_SLOT_INDEX_RANGE',`${at}/index`,`Physical index must be below ${capacity}`);
      if(indices.has(slot.index))add('CHEST_SLOT_INDEX_DUPLICATE',`${at}/index`,`${slot.index} is used twice`);indices.add(slot.index);
      if(slot.role==='placeholder') {
        if(slot.enabled===true||slot.semanticId||slot.action||slot.source||slot.targetSource||slot.event||slot.count!==undefined||slot.icon?.mode&&slot.icon.mode!=='none')add('CHEST_PLACEHOLDER_ACTIVE',at,'A placeholder must remain noninteractive and carry no item/action mapping');
      } else {
        if(!slot.semanticId)add('CHEST_SEMANTIC_ID_REQUIRED',`${at}/semanticId`,'Non-placeholder slots require stable semantic IDs');
        else {if(semantics.has(slot.semanticId))add('CHEST_SEMANTIC_ID_DUPLICATE',`${at}/semanticId`,`${slot.semanticId} is used twice on this page`);semantics.add(slot.semanticId);}
      }
      if(slot.icon?.mode==='texture-path'){try{safeRelative(slot.icon.value);}catch{add('CHEST_ICON_PATH',`${at}/icon/value`,'Texture path must be a safe RP-relative path');}}
      if(actionForm) {
        if(slot.source||slot.targetSource||slot.event)add('CHEST_TRANSPORT_FIELD',at,'Native container mappings are not ActionForm selection mappings');
        if(slot.selectionIndex!==slot.index)add('CHEST_SELECTION_ORDER',`${at}/selectionIndex`,'Selection index must preserve row-major physical slots, including placeholders');
        if(slot.role!=='placeholder'&&!slot.action)add('CHEST_ACTION_REQUIRED',`${at}/action`,'Non-placeholder form slots require an explicit callback, page or close action');
        if(slot.action?.type==='page'&&!pageIds.has(slot.action.pageId))add('CHEST_PAGE_TARGET',`${at}/action/pageId`,'Target page is not declared');
        if(slot.action?.type==='close'&&slot.role!=='control')add('CHEST_CLOSE_MAPPING',at,'A close action must be a control');
      } else {
        if(slot.selectionIndex!==undefined||slot.action)add('CHEST_TRANSPORT_FIELD',at,'Native containers do not use ActionForm selection/callback mappings');
        if(slot.role==='slot'&&!slot.source)add('CHEST_SOURCE_REQUIRED',`${at}/source`,'Native slots require an explicit collection and physical source index');
        if(slot.role==='control'&&(!slot.event||!events.has(slot.event)))add('CHEST_NATIVE_EVENT',`${at}/event`,'Native controls require an explicitly declared event');
        if(slot.role!=='slot'&&slot.source)add('CHEST_TRANSPORT_FIELD',`${at}/source`,'Only native item slots bind a container source');
        if(slot.role!=='control'&&slot.targetSource)add('CHEST_TRANSPORT_FIELD',`${at}/targetSource`,'Only native controls declare an operation target');
        if(slot.role!=='control'&&slot.event)add('CHEST_TRANSPORT_FIELD',`${at}/event`,'Only native controls declare UI events');
        if(slot.source) {
          const size=collections.get(slot.source.collection),key=JSON.stringify([slot.source.collection,slot.source.index]);
          if(size===undefined)add('CHEST_COLLECTION_UNKNOWN',`${at}/source/collection`,'Native collection must be explicitly declared');
          else if(slot.source.index>=size)add('CHEST_SOURCE_INDEX_RANGE',`${at}/source/index`,`Source index must be below declared collection size ${size}`);
          if(sources.has(key))add('CHEST_SOURCE_INDEX_DUPLICATE',`${at}/source`,'One physical native source slot is mapped twice on this page');sources.add(key);
        }
        // An operation may target a source already displayed by a slot or another control.
        if(slot.targetSource) {
          const size=collections.get(slot.targetSource.collection);
          if(size===undefined)add('CHEST_COLLECTION_UNKNOWN',`${at}/targetSource/collection`,'Native operation target collection must be explicitly declared');
          else if(slot.targetSource.index>=size)add('CHEST_SOURCE_INDEX_RANGE',`${at}/targetSource/index`,`Target source index must be below declared collection size ${size}`);
        }
      }
    }
    if(actionForm&&document.actionForm.closePolicy==='mapped-control'&&!page.slots.some(s=>s.role==='control'&&s.enabled!==false&&s.action?.type==='close'))add('CHEST_CLOSE_MAPPING',path,'Each page must have an enabled mapped close control');
  }
  return result();
}

export function compileChestPlan(document) {
  const validation=validateChestContract(document);
  if(!validation.ok)return {schema:'mcbe-chest-plan@1',...validation,boundary};
  const doc=structuredClone(document);
  return {schema:'mcbe-chest-plan@1',...validation,id:doc.id,revision:doc.revision,transport:doc.transport,grid:doc.grid,initialPage:doc.initialPage,
    ...(doc.transport==='action-form'?{actionForm:doc.actionForm}:{nativeContainer:doc.nativeContainer}),
    pages:sorted(doc.pages,'id').map(page=>({id:page.id,slotMap:sorted(page.slots,'index').map(slot=>({index:slot.index,row:Math.floor(slot.index/doc.grid.columns),column:slot.index%doc.grid.columns,role:slot.role,semanticId:slot.semanticId??null,enabled:slot.role!=='placeholder'&&slot.enabled!==false,
      ...(slot.selectionIndex!==undefined?{selectionIndex:slot.selectionIndex}:{}),...(slot.action?{action:slot.action}:{}),...(slot.source?{source:slot.source}:{}),...(slot.targetSource?{targetSource:slot.targetSource}:{}),...(slot.event?{event:slot.event}:{}),...(slot.icon?{icon:slot.icon}:{}),...(slot.count!==undefined?{count:slot.count}:{})}))})),
    unverified:['Target RP references, textures and item/AUX mappings','Actual BP/server handlers and current permissions','Native collection/event availability, input behavior and Bedrock runtime'],boundary};
}

function validActionPlan(plan) {
  try {
    if(plan.schema!=='mcbe-chest-plan@1'||plan.runtimeVerified!==false||plan.evidenceLevel!=='authoring-contract'||!Array.isArray(plan.pages)||plan.pages.length<1||plan.pages.length>16)return false;
    const pages=[];
    for(const page of plan.pages) {
      if(!page||!Array.isArray(page.slotMap)||page.slotMap.length<1||page.slotMap.length>256)return false;
      const slots=[];
      for(const slot of page.slotMap) {
        if(!slot||typeof slot.enabled!=='boolean'||slot.row!==Math.floor(slot.index/plan.grid?.columns)||slot.column!==slot.index%plan.grid?.columns)return false;
        const {row,column,semanticId,...declared}=slot;
        if(slot.role==='placeholder'){if(semanticId!==null||slot.enabled!==false)return false;}
        else declared.semanticId=semanticId;
        slots.push(declared);
      }
      pages.push({id:page.id,slots});
    }
    // Revalidate serialized plans through the same schema and mapping invariants as authoring.
    return validateChestContract({schema:'mcbe-chest-contract@1',id:plan.id,revision:plan.revision,transport:plan.transport,grid:plan.grid,initialPage:plan.initialPage,actionForm:plan.actionForm,
      ...(plan.nativeContainer!==undefined?{nativeContainer:plan.nativeContainer}:{}),pages}).ok;
  } catch {return false;}
}

// The caller binds page/snapshot IDs to the opened form and supplies its current active IDs.
// This performs no server operation and cannot establish current permissions or balances.
export function resolveChestResponse(plan,envelope,active) {
  const fail=code=>({ok:false,kind:'ignored',code,runtimeVerified:false});
  if(plan?.ok!==true||plan.transport!=='action-form')return fail('CHEST_RESPONSE_TRANSPORT');
  if(!validActionPlan(plan))return fail('CHEST_RESPONSE_PLAN');
  if(!active||typeof active.pageId!=='string'||!active.pageId||typeof active.snapshotId!=='string'||!active.snapshotId)return fail('CHEST_RESPONSE_CONTEXT');
  if(envelope?.pageId!==active.pageId||envelope?.snapshotId!==active.snapshotId)return fail('CHEST_RESPONSE_STALE');
  const page=plan.pages.find(p=>p.id===active.pageId);
  if(!page)return fail('CHEST_RESPONSE_PAGE');
  const response=envelope.response;
  if(response?.canceled===true)return {ok:true,kind:'canceled',runtimeVerified:false};
  if(response?.canceled!==false||!Number.isSafeInteger(response.selection))return fail('CHEST_RESPONSE_INVALID');
  const slot=page.slotMap.find(s=>s?.selectionIndex===response.selection);
  if(!slot)return fail('CHEST_RESPONSE_INDEX');
  if(!slot.enabled||slot.role==='placeholder')return {ok:true,kind:'ignored',semanticId:slot.semanticId,runtimeVerified:false};
  if(!slot.action||!['close','page','callback'].includes(slot.action.type))return fail('CHEST_RESPONSE_PLAN');
  const base={ok:true,semanticId:slot.semanticId,index:slot.index,runtimeVerified:false};
  if(slot.action.type==='close')return {...base,kind:'close'};
  if(slot.action.type==='page')return plan.pages.some(p=>p.id===slot.action.pageId)?{...base,kind:'page',pageId:slot.action.pageId}:fail('CHEST_RESPONSE_PLAN');
  if(typeof slot.action.id!=='string'||!slot.action.id)return fail('CHEST_RESPONSE_PLAN');
  return {...base,kind:'callback',actionId:slot.action.id};
}
