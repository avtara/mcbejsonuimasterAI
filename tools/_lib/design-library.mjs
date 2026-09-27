import { readFile, lstat, mkdir, writeFile, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, relative, isAbsolute, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async p => JSON.parse(await readFile(resolve(ROOT, p), 'utf8'));
export async function loadDesignLibrary() {
  const [styles, sources, game, lock, patterns, skills, methods] = await Promise.all([
    json('data/design-styles.json'), json('data/design-sources.json'), json('data/game-ui-design.json'),
    json('config/design-research-lock.json'), json('data/bedrock-source-patterns.json'), json('data/design-skill-sources.json'),
    json('data/pixel-art-methods.json'),
  ]);
  const db = { styles:styles.styles, sources:sources.sources, game, lock:lock.sources, patterns:patterns.patterns, skills:skills.sources, methods, reviewedAt:sources.reviewedAt };
  validateDesignLibrary(db);
  return db;
}
// Both CLIs reject ambiguous flags before reading files or downloading anything.
export function parseOptions(argv, values=[], flags=['json']) {
  const opts={};
  for(let i=0;i<argv.length;i++) {
    const option=argv[i], key=option.startsWith('--')?option.slice(2):'';
    if(!values.includes(key)&&!flags.includes(key))throw new Error(`Unknown option ${option}`);
    if(Object.hasOwn(opts,key))throw new Error(`Duplicate option ${option}`);
    if(flags.includes(key)){opts[key]=true;continue;}
    const value=argv[++i];
    if(!value || value.startsWith('--'))throw new Error(`Missing value for ${option}`);
    opts[key]=value;
  }
  return opts;
}
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':') || isAbsolute(value) || value.split('/').some(p=>!p || p==='.' || p==='..' || /[\x00-\x1f<>|?*]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error(`Unsafe relative path: ${value}`);
  return value;
}
export function contained(root, subpath) {
  const p = resolve(root, safeRelative(subpath));
  const rel = relative(root, p);
  if (rel.startsWith(`..${sep}`) || rel==='..' || isAbsolute(rel)) throw new Error('Path escapes cache root');
  return p;
}
export function validateLock(sources) {
  if(!Array.isArray(sources)||!sources.length)throw new Error('Lock sources must be a nonempty array');
  const ids = new Set();
  for (const s of sources) {
    if (!s || typeof s.id!=='string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.id) || ids.has(s.id)) throw new Error(`Invalid/duplicate source id: ${s?.id}`);
    safeRelative(s.id);
    ids.add(s.id);
    if (!['github','asset-archive'].includes(s.kind))throw new Error(`Unknown source kind: ${s.id}/${s.kind}`);
    if (typeof s.license!=='string' || !s.license.trim() || typeof s.revision!=='string' || !['reference','reference-only','analysis-only','optional-reuse'].includes(s.reuse) || !Array.isArray(s.files) || !s.files.length) throw new Error(`Incomplete source: ${s.id}`);
    const sourceUrl=new URL(s.url);
    if(sourceUrl.protocol!=='https:' || sourceUrl.username || sourceUrl.password || sourceUrl.port || sourceUrl.search || sourceUrl.hash)throw new Error(`Invalid source URL: ${s.id}`);
    const repository=sourceUrl.pathname.replace(/\/$/,'');
    if(s.kind==='github' && (sourceUrl.hostname!=='github.com' || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(s.revision)))throw new Error(`Invalid github source: ${s.id}`);
    if(s.kind==='asset-archive' && (sourceUrl.hostname!=='kenney.nl' || !/^\/assets\/[^/]+$/.test(repository) || s.files.length!==1 || s.revision!==`sha256:${s.files[0]?.sha256}`))throw new Error(`Invalid archive source: ${s.id}`);
    const paths = new Set();
    for (const f of s.files) {
      safeRelative(f?.path);
      const portablePath=f.path.toLowerCase();
      if (paths.has(portablePath)) throw new Error(`Duplicate file (case-insensitive): ${s.id}/${f.path}`);
      paths.add(portablePath);
      const u = new URL(f.url);
      if (u.protocol!=='https:' || u.username || u.password || u.port || u.search || u.hash || !['raw.githubusercontent.com','kenney.nl'].includes(u.hostname)) throw new Error(`Unapproved download origin: ${f.url}`);
      if (s.kind==='github' && (u.hostname!=='raw.githubusercontent.com' || decodeURIComponent(u.pathname)!==`${repository}/${s.revision}/${f.path}`)) throw new Error(`Unpinned github URL or source/path mismatch: ${s.id}/${f.path}`);
      if (s.kind==='asset-archive' && (u.hostname!=='kenney.nl' || !u.pathname.startsWith(`/media/pages${repository}/`) || !u.pathname.endsWith('.zip')))throw new Error(`Archive URL/source mismatch: ${s.id}`);
      if (!/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes<1 || f.bytes>25*1024*1024) throw new Error(`Invalid file digest/size: ${s.id}/${f.path}`);
    }
    for(const path of paths){const parts=path.split('/');parts.pop();while(parts.length){if(paths.has(parts.join('/')))throw new Error(`File/directory collision: ${s.id}/${path}`);parts.pop();}}
  }
}

const nonempty = (value,label) => {if(typeof value!=='string'||!value.trim())throw new Error(`Invalid ${label}: expected nonempty text`);};
const stringList = (value,label,allowEmpty=false) => {
  if(!Array.isArray(value)||(!allowEmpty&&!value.length)||value.some(v=>typeof v!=='string'||!v.trim())||new Set(value).size!==value.length)throw new Error(`Invalid ${label}: expected unique text array`);
};
const uniqueRecords = (records,label,allowEmpty=false) => {
  if(!Array.isArray(records)||(!allowEmpty&&!records.length))throw new Error(`Invalid ${label}: expected array`);
  const ids=new Set();for(const record of records){if(!record||typeof record.id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)||ids.has(record.id))throw new Error(`Invalid/duplicate ${label} id: ${record?.id}`);ids.add(record.id);}
};
export function validateDesignLibrary(db) {
  validateLock(db.lock);
  for(const name of ['styles','sources','skills','patterns'])uniqueRecords(db[name],name,name==='patterns');
  const locked=new Map(db.lock.map(s=>[s.id,s]));
  const sourceIds=new Set(db.sources.map(s=>s.id));
  if(sourceIds.size!==locked.size || [...locked.keys()].some(id=>!sourceIds.has(id)))throw new Error('Source catalog and lock IDs differ');
  if(!db.game?.roles || !db.game.inputs)throw new Error('Invalid game role/input checks');
  stringList(db.game.principles,'game principles');
  for(const [role,checks] of Object.entries(db.game.roles))stringList(checks,`role ${role}`);
  for(const input of ['keyboard','gamepad','touch','mixed'])stringList(db.game.inputs[input],`input ${input}`);
  for(const s of [...db.sources,...db.skills]) {
    if(!['official','addon','community-docs','art','external-skill','tooling'].includes(s.kind))throw new Error(`Unknown source catalog kind: ${s.id}/${s.kind}`);
    const lock=locked.get(s.id);
    if(!lock)throw new Error(`Source missing lock: ${s.id}`);
    for(const field of ['url','revision','revisionDate','license','reuse'])if((s[field]??null)!==(lock[field]??null))throw new Error(`Source metadata mismatch: ${s.id}/${field}`);
    if(s.fileCount!==lock.files.length || s.bytes!==lock.files.reduce((n,f)=>n+f.bytes,0))throw new Error(`Source inventory mismatch: ${s.id}`);
    if(s.runtime!=='unverified' || s.pathScope!=='upstream')throw new Error(`Invalid source evidence scope: ${s.id}`);
    if(s.evidence!==undefined){if(!Array.isArray(s.evidence)||!s.evidence.length)throw new Error(`Missing source evidence: ${s.id}`);for(const e of s.evidence)validateSourceEvidence(e,lock);}
  }
  const aliases=new Map();
  for(const style of db.styles) {
    nonempty(style.name,`style ${style.id} name`);
    stringList(style.aliases,`style ${style.id} aliases`,true);
    stringList(style.roles,`style ${style.id} roles`);
    stringList(style.sources,`style ${style.id} sources`);
    if(style.roles.some(r=>!Object.hasOwn(db.game.roles,r)))throw new Error(`Unknown style role: ${style.id}`);
    for(const id of style.sources)if(!sourceIds.has(id))throw new Error(`Style missing source: ${style.id}/${id}`);
    for(const alias of [style.id,...style.aliases]){const key=alias.trim().toLowerCase();if(aliases.has(key)&&aliases.get(key)!==style.id)throw new Error(`Ambiguous style alias: ${alias}`);aliases.set(key,style.id);}
    for(const color of ['background','surface','text','accent','success','danger','focus'])if(!/^#[a-f0-9]{6}$/i.test(style.palette?.[color]))throw new Error(`Invalid palette color: ${style.id}/${color}`);
  }
  for(const skill of db.skills) {
    const lock=locked.get(skill.id);
    if(skill.kind!=='external-skill' || !['adapt','reference-only'].includes(skill.treatment))throw new Error(`Invalid external skill treatment: ${skill.id}`);
    if(!Array.isArray(skill.evidence)||!skill.evidence.length)throw new Error(`Missing skill evidence: ${skill.id}`);
    for(const e of skill.evidence){const f=lock.files.find(f=>f.path===e?.path);if(!f||f.sha256!==e.sha256||!Number.isSafeInteger(e.lineStart)||e.lineStart<1||!Number.isSafeInteger(e.lineEnd)||e.lineEnd<e.lineStart)throw new Error(`Skill evidence mismatch: ${skill.id}/${e?.path}`);}
    nonempty(skill.licensePath,`skill ${skill.id} license path`);
    for(const path of [skill.licensePath,skill.noticePath].filter(Boolean))if(!lock.files.some(f=>f.path===path))throw new Error(`Skill license not pinned: ${skill.id}/${path}`);
    const source=db.sources.find(s=>s.id===skill.id);
    if(JSON.stringify(source.evidence)!==JSON.stringify(skill.evidence)||source.licensePath!==skill.licensePath||source.noticePath!==skill.noticePath)throw new Error(`Skill/catalog evidence mismatch: ${skill.id}`);
  }
  for(const p of db.patterns) {
    const lock=locked.get(p.sourceId);
    if(!lock)throw new Error(`Pattern missing source: ${p.id}`);
    stringList(p.paths,`pattern ${p.id} paths`);
    stringList(p.roles,`pattern ${p.id} roles`);
    if(p.screenRoles!==undefined){stringList(p.screenRoles,`pattern ${p.id} screenRoles`,true);if(p.screenRoles.some(r=>!Object.hasOwn(db.game.roles,r)))throw new Error(`Unknown pattern screen role: ${p.id}`);}
    if(p.contextPolicy!==undefined && p.contextPolicy!=='explicit-source-only')throw new Error(`Unknown pattern context policy: ${p.id}`);
    if(p.pathScope!=='upstream')throw new Error(`Invalid pattern evidence scope: ${p.id}`);
    for(const path of p.paths)if(!lock.files.some(f=>f.path===path))throw new Error(`Pattern missing pinned file: ${p.id}/${path}`);
    nonempty(p.summary,`pattern ${p.id} summary`);nonempty(p.adaptation,`pattern ${p.id} adaptation`);stringList(p.limitations,`pattern ${p.id} limitations`);
  }
  validatePixelArtMethods(db.methods,sourceIds);
}
function validateSourceEvidence(e,source) {
  const file=source.files.find(f=>f.path===e?.path);
  if(!file || file.sha256!==e.sha256 || !Number.isSafeInteger(e.lineStart) || e.lineStart<1 || !Number.isSafeInteger(e.lineEnd) || e.lineEnd<e.lineStart)throw new Error(`Source evidence mismatch: ${source.id}/${e?.path}`);
}
export function validatePixelArtMethods(catalog,sourceIds) {
  if(catalog?.schema!=='mcbe-pixel-art-methods@1')throw new Error('Unsupported pixel art methods schema');
  if(typeof catalog.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(catalog.reviewedAt)||!Number.isFinite(Date.parse(catalog.reviewedAt))||new Date(catalog.reviewedAt).toISOString().slice(0,10)!==catalog.reviewedAt)throw new Error('Invalid pixel art methods review date');
  if(catalog.policy?.defaultLoad!=='selected-method-only'||catalog.policy.executeSourceCode!==false||catalog.policy.installExternalTools!==false)throw new Error('Invalid pixel art methods execution/context policy');
  uniqueRecords(catalog.methods,'pixel art methods');
  for(const method of catalog.methods) {
    nonempty(method.name,`method ${method.id} name`);nonempty(method.useWhen,`method ${method.id} useWhen`);
    for(const field of ['sourceIds','inputs','steps','outputs','checks','limits'])stringList(method[field],`method ${method.id} ${field}`);
    for(const id of method.sourceIds)if(!sourceIds.has(id))throw new Error(`Method missing source: ${method.id}/${id}`);
  }
}
export function contrast(a,b) {
  if(!/^#[a-f0-9]{6}$/i.test(a)||!/^#[a-f0-9]{6}$/i.test(b))throw new Error('contrast requires opaque #RRGGBB colors');
  const lum = hex => {
    const v = hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    return .2126*v[0]+.7152*v[1]+.0722*v[2];
  };
  const x=lum(a),y=lum(b); return Math.round(((Math.max(x,y)+.05)/(Math.min(x,y)+.05))*100)/100;
}
function selectStyle(db,style) {
  const normalized=typeof style==='string'?style.trim().toLowerCase():style;
  const s=db.styles.find(s=>s.id===normalized || s.aliases.some(alias=>alias.trim().toLowerCase()===normalized));
  if (!s) throw new Error(`Unknown style ${style??'<missing>'}; run styles first`);
  return s;
}
const withoutStyleAliases = ({aliases,roles,...style})=>style;
const sourceMetadata = ({id,url,revision,license,reuse,runtime})=>({id,url,revision,license,reuse,runtime});
export function pixelArtMethod(db,{method,style}={}) {
  const selected=db.methods.methods.find(m=>m.id===method);
  if(!selected)throw new Error(`Unknown method ${method??'<missing>'}; run methods first`);
  const selectedStyle=style===undefined?undefined:withoutStyleAliases(selectStyle(db,style));
  const ids=new Set([...selected.sourceIds,...(selectedStyle?.sources??[])]);
  const sources=db.sources.filter(s=>ids.has(s.id)).map(s=>({...sourceMetadata(s),...(s.evidence?{evidence:s.evidence,pathScope:s.pathScope}:{} )}));
  return {schema:'mcbe-pixel-art-method-context@1',reviewedAt:db.methods.reviewedAt,decisionStatus:'authored-adaptation',runtime:'unverified',method:selected,
    ...(selectedStyle?{style:selectedStyle}:{}),sources,
    boundary:'Reviewed workflow adaptation only. Upstream source code is not executed and external tools are not installed. Style proposals are not measured geometry; validate PNG alpha, actual dimensions, metadata and Bedrock behavior separately.',
  };
}
export function designContext(db, {style,role='menu',input='mixed',limit=2}={}) {
  const s=selectStyle(db,style);
  const roles=[...new Set(typeof role==='string'?role.split(',').map(r=>r.trim()):[])];
  if (!roles.length || roles.length>3 || roles.some(r=>!Object.hasOwn(db.game.roles,r))) throw new Error(`Unknown role or more than three roles: ${role}`);
  if (!Object.hasOwn(db.game.inputs,input)) throw new Error(`Unknown input ${input}`);
  if (!Number.isInteger(limit) || limit<0 || limit>3) throw new Error('limit must be 0..3');
  const patterns=db.patterns.filter(p=>p.contextPolicy!=='explicit-source-only' && (p.screenRoles??p.roles).some(r=>roles.includes(r))).slice(0,limit);
  const sourceIds=new Set([...s.sources,...patterns.map(p=>p.sourceId)]);
  const sources=db.sources.filter(s=>sourceIds.has(s.id)).map(sourceMetadata);
  const styleCard=withoutStyleAliases(s);
  return {schema:'mcbe-design-context@1',reviewedAt:db.reviewedAt,decisionStatus:'authored-proposal',style:styleCard,role,input,
    paletteCheck:{textOnSurface:contrast(s.palette.text,s.palette.surface),method:'opaque sRGB luminance ratio; actual texture/alpha/font/device unverified'},
    checks:[...db.game.principles,...roles.flatMap(r=>db.game.roles[r]),...new Set(input==='mixed'?Object.values(db.game.inputs).flat():db.game.inputs[input])],patterns,sources,
    optionalReference:'skills/mcbe-json-ui-visual-design/references/design-skill-adapters.md',
    boundary:'Style proposals are not measured geometry or runtime proof. Verify actual texture paths, bindings, font/profile and BP state separately.',
  };
}
export function boundedJson(value, maxChars=7500) {
  if (!Number.isInteger(maxChars) || maxChars<1500 || maxChars>16000) throw new Error('max-chars must be 1500..16000');
  const result=structuredClone(value);
  // Remove optional whole cards only. Never truncate evidence, licenses, strings or JSON.
  let text=JSON.stringify(result);
  while (text.length>maxChars && result.patterns?.length) {
    result.patterns.pop(); result.omittedPatterns=(result.omittedPatterns??0)+1;
    // Keep provenance for the retained style/cards, without paying for removed cards.
    if(result.schema==='mcbe-design-context@1'){
      const needed=new Set([...result.style.sources,...result.patterns.map(p=>p.sourceId)]);
      result.sources=result.sources.filter(s=>needed.has(s.id));
    }
    text=JSON.stringify(result);
  }
  if (text.length>maxChars) throw new Error(`OUTPUT_BUDGET_TOO_SMALL: requires ${text.length} characters; select fewer sources or increase max-chars (max 16000)`);
  return text;
}

// Refuse existing symlinks/junctions before any cache read/write; writes use exclusive temporary files.
export async function cachePath(cacheRoot, subpath, create=false) {
  const absolute=contained(cacheRoot,subpath);
  const root=resolve(cacheRoot);
  let cursor;
  // Also check ancestors: a junction above cacheRoot must not redirect writes outside workspace.
  const ancestors=[]; for(let p=root;;p=dirname(p)){ancestors.unshift(p);if(dirname(p)===p)break;}
  for(const p of ancestors){try{if((await lstat(p)).isSymbolicLink())throw new Error(`Cache symlink refused: ${p}`);}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(create)await mkdir(root,{recursive:true});
  cursor=root;
  for(const part of subpath.split('/')) {
    cursor=resolve(cursor,part);
    try { if((await lstat(cursor)).isSymbolicLink()) throw new Error(`Cache symlink refused: ${part}`); }
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  if(create)await mkdir(dirname(absolute),{recursive:true});
  return absolute;
}
export async function fetchPinned(file) {
  const response=await fetch(file.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const chunks=[]; let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>file.bytes)throw new Error('Download exceeds pinned size');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(bytes.length!==file.bytes || hash(bytes)!==file.sha256)throw new Error('SOURCE_HASH_MISMATCH');
  return bytes;
}
export async function storePinned(cacheRoot,subpath,file,bytes) {
  if(bytes.length!==file.bytes || hash(bytes)!==file.sha256)throw new Error('SOURCE_HASH_MISMATCH');
  const target=await cachePath(cacheRoot,subpath,true);
  const checkExisting=async()=>{await cachePath(cacheRoot,subpath);const old=await readFile(target);if(old.length===file.bytes&&hash(old)===file.sha256)return 'cached';throw new Error('Existing cache differs; preserve it and use a fresh cache directory');};
  try{return await checkExisting();}catch(e){if(e.code!=='ENOENT')throw e;}
  const temporary=`${target}.${randomUUID()}.tmp`;
  try{
    await writeFile(temporary,bytes,{flag:'wx'});
    try{await link(temporary,target);}catch(e){if(e.code!=='EEXIST')throw e;return await checkExisting();}
  }finally{await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  return 'downloaded';
}
