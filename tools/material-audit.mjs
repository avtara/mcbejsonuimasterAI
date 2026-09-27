import {writeFile} from 'node:fs/promises';
import {parseOptions} from './_lib/design-library.mjs';
import {auditMaterials,boundedMaterialAudit} from './_lib/material-audit.mjs';

async function main(){
 const opts=parseOptions(process.argv.slice(2),['rp','mode','max-chars','report'],['json','help']);
 if(opts.help){console.log('Usage: node tools/material-audit.mjs --rp DIR [--mode classic|vibrant|rtx] [--max-chars 1500..32000] [--report NEW_FILE] --json\nRead-only material inheritance and texture-set structure checks. JSON stdout defaults to 6000 characters. Existing reports are preserved. Images, shaders and Bedrock rendering remain unverified.');return;}
 const max=opts['max-chars']===undefined?6000:Number(opts['max-chars']);
 boundedMaterialAudit({diagnostics:[]},max);
 const report=await auditMaterials({rp:opts.rp,mode:opts.mode});
 const output=boundedMaterialAudit(report,max);
 if(opts.report)await writeFile(opts.report,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(output);process.exitCode=report.ok?0:1;
}
main().catch(error=>{
 const output={ok:false,runtimeVerified:false,error:error.code==='EEXIST'?'Report exists; no file overwritten':String(error.message).slice(0,400)};
 while(JSON.stringify(output).length>999)output.error=output.error.slice(0,Math.floor(output.error.length/2));
 console.error(JSON.stringify(output));process.exitCode=2;
});
