import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve} from 'node:path';
const execute=promisify(execFile),pending=new Map();let active=0;const waiters=[];
export async function warningVoice(text){
 if(typeof text!=='string'||text.length>2200)throw new Error('Invalid warning text');
 const key=createHash('sha256').update(text).digest('hex');if(pending.has(key))return pending.get(key);
 const task=(async()=>{const dir=resolve('.sites-runtime/response-voice'),path=resolve(dir,key+'.wav');try{return await readFile(path);}catch{}
  if(active>=2)await new Promise(resolve=>waiters.push(resolve));active++;
  try{await mkdir(dir,{recursive:true,mode:0o700});const temp=path+'.tmp.wav';await execute('/usr/bin/say',['-v','Samantha','--file-format=WAVE','--data-format=LEI16@22050','-r','175','-o',temp,text],{timeout:20000});const data=await readFile(temp);await writeFile(path,data,{mode:0o600});await import('node:fs/promises').then(fs=>fs.unlink(temp).catch(()=>{}));return data;}
  finally{active--;waiters.shift()?.();}
 })().catch(error=>{pending.delete(key);throw error;});pending.set(key,task);if(pending.size>150)pending.delete(pending.keys().next().value);return task;
}
