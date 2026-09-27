import { relative } from 'node:path';
import { loadDesignLibrary,ROOT,safeRelative,parseOptions } from './_lib/design-library.mjs';
import { createBoardModel,renderBoardHtml } from './_lib/design-board.mjs';
import { writeBoardArtifacts } from './_lib/design-board-output.mjs';

async function main(){
 const argv=process.argv.slice(2);
 if(argv.length===1 && argv[0]==='--help'){console.log('Usage: node tools/design-board.mjs [--styles cozy16,fantasy-rpg] [--role inventory,shop] [--input mixed|touch|gamepad|keyboard] [--out workspace/path] [--overwrite] [--json]\nWrites a standalone HTML and proposal JSON. Uses one shared inventory/shop specimen; --role selects review checks, not a different screen layout. No network or RP changes. Browser geometry is not Bedrock proof.');return;}
 const opts={role:'inventory,shop',input:'mixed',out:'workspace/design-board',...parseOptions(argv,['styles','role','input','out'],['json','overwrite'])};
 safeRelative(opts.out);if(!opts.out.startsWith('workspace/'))throw new Error('Output must stay under workspace/');
 const model=createBoardModel(await loadDesignLibrary(),opts);
 const artifacts=[{name:'index.html',text:renderBoardHtml(model)},{name:'design-board.json',text:JSON.stringify(model,null,2)+'\n'}];
 const paths=await writeBoardArtifacts(ROOT,opts.out,artifacts,{overwrite:opts.overwrite});
 console.log(JSON.stringify({ok:true,evidenceLevel:model.evidenceLevel,runtimeVerified:false,styles:model.cards.map(c=>c.style.id),artifacts:paths.map(path=>relative(ROOT,path).replaceAll('\\','/'))}));
}
main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=2;});
