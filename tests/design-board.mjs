import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir, link, rename, symlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { ROOT, loadDesignLibrary, contrast } from '../tools/_lib/design-library.mjs';
import { createBoardModel, renderBoardHtml } from '../tools/_lib/design-board.mjs';
import { writeBoardArtifacts } from '../tools/_lib/design-board-output.mjs';

const db=await loadDesignLibrary();
const model=createBoardModel(db,{styles:'cozy16,fantasy-rpg',role:'quest',input:'touch'});
assert.deepEqual(model.cards.map(c=>c.style.id),['cozy-vanilla-16','fantasy-rpg']);
assert.equal(model.specimen,'inventory-shop');
assert.equal(model.runtimeVerified,false);
assert.equal(model.evidenceLevel,'design-proposal');
for(const card of createBoardModel(db).cards){
  assert.ok(card.sources.length && card.sources.every(s=>s.license&&s.reuse&&s.revision));
  assert.ok(contrast(card.uiColors.onAccent,card.style.palette.accent)>=4.5);
  assert.ok(contrast(card.uiColors.onFocus,card.style.palette.focus)>=4.5);
}
for(const opts of [{styles:'cozy,cozy16'},{styles:','},{styles:'missing'},{role:'webpage'},{input:'vr'}])assert.throws(()=>createBoardModel(db,opts));
const hostile=structuredClone(model);
hostile.sampleText='</script><img src=x onerror=alert(1)> & "text"';
hostile.stressText='line\u2028separator';
const html=renderBoardHtml(hostile);
assert.ok(!html.includes('<img src=x'));
assert.ok(html.includes('&lt;img src=x'));
assert.ok(html.includes('같은 화면, 2가지 디자인 방향'));
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,2,'Untrusted text must not escape into additional scripts');
assert.equal(JSON.parse(scripts[0][2]).sampleText,hostile.sampleText);
assert.equal(JSON.parse(scripts[0][2]).stressText,hostile.stressText);
new Script(scripts[1][2]);
assert.ok(html.includes("default-src 'none'"));
assert.ok(!/<(?:script|link|img)\b[^>]*(?:src|href)=["']https?:/i.test(html),'Board must work without remote resources');

// All failure experiments use disposable fixtures, never an existing board artifact.
const temporary=await mkdtemp(join(tmpdir(),'mcbe-board-transaction-'));
const pair=[{name:'index.html',text:'new HTML'},{name:'design-board.json',text:'new JSON'}];
const failSecondPromotion={link:async(source,target)=>{if(source.endsWith(join('new','design-board.json')))throw new Error('injected second promotion failure');return link(source,target);}};
try{
  const seed=async name=>{const dir=join(temporary,'workspace',name);await mkdir(dir,{recursive:true});await writeFile(join(dir,'index.html'),'original HTML');await writeFile(join(dir,'design-board.json'),'original JSON');return dir;};
  const existing=await seed('existing');
  await assert.rejects(writeBoardArtifacts(temporary,'workspace/existing',pair,{overwrite:true,operations:failSecondPromotion}),/second promotion failure/);
  assert.equal(await readFile(join(existing,'index.html'),'utf8'),'original HTML');
  assert.equal(await readFile(join(existing,'design-board.json'),'utf8'),'original JSON');
  assert.deepEqual((await readdir(existing)).sort(),['design-board.json','index.html']);

  const staged=await seed('stage-failure');
  await assert.rejects(writeBoardArtifacts(temporary,'workspace/stage-failure',pair,{overwrite:true,operations:{writeFile:async(path,text,options)=>{
    if(path.endsWith(join('new','design-board.json')))throw new Error('injected staging failure');return writeFile(path,text,options);
  }}}),/staging failure/);
  assert.equal(await readFile(join(staged,'index.html'),'utf8'),'original HTML');
  assert.equal(await readFile(join(staged,'design-board.json'),'utf8'),'original JSON');
  assert.deepEqual((await readdir(staged)).sort(),['design-board.json','index.html']);

  await assert.rejects(writeBoardArtifacts(temporary,'workspace/new',pair,{operations:failSecondPromotion}),/second promotion failure/);
  assert.deepEqual(await readdir(join(temporary,'workspace/new')),[],'A failed new pair leaves no half board or transaction');

  const backupFailure=await seed('backup-failure');
  await assert.rejects(writeBoardArtifacts(temporary,'workspace/backup-failure',pair,{overwrite:true,operations:{rename:async(source,target)=>{if(target.endsWith(join('old','design-board.json')))throw new Error('injected backup failure');return rename(source,target);}}}),/backup failure/);
  assert.equal(await readFile(join(backupFailure,'index.html'),'utf8'),'original HTML');
  assert.equal(await readFile(join(backupFailure,'design-board.json'),'utf8'),'original JSON');

  for(const operation of ['rename','link']) {
    const name=`after-${operation}`,dir=await seed(name);
    await assert.rejects(writeBoardArtifacts(temporary,`workspace/${name}`,pair,{overwrite:true,operations:{[operation]:async(source,target)=>{
      await (operation==='rename'?rename:link)(source,target);
      if((operation==='rename'?target:source).endsWith(join(operation==='rename'?'old':'new','design-board.json')))throw new Error('injected failure after mutation');
    }}}),/failure after mutation/);
    assert.equal(await readFile(join(dir,'index.html'),'utf8'),'original HTML');
    assert.equal(await readFile(join(dir,'design-board.json'),'utf8'),'original JSON');
    assert.deepEqual((await readdir(dir)).sort(),['design-board.json','index.html']);
  }

  const recovery=await seed('recovery');
  await assert.rejects(writeBoardArtifacts(temporary,'workspace/recovery',pair,{overwrite:true,operations:{link:async(source,target)=>{
    if(source.endsWith(join('new','design-board.json')))throw new Error('injected promotion failure');
    if(source.endsWith(join('old','design-board.json')))throw new Error('injected restore failure');
    return link(source,target);
  }}}),/rollback failed: design-board.json: injected restore failure; backup retained at/);
  assert.equal(await readFile(join(recovery,'index.html'),'utf8'),'original HTML','One failed restore must not prevent restoring the other file');
  assert.equal(await readFile(join(recovery,'.design-board-output.lock','old','design-board.json'),'utf8'),'original JSON');
  await assert.rejects(writeBoardArtifacts(temporary,'workspace/recovery',pair,{overwrite:true}),/recovery data is present/);

  const race='workspace/no-overwrite-race';
  await assert.rejects(writeBoardArtifacts(temporary,race,pair,{operations:{link:async(source,target)=>{await writeFile(target,'racing user file',{flag:'wx'});return link(source,target);}}}),{code:'EEXIST'});
  assert.equal(await readFile(join(temporary,race,'index.html'),'utf8'),'racing user file');
  assert.deepEqual(await readdir(join(temporary,race)),['index.html']);

  const directoryRace=join(temporary,'workspace/directory-race/index.html');
  await assert.rejects(writeBoardArtifacts(temporary,'workspace/directory-race',pair,{overwrite:true,operations:{writeFile:async(path,text,options)=>{
    await writeFile(path,text,options);
    if(path.endsWith(join('new','design-board.json'))){await mkdir(directoryRace);await writeFile(join(directoryRace,'user-file.txt'),'preserve directory contents');}
  }}}),/not a regular file/);
  assert.equal(await readFile(join(directoryRace,'user-file.txt'),'utf8'),'preserve directory contents');
  assert.deepEqual(await readdir(join(temporary,'workspace/directory-race')),['index.html']);

  const concurrent=await Promise.allSettled([
    writeBoardArtifacts(temporary,'workspace/concurrent',pair),
    writeBoardArtifacts(temporary,'workspace/concurrent',pair.map(a=>({...a,text:`other ${a.text}`}))),
  ]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
  const savedHtml=await readFile(join(temporary,'workspace/concurrent/index.html'),'utf8');
  const savedJson=await readFile(join(temporary,'workspace/concurrent/design-board.json'),'utf8');
  assert.ok((savedHtml==='new HTML'&&savedJson==='new JSON')||(savedHtml==='other new HTML'&&savedJson==='other new JSON'));
  assert.deepEqual((await readdir(join(temporary,'workspace/concurrent'))).sort(),['design-board.json','index.html']);

  await mkdir(join(temporary,'external'));
  await symlink(join(temporary,'external'),join(temporary,'workspace/redirect'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(writeBoardArtifacts(temporary,'workspace/redirect',pair),/symlink/);
  assert.deepEqual(await readdir(join(temporary,'external')),[]);
}finally{await rm(temporary,{recursive:true,force:true});}

const out=await mkdtemp(join(ROOT,'workspace','design-board-test-'));
const rel=relative(ROOT,out).replaceAll('\\','/');
const run=args=>spawnSync(process.execPath,['tools/design-board.mjs',...args],{cwd:ROOT,encoding:'utf8'});
try{
  for(const args of [['--input','vr'],['--styles','cozy','--styles','clean'],['--out','docs/no-output'],['--out',`${rel}/../escape`],['--overwrite','--overwrite'],['--styles']]){
    const result=run([...args]);assert.equal(result.status,2,result.stdout);assert.equal(JSON.parse(result.stderr).ok,false);
  }
  assert.deepEqual(await readdir(out),[]);
  const args=['--styles','cozy16,fantasy-rpg','--out',rel,'--json'];
  const made=run(args);assert.equal(made.status,0,made.stderr);
  const response=JSON.parse(made.stdout);
  assert.deepEqual(response.artifacts,[`${rel}/index.html`,`${rel}/design-board.json`]);
  assert.equal(response.runtimeVerified,false);
  const proposal=JSON.parse(await readFile(join(out,'design-board.json'),'utf8'));
  assert.deepEqual(proposal.cards.map(c=>c.style.id),response.styles);
  await writeFile(join(out,'index.html'),'user review notes');
  const refused=run(args);assert.equal(refused.status,2);assert.match(refused.stderr,/Output exists/);
  assert.equal(await readFile(join(out,'index.html'),'utf8'),'user review notes');
  const replaced=run([...args,'--overwrite']);assert.equal(replaced.status,0,replaced.stderr);
  assert.match(await readFile(join(out,'index.html'),'utf8'),/<!doctype html>/);
  const context=spawnSync(process.execPath,['tools/skill-context.mjs','mcbe-json-ui-visual-design','--needs','design-board','--json'],{cwd:ROOT,encoding:'utf8'});
  assert.equal(context.status,0,context.stderr);
  assert.deepEqual(JSON.parse(context.stdout).workflow,['design.board']);
}finally{await rm(out,{recursive:true,force:true});}
console.log('design-board: model, contrast, script containment, CLI, pair rollback, retained recovery backups, concurrent writers, junction safety and optional routing passed; browser appearance not asserted');
