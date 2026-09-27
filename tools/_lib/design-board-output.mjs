import { mkdir, writeFile, rename, link, unlink, lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { cachePath, safeRelative } from './design-library.mjs';

// The directory is also an exclusive writer lock. Failed recovery keeps it intact.
const transactionName='.design-board-output.lock';
const names=['index.html','design-board.json'];

export async function writeBoardArtifacts(root,out,artifacts,{overwrite=false,operations={}}={}) {
  safeRelative(out);
  if(!out.startsWith('workspace/'))throw new Error('Output must stay under workspace/');
  if(artifacts.length!==names.length || artifacts.some((a,i)=>a.name!==names[i]||typeof a.text!=='string'))throw new Error('Expected the complete HTML/JSON board pair');
  const io={mkdir,writeFile,rename,link,unlink,lstat,rm,...operations};
  const stat=async path=>{try{return await io.lstat(path,{bigint:true});}catch(error){if(error.code==='ENOENT')return null;throw error;}};
  const entries=[];
  for(const artifact of artifacts) {
    const path=await cachePath(root,`${out}/${artifact.name}`,true);
    const existing=await stat(path);
    if(existing && !existing.isFile())throw new Error(`Output is not a regular file: ${artifact.name}`);
    if(existing && !overwrite)throw new Error(`Output exists: ${artifact.name}; use another directory or --overwrite`);
    entries.push({...artifact,path});
  }
  const transaction=await cachePath(root,`${out}/${transactionName}`);
  try{await io.mkdir(transaction);}catch(error){if(error.code==='EEXIST')throw new Error(`Output transaction already exists; another writer or recovery data is present: ${transaction}`);throw error;}
  const journal=[];
  const cleanup=async()=>{await cachePath(root,`${out}/${transactionName}`);await io.rm(transaction,{recursive:true,force:true});};
  const sameFile=(a,b)=>a&&b&&a.isFile()&&b.isFile()&&a.dev===b.dev&&a.ino===b.ino;
  try {
    await io.mkdir(join(transaction,'new'));
    await io.mkdir(join(transaction,'old'));
    for(const entry of entries){entry.staged=join(transaction,'new',entry.name);entry.backup=join(transaction,'old',entry.name);await io.writeFile(entry.staged,entry.text,{flag:'wx'});}
    for(const entry of entries) {
      await cachePath(root,`${out}/${entry.name}`);
      const current=await stat(entry.path);
      if(current && !current.isFile())throw new Error(`Output is not a regular file: ${entry.name}`);
      journal.push(entry); // Record intent before each move/link, including failures after the operation.
      if(overwrite){try{await io.rename(entry.path,entry.backup);}catch(error){if(error.code!=='ENOENT')throw error;}}
      entry.promotionAttempted=true;
      await io.link(entry.staged,entry.path); // Exclusive: a racing file is never overwritten.
    }
  } catch(error) {
    const recoveryErrors=[];
    for(const entry of [...journal].reverse()) {
      try {
        await cachePath(root,`${out}/${entry.name}`);
        if(entry.promotionAttempted && sameFile(await stat(entry.path),await stat(entry.staged)))await io.unlink(entry.path);
        if(await stat(entry.backup)) {
          try{await io.link(entry.backup,entry.path);}catch(restoreError){if(restoreError.code!=='EEXIST'||!sameFile(await stat(entry.backup),await stat(entry.path)))throw restoreError;}
          await io.unlink(entry.backup);
        }
      } catch(restoreError){recoveryErrors.push(`${entry.name}: ${restoreError.message}`);}
    }
    if(recoveryErrors.length)throw new Error(`Board write failed: ${error.message}; rollback failed: ${recoveryErrors.join('; ')}; backup retained at ${transaction}`,{cause:error});
    try{await cleanup();}catch(cleanupError){throw new Error(`Board write failed: ${error.message}; cleanup failed: ${cleanupError.message}; transaction retained at ${transaction}`,{cause:error});}
    throw error;
  }
  // A cleanup failure after commit must not start rollback after backups may have been removed.
  try{await cleanup();}catch(error){throw new Error(`Board pair saved; transaction cleanup failed: ${error.message}; inspect ${transaction}`,{cause:error});}
  return entries.map(entry=>entry.path);
}
