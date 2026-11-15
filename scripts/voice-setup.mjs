// Bundle the ElevenLabs browser client for the warning phone (public/vendor/elevenlabs-client.mjs). No credentials embedded:
// the phone gets a short-lived signed URL from /api/demo/voice/session. Run once after npm ci.
import {build} from 'esbuild';import {readFile} from 'node:fs/promises';
const version=JSON.parse(await readFile('node_modules/@elevenlabs/client/package.json','utf8')).version;
await build({stdin:{contents:"export {Conversation} from '@elevenlabs/client';",resolveDir:process.cwd(),loader:'js'},bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outfile:'public/vendor/elevenlabs-client.mjs',logLevel:'warning'});
console.log('ElevenLabs client bundled ('+version+').');
