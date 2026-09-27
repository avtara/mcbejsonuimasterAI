import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, validateLock, cachePath, hash, fetchPinned, storePinned, parseOptions } from './_lib/design-library.mjs';

async function main(){
  const argv=process.argv.slice(2);
  if(argv.includes('--help')){console.log('Usage: node tools/design-source-sync.mjs --source ID [--download | --verify] [--json]\nDefault: compact download plan. Cache: workspace/design-library/upstreams. Downloads pinned files only; archives stay zipped. No dependency install, upstream code execution or pack mutation.');return;}
  const opts=parseOptions(argv,['source'],['download','verify','json']);
  if(opts.download&&opts.verify)throw new Error('Choose download or verify');
  const {sources}=JSON.parse(await readFile(resolve(ROOT,'config/design-research-lock.json'),'utf8'));validateLock(sources);
  const s=sources.find(s=>s.id===opts.source);if(!s)throw new Error('Select one known --source ID using design-library.mjs sources');
  const cache=resolve(ROOT,'workspace/design-library/upstreams');
  const base={source:s.id,revision:s.revision,license:s.license,reuse:s.reuse,files:s.files.length,bytes:s.files.reduce((n,f)=>n+f.bytes,0)};
  if(!opts.download&&!opts.verify){console.log(JSON.stringify({...base,mode:'plan',cache:'workspace/design-library/upstreams',executesCode:false}));return;}
  let verified=0,downloaded=0;const failures=[];
  for(const f of s.files){
    try{
      const key=`${s.id}/${f.path}`;const target=await cachePath(cache,key);
      let bytes;try{bytes=await readFile(target);}catch(e){if(e.code!=='ENOENT')throw e;}
      if(bytes){if(bytes.length!==f.bytes||hash(bytes)!==f.sha256)throw new Error('SOURCE_HASH_MISMATCH; existing file preserved');verified++;continue;}
      if(!opts.download)throw new Error('SOURCE_MISSING');
      bytes=await fetchPinned(f);
      const stored=await storePinned(cache,key,f,bytes);
      if(stored==='cached')verified++;else downloaded++;
    }catch(error){failures.push({file:f.path,error:error.message});}
  }
  console.log(JSON.stringify({...base,ok:failures.length===0,verified,downloaded,failures:failures.slice(0,8),failureCount:failures.length}));
  if(failures.length)process.exitCode=3;
}
main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=2;});
