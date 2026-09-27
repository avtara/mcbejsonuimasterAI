import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditMaterials,boundedMaterialAudit} from '../tools/_lib/material-audit.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const root=await mkdtemp(resolve(tmpdir(),'mcbe-material-'));
const put=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,typeof value==='string'?value:JSON.stringify(value));};
const rp=resolve(root,'rp');
const inspect=()=>auditMaterials({rp});
const code=(report,id)=>report.diagnostics.some(d=>d.code===id);
const setPath=resolve(rp,'textures/ui/panel.texture_set.json');
const texture=async value=>put(setPath,{format_version:'1.21.30','minecraft:texture_set':value});
const cli=(...args)=>spawnSync(process.execPath,[resolve(repo,'tools/material-audit.mjs'),...args],{encoding:'utf8'});
try{
 await assert.rejects(()=>auditMaterials({rp:resolve(root,'missing')}));
 await assert.rejects(()=>auditMaterials({rp,mode:'made-up'}));
 await put(resolve(rp,'materials/panel.material'),'{// JSONC\n"materials":{"version":"1.0.0","local_base":{},"panel:local_base":{"+states":["Blending"],},},}');
 await texture({color:[200,180,140,255],metalness_emissive_roughness:[0,0,255]});
 let report=await inspect();assert.equal(report.ok,true);assert.equal(report.summary.materials,2);assert.equal(report.runtimeVerified,false);
 assert.ok(code(report,'CLASSIC_COLOR_ONLY'));
 await texture({color:[255,255,255],normal:'normal',heightmap:0,metalness_emissive_roughness:[0,0,255],metalness_emissive_roughness_subsurface:[0,0,255,0]});
 report=await inspect();for(const id of ['LAYER_UNIFORM','EXCLUSIVE_LAYERS','TEXTURE_MISSING'])assert.ok(code(report,id));
 await texture({metalness_emissive_roughness:'#FFFFFF'});assert.ok(code(await inspect(),'COLOR_REQUIRED'));
 await texture({color:'../../../../outside'});assert.ok(code(await inspect(),'TEXTURE_PATH'));
 await put(resolve(rp,'textures/ui/panel.png'),'placeholder bytes');
 await put(resolve(rp,'textures/ui/panel.tga'),'placeholder bytes');
 await texture({color:'panel'});report=await inspect();assert.equal(report.ok,true);assert.equal(report.imageReferences[0].texture,'textures/ui/panel.tga');assert.ok(code(report,'IMAGE_CONTENT_UNVERIFIED'));
 await put(resolve(rp,'textures/ui/panel.v2.png'),'placeholder bytes');await texture({color:'panel.v2'});assert.equal((await inspect()).imageReferences[0].texture,'textures/ui/panel.v2.png');
 await put(setPath,'null');assert.ok(code(await inspect(),'JSON_OBJECT'));
 await put(resolve(rp,'materials/cycle.material'),{materials:{'a:b':{},'b:a':{},'different:external':{vertexShader:'old',stencilRef:1}}});
 report=await inspect();for(const id of ['MATERIAL_CYCLE','MATERIAL_PARENT_EXTERNAL','DEPRECATED_MATERIAL_KEYS'])assert.ok(code(report,id));
 await put(resolve(rp,'materials/duplicate.material'),{materials:{'panel:external':{states:true}}});assert.ok(code(await inspect(),'MATERIAL_DUPLICATE'));
 await texture({color:'#FFFFFFFF',metalness_emissive_roughness_subsurface:[0,0,255,100]});
 report=await auditMaterials({rp,mode:'rtx'});assert.ok(code(report,'RTX_MERS_UNSUPPORTED'));
 report=await auditMaterials({rp,mode:'vibrant'});assert.ok(code(report,'MANIFEST_REQUIRED'));
 await put(resolve(rp,'manifest.json'),{header:{min_engine_version:[1,21,100]},capabilities:[]});
 report=await auditMaterials({rp,mode:'vibrant'});assert.ok(code(report,'PBR_CAPABILITY'));assert.ok(code(report,'PBR_ENGINE_VERSION'));
 await put(resolve(rp,'manifest.json'),{header:{min_engine_version:[1,21,120]},capabilities:['pbr']});
 report=await auditMaterials({rp,mode:'vibrant'});assert.equal(code(report,'PBR_ENGINE_VERSION'),false);assert.equal(code(report,'PBR_CAPABILITY'),false);
 for(const value of [null,false,0,'""',[]]){
  await put(resolve(rp,'manifest.json'),value);report=await auditMaterials({rp,mode:'vibrant'});assert.equal(report.ok,false);assert.ok(code(report,'MANIFEST_OBJECT'));
 }
 await put(resolve(rp,'manifest.json'),' '.repeat(8*1024*1024+1));assert.ok(code(await auditMaterials({rp,mode:'vibrant'}),'FILE_SIZE_LIMIT'));
 await rm(resolve(rp,'manifest.json'));
 const externalManifest=resolve(root,'outside-manifest.json');await put(externalManifest,{header:{min_engine_version:[1,21,120]},capabilities:['pbr']});
 try{
  await symlink(externalManifest,resolve(rp,'manifest.json'),'file');assert.ok(code(await auditMaterials({rp,mode:'vibrant'}),'MANIFEST_LINK'));
  await rm(resolve(rp,'manifest.json'));
 }catch(error){if(process.platform!=='win32'||error.code!=='EPERM')throw error;console.log('SKIP manifest symlink: host does not permit file symlinks');}
 await put(resolve(rp,'manifest.json'),{header:{min_engine_version:[1,21,120]},capabilities:['pbr']});
 const many={...report,diagnostics:Array.from({length:100},(_,i)=>({severity:'warning',code:'EXAMPLE',path:`${i}`,message:'Detail '.repeat(30)}))};
 const bounded=boundedMaterialAudit(many,1500);assert.ok(bounded.length+1<=1500);assert.ok(JSON.parse(bounded).omittedDiagnostics>0);assert.deepEqual(JSON.parse(bounded).summary,report.summary);
 const exact={diagnostics:[],padding:''};exact.padding='x'.repeat(1500-JSON.stringify({...exact,omittedDiagnostics:0}).length);
 assert.throws(()=>boundedMaterialAudit(exact,1500),/budget/);
 const lateError={...many,diagnostics:[...many.diagnostics.map(d=>({...d,severity:'info'})),{severity:'error',code:'MANIFEST_REQUIRED',path:'manifest.json',message:'Missing manifest.'}]};
 assert.equal(JSON.parse(boundedMaterialAudit(lateError,1500)).diagnostics[0].code,'MANIFEST_REQUIRED');
 const output=resolve(root,'report.json');const before=await readFile(setPath);
 const result=cli('--rp',rp,'--report',output,'--json');assert.equal(result.status,1,result.stderr);
 assert.equal(cli('--rp',rp,'--report',output).status,2);assert.equal(cli('--rp',rp,'--report',setPath).status,2);assert.deepEqual(await readFile(setPath),before);
 assert.equal(cli('--rp',rp,'--unknown').status,2);assert.ok(cli(`--${'x'.repeat(16000)}`).stderr.length<=1000);
 const linked=resolve(root,'linked');await mkdir(linked);await symlink(resolve(rp,'materials'),resolve(linked,'materials'),process.platform==='win32'?'junction':'dir');
 report=await auditMaterials({rp:linked});assert.equal(report.summary.materials,0);assert.ok(code(report,'SYMLINK_SKIPPED'));
 console.log('material-audit: JSONC, inheritance, texture layers, render modes, output bounds, original preservation and linked-root exclusion passed');
}finally{await rm(root,{recursive:true,force:true});}
