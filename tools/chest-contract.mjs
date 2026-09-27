import { resolve } from 'node:path';
import { realpath, writeFile } from 'node:fs/promises';
import { readJsonc } from './_lib/jsonc.mjs';
import { parseOptions, boundedJson } from './_lib/design-library.mjs';
import { compileChestPlan } from './_lib/chest-contract.mjs';

const usage='Usage: node tools/chest-contract.mjs --contract FILE [--page ID] [--max-chars 1500..16000] [--report NEW_FILE] [--json]\nValidates declarations and emits a compact plan summary. --page includes one full slot map; larger maps may require --max-chars 16000. --report creates the full plan exclusively; existing files are never overwritten. No RP/BP generation, code execution or Bedrock runtime claim.';
const argumentError=message=>Object.assign(new Error(message),{exitCode:64});
async function main() {
  let options;
  try{options=parseOptions(process.argv.slice(2),['contract','page','max-chars','report'],['json','help']);}catch(error){throw argumentError(error.message);}
  if(options.help){console.log(usage);return;}
  if(!options.contract)throw argumentError('--contract is required');
  const maxChars=options['max-chars']===undefined?7500:Number(options['max-chars']);
  if(!Number.isInteger(maxChars)||maxChars<1500||maxChars>16000)throw argumentError('max-chars must be 1500..16000');
  const input=await realpath(resolve(options.contract));
  if(options.report){const target=await realpath(resolve(options.report)).catch(error=>{if(error.code!=='ENOENT')throw error;return resolve(options.report);});if(target===input)throw argumentError('Report must not overwrite the input contract');}
  const plan=compileChestPlan(await readJsonc(input));
  let output=plan;
  if(plan.ok) {
    if(options.page&&!plan.pages.some(p=>p.id===options.page))throw argumentError(`Unknown page ${options.page}`);
    output={...plan,pages:options.page?plan.pages.filter(p=>p.id===options.page):plan.pages.map(p=>({id:p.id,slotCount:p.slotMap.length,interactiveCount:p.slotMap.filter(s=>s.enabled).length,placeholderCount:p.slotMap.filter(s=>s.role==='placeholder').length}))};
  }
  let serialized;try{serialized=boundedJson(output,maxChars);}catch(error){throw argumentError(error.message);}
  // Exclusive creation rejects existing files, symlinks and hard-link aliases of input.
  if(options.report)await writeFile(resolve(options.report),`${JSON.stringify(plan,null,2)}\n`,{flag:'wx'});
  console.log(serialized);
  if(!plan.ok)process.exitCode=9;
}
main().catch(error=>{
  const output={ok:false,error:(error.code==='EEXIST'?'Report already exists; nothing was overwritten':String(error.message)).slice(0,900)};
  // Include JSON escaping and the final newline in the diagnostic budget.
  while(JSON.stringify(output).length>999)output.error=output.error.slice(0,Math.floor(output.error.length/2));
  console.error(JSON.stringify(output));process.exitCode=error.exitCode??1;
});
