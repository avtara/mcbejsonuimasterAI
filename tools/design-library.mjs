import { loadDesignLibrary, designContext, pixelArtMethod, boundedJson, parseOptions } from './_lib/design-library.mjs';

async function main() {
  const argv=process.argv.slice(2);
  if(argv.includes('--help')) {console.log('Usage: node tools/design-library.mjs styles | context --style ID [--role menu|inventory|shop|quest|settings|hud|reward|character] [--input mixed|keyboard|gamepad|touch] [--limit 0..3] | methods | method --method ID [--style ID] | sources [--source ID] | skills | verify\ncontext, method, sources and skills accept --max-chars 1500..16000. --role accepts up to three comma-separated roles, e.g. inventory,shop. All commands accept --json; JSON output is always compact. No network, pack edits, or upstream execution.');return;}
  const command=argv.shift()??'styles';
  const allowed={styles:[],context:['style','role','input','limit','max-chars'],methods:[],method:['method','style','max-chars'],sources:['source','max-chars'],skills:['max-chars'],verify:[]};
  if(!Object.hasOwn(allowed,command))throw new Error(`Unknown command ${command}`);
  const opts=parseOptions(argv,allowed[command]);
  const db=await loadDesignLibrary(); let out;
  if(command==='styles')out={styles:db.styles.map(({id,name,roles})=>({id,name,roles}))};
  if(command==='context')out=designContext(db,{...opts,limit:opts.limit===undefined?2:Number(opts.limit)});
  if(command==='methods')out={methods:db.methods.methods.map(({id,name,useWhen})=>({id,name,useWhen}))};
  if(command==='method')out=pixelArtMethod(db,opts);
  if(command==='sources'){
    if(opts.source&&!db.sources.some(s=>s.id===opts.source))throw new Error(`Unknown source ${opts.source}`);
    out={reviewedAt:db.reviewedAt,sources:db.sources.filter(s=>!opts.source||s.id===opts.source).map(s=>opts.source?s:({id:s.id,kind:s.kind,license:s.license,reuse:s.reuse,url:s.url}))};
  }
  if(command==='skills')out={sources:db.skills};
  if(command==='verify'){
    out={ok:true,styles:db.styles.length,sources:db.sources.length,skills:db.skills.length,patterns:db.patterns.length,files:db.lock.reduce((n,s)=>n+s.files.length,0),runtime:'unverified'};
  }
  console.log(boundedJson(out,opts['max-chars']===undefined?7500:Number(opts['max-chars'])));
}
main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=2;});
