import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
for(const dir of ['src','public','scripts','tests'])for(const f of await readdir(dir)){if(!f.endsWith('.mjs'))continue;const result=spawnSync(process.execPath,['--check',`${dir}/${f}`],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);process.exit(1);}}
const html=await readFile('public/index.html','utf8');if(!html.includes('lang="en"')||!html.includes('viewport'))throw new Error('Missing document metadata');
console.log('JavaScript syntax and document checks passed.');
