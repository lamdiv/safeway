await import('./voice-setup.mjs');
import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const dir of ['public','src'])await cp(dir,'dist/'+dir,{recursive:true,filter:source=>!source.includes('/matterport-assets')&&!source.endsWith('/safeway-matterport.mjs')});await mkdir('dist/scripts',{recursive:true});await cp('scripts/run-demo.mjs','dist/scripts/run-demo.mjs');await cp('scripts/voice-setup.mjs','dist/scripts/voice-setup.mjs');
await cp('server.mjs','dist/server.mjs');await cp('package-lock.json','dist/package-lock.json');
const pkg=JSON.parse(await readFile('package.json','utf8'));pkg.scripts={start:'node --env-file-if-exists=.env scripts/run-demo.mjs'};await writeFile('dist/package.json',JSON.stringify(pkg,null,2));
console.log('Built SafeWay Node application in dist/. API and resident sessions require the Node server; this is not a static hosted demo. Credentials and runtime records are excluded.');
