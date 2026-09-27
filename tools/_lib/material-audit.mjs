import {readdir,realpath,stat,lstat} from 'node:fs/promises';
import {dirname,extname,relative,resolve,isAbsolute} from 'node:path';
import {readJsonc} from './jsonc.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const inside=(root,path)=>{const rel=relative(root,path);return rel===''||(rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\')&&!isAbsolute(rel));};
const slash=s=>s.replaceAll('\\','/');
const deprecated=new Set(['depthBias','slopeScaledDepthBias','depthBiasOGL','slopeScaledDepthBiasOGL','msaaSupport','vertexShader','geometryShader','depthStencilFaceName','stencilRefOverride','stencilRef','stencilReadMask','stencilWriteMask','vertexFields','isAnimatedTexture','renderTargetFormats','primitiveMode']);
const layers={color:4,normal:null,heightmap:1,metalness_emissive_roughness:3,metalness_emissive_roughness_subsurface:4};

export async function auditMaterials({rp,mode='classic'}={}){
 if(!['classic','vibrant','rtx'].includes(mode))throw new Error('mode must be classic, vibrant or rtx');
 if(typeof rp!=='string'||!rp)throw new Error('rp directory is required');
 const root=await realpath(rp);if(!(await stat(root)).isDirectory())throw new Error('rp must be a directory');
 const diagnostics=[],materials=new Map(),sets=[],imageRefs=[];let fileCount=0;
 const add=(severity,code,path,message)=>diagnostics.push({severity,code,path,message});
 async function walk(folder){
  let entries;try{
   if((await lstat(folder)).isSymbolicLink()||!inside(root,await realpath(folder))){add('warning','SYMLINK_SKIPPED',slash(relative(root,folder)),'Linked folder was not inspected.');return;}
   entries=await readdir(folder,{withFileTypes:true});
  }catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
   const path=resolve(folder,entry.name),key=slash(relative(root,path));
   if(entry.isSymbolicLink()){add('warning','SYMLINK_SKIPPED',key,'Linked content was not inspected.');continue;}
   if(entry.isDirectory()){await walk(path);continue;}
   if(!entry.isFile()||(!key.endsWith('.material')&&!key.endsWith('.texture_set.json')))continue;
   if(++fileCount>20000)throw new Error('Inspection file bound exceeded');
   if((await stat(path)).size>8*1024*1024){add('error','FILE_SIZE_LIMIT',key,'File exceeds 8 MiB inspection bound.');continue;}
   let json;try{json=await readJsonc(path);}catch{add('error','JSON_PARSE',key,'Material or texture-set JSONC cannot be parsed.');continue;}
   if(!object(json)){add('error','JSON_OBJECT',key,'Expected a material or texture-set object.');continue;}
   if(key.endsWith('.material')){
    if(!object(json.materials)){add('error','MATERIALS_OBJECT',key,'Expected a materials object.');continue;}
    for(const [name,value] of Object.entries(json.materials)){
     if(name==='version')continue;
     const parts=name.split(':'),id=parts[0],parent=parts[1]??null;
     if(parts.length>2||!id||(parts.length===2&&!parent)||!object(value)){add('error','MATERIAL_DEFINITION',key,'Expected material:parent inheritance and an object body.');continue;}
     if(materials.has(id)){add('error','MATERIAL_DUPLICATE',key,`Duplicate material identifier ${id.slice(0,120)}.`);continue;}
     materials.set(id,{id,parent,file:key});
     const old=Object.keys(value).filter(k=>deprecated.has(k));
     if(old.length)add('warning','DEPRECATED_MATERIAL_KEYS',key,`Pinned official documentation deprecates: ${old.join(', ')}. Check the target graphics mode; do not infer an outline from these keys.`);
     for(const field of ['defines','states','+defines','-defines','+states','-states'])if(field in value&&(!Array.isArray(value[field])||value[field].some(v=>typeof v!=='string')))add('error','MATERIAL_OPTION_LIST',key,`${field} must be a list of strings.`);
    }
   }else{
    const value=json['minecraft:texture_set'];
    if(!object(value)){add('error','TEXTURE_SET_OBJECT',key,'Expected minecraft:texture_set.');continue;}
    sets.push({file:key,layers:Object.keys(value)});
    if(!Object.hasOwn(value,'color'))add('error','COLOR_REQUIRED',key,'A texture set needs its color layer.');
    for(const [a,b] of [['normal','heightmap'],['metalness_emissive_roughness','metalness_emissive_roughness_subsurface']])if(a in value&&b in value)add('error','EXCLUSIVE_LAYERS',key,`${a} and ${b} cannot coexist.`);
    for(const [layer,v] of Object.entries(value)){
     if(!Object.hasOwn(layers,layer)){add('warning','UNKNOWN_LAYER',key,`Unreviewed layer ${layer.slice(0,80)}.`);continue;}
     const channels=layers[layer];
     if(typeof v==='string'&&!v.startsWith('#')){
      if(!v||isAbsolute(v)||/^[a-z]+:|\\|(^|\/)\.\.(\/|$)/i.test(v)){add('error','TEXTURE_PATH',key,'Texture layer reference must stay in this resource pack.');continue;}
      const base=resolve(dirname(path),v);let found=null;
      for(const extension of ['.tga','.png','.jpg','.jpeg'].includes(extname(base).toLowerCase())?['']:['.tga','.png','.jpg','.jpeg']){
       try{const candidate=await realpath(base+extension);if(!inside(root,candidate)){add('error','TEXTURE_ESCAPE',key,'Texture resolves outside its own resource pack.');break;}if((await stat(candidate)).isFile()){found=candidate;break;}}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}
      }
      if(!found){add('error','TEXTURE_MISSING',key,`Missing ${layer} texture in the same pack.`);continue;}
      imageRefs.push({file:key,layer,texture:slash(relative(root,found))});
      // Do not mistake file existence or a header for full image/channel validity.
      add('info','IMAGE_CONTENT_UNVERIFIED',key,`${layer}: image decoding and channel validation remain required.`);
     }else{
      const validNumber=n=>typeof n==='number'&&Number.isInteger(n)&&n>=0&&n<=255;
      const valid=channels!==null&&(Array.isArray(v)?v.length===channels&&v.every(validNumber):typeof v==='number'?channels===1&&validNumber(v):typeof v==='string'&&new RegExp(`^#[0-9a-fA-F]{${channels*2}}$`).test(v));
      if(!valid)add('error','LAYER_UNIFORM',key,`${layer} has an invalid uniform value or channel count.`);
     }
    }
    if(mode==='rtx'&&'metalness_emissive_roughness_subsurface'in value)add('warning','RTX_MERS_UNSUPPORTED',key,'The RTX path does not use MERS subsurface values.');
    if(mode==='classic'&&Object.keys(value).some(k=>k!=='color'))add('info','CLASSIC_COLOR_ONLY',key,'Classic rendering uses the color layer; PBR layers do not prove this appearance.');
    if(mode==='vibrant'&&'heightmap'in value)add('warning','HEIGHTMAP_TARGET_REQUIRED',key,'Confirm that this is not a texture-based object such as an item; that target requires normals.');
   }
  }
 }
 await walk(resolve(root,'materials'));await walk(resolve(root,'textures'));
 for(const value of materials.values())if(value.parent&&!materials.has(value.parent))add('warning','MATERIAL_PARENT_EXTERNAL',value.file,`Parent ${value.parent.slice(0,120)} requires target vanilla/dependency evidence.`);
 const complete=new Set();
 for(const id of materials.keys()){
  const chain=new Set();let current=id;
  while(materials.has(current)&&!complete.has(current)){
   if(chain.has(current)){add('error','MATERIAL_CYCLE',materials.get(current).file,'Material inheritance is cyclic.');break;}
   chain.add(current);current=materials.get(current).parent;
  }
  for(const entry of chain)complete.add(entry);
 }
 if(mode==='vibrant'&&sets.length){
  let manifest,readable=false;
  try{
   const path=resolve(root,'manifest.json'),info=await lstat(path);
   if(info.isSymbolicLink()||!inside(root,await realpath(path)))add('error','MANIFEST_LINK','manifest.json','Manifest must be a regular file inside this resource pack.');
   else if(!info.isFile())add('error','MANIFEST_REQUIRED','manifest.json','Manifest must be a regular file.');
   else if(info.size>8*1024*1024)add('error','FILE_SIZE_LIMIT','manifest.json','Manifest exceeds 8 MiB inspection bound.');
   else{manifest=await readJsonc(path);readable=true;}
  }catch{add('error','MANIFEST_REQUIRED','manifest.json','Vibrant Visuals capability cannot be checked without a readable manifest.');}
  if(readable&&!object(manifest))add('error','MANIFEST_OBJECT','manifest.json','Manifest must be a JSON object.');
  if(readable&&object(manifest)){
   const capabilities=Array.isArray(manifest.capabilities)?manifest.capabilities:[];
   if(!capabilities.includes('pbr')&&!capabilities.includes('raytraced'))add('error','PBR_CAPABILITY','manifest.json','Vibrant Visuals needs pbr (or raytraced) capability.');
   const version=manifest.header?.min_engine_version;
   if(!Array.isArray(version)||version.length!==3||version.some(v=>!Number.isSafeInteger(v)||v<0)||version[0]<1||version[0]===1&&(version[1]<21||version[1]===21&&version[2]<120))add('error','PBR_ENGINE_VERSION','manifest.json','Pinned Vibrant Visuals documentation requires min_engine_version 1.21.120 or later.');
  }
 }
 const summary={files:fileCount,materials:materials.size,textureSets:sets.length,imageReferences:imageRefs.length,errors:diagnostics.filter(d=>d.severity==='error').length,warnings:diagnostics.filter(d=>d.severity==='warning').length,infos:diagnostics.filter(d=>d.severity==='info').length};
 return {schema:'mcbe-material-audit@1',ok:summary.errors===0,mode,evidenceLevel:'static-material-structure',runtimeVerified:false,summary,diagnostics,materials:[...materials.values()],textureSets:sets,imageReferences:imageRefs,scope:'Root materials/ and textures/ only. Select subpacks separately; no shader execution, image decoding, pack-stack resolution or visual/runtime claim.'};
}

export function boundedMaterialAudit(report,maxChars=6000){
 if(!Number.isSafeInteger(maxChars)||maxChars<1500||maxChars>32000)throw new Error('max-chars must be 1500..32000');
 const {materials,textureSets,imageReferences,...compact}=report;
 const severity={error:0,warning:1,info:2};
 compact.diagnostics=[...report.diagnostics].sort((a,b)=>(severity[a.severity]??3)-(severity[b.severity]??3));compact.omittedDiagnostics=0;
 while(JSON.stringify(compact).length+1>maxChars&&compact.diagnostics.length){compact.diagnostics.pop();compact.omittedDiagnostics++;}
 const value=JSON.stringify(compact);if(value.length+1>maxChars)throw new Error('Summary exceeds output budget');return value;
}
