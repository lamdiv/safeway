import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {dirname} from 'node:path';
import {createExercise,applyOperation} from './operations.mjs';
export function operationsStore({path,assets,roads}){
 let state=null,queue=Promise.resolve();
 async function init(){if(state)return;try{const loaded=JSON.parse(await readFile(path,'utf8'));if(loaded.schema!=='headwater.operations.v1')throw new Error('Unsupported operations schema');state=loaded;}catch(e){if(e.code!=='ENOENT')throw e;state=createExercise(assets,roads);await persist();}}
 async function persist(){await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(state,null,2));await rename(path+'.tmp',path);}
 function serial(fn){const next=queue.then(fn);queue=next.catch(()=>{});return next;}
 return {get:()=>serial(async()=>{await init();return structuredClone(state);}),apply:action=>serial(async()=>{await init();state=applyOperation(state,action,roads);await persist();return structuredClone(state);}),reset:()=>serial(async()=>{state=createExercise(assets,roads);await persist();return structuredClone(state);})};
}
