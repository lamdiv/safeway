// Generated browser bundle contains no credentials. Called by both local startup and build.
import {readFile,mkdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {resolve,dirname} from 'node:path';import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url)),output=resolve(root,'public/vendor/elevenlabs-client.mjs');
let version;try{version=JSON.parse(await readFile(resolve(dirname(createRequire(import.meta.url).resolve('@elevenlabs/client')),'../package.json'),'utf8')).version;}catch{throw new Error('Voice dependencies are missing. Run npm ci, then npm run dev.');}
const marker='// SafeWay ElevenLabs browser client '+version;
let ready=false;try{ready=(await readFile(output,'utf8')).startsWith(marker);}catch{}
if(!ready){const {build}=await import('esbuild');await mkdir(resolve(root,'public/vendor'),{recursive:true});await build({stdin:{contents:"export {Conversation} from '@elevenlabs/client';",resolveDir:root,loader:'js'},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,banner:{js:marker},outfile:output,logLevel:'warning'});console.log('ElevenLabs browser client prepared ('+version+'). No credentials embedded.');}
