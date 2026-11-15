import {cp,mkdir,readFile,writeFile,access} from 'node:fs/promises';import {build} from 'esbuild';
const version=JSON.parse(await readFile('node_modules/@matterport/webcomponent/package.json','utf8')).version;
let installed=false;try{installed=(await readFile('public/matterport-assets/.safeway-version','utf8'))===version;await access('public/vendor/safeway-matterport.mjs');}catch{}
if(!installed){await mkdir('public/matterport-assets',{recursive:true});await cp('node_modules/@matterport/webcomponent/built-bundle','public/matterport-assets',{recursive:true});await build({entryPoints:['src/safeway/matterport-browser.mjs'],bundle:true,outfile:'public/vendor/safeway-matterport.mjs',format:'esm',target:'es2022',minify:true,logLevel:'silent'});await writeFile('public/matterport-assets/.safeway-version',version);}
console.log('Matterport web component and static assets prepared ('+version+'). No credentials embedded.');
