import {readFile,readdir} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
async function check(dir){for(const f of await readdir(dir,{withFileTypes:true})){if(['vendor','matterport-assets','data'].includes(f.name))continue;const name=dir+'/'+f.name;if(f.isDirectory())await check(name);else if(f.name.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',name],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);}}}
for(const d of ['src','public','scripts','tests'])await check(d);
for(const name of ['operator.html','resident.html']){const html=await readFile('public/'+name,'utf8');if(!html.includes('lang="en"')||!html.includes('viewport'))throw new Error(name+' lacks required metadata');}
JSON.parse(await readFile('docs/safeway/sample-responses.json'));JSON.parse(await readFile('docs/safeway/evidence-manifest.example.json'));console.log('Recursive JavaScript, SafeWay document and contract JSON checks passed.');
