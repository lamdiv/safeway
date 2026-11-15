import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
await import('./matterport-setup.mjs');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const dir of ['public','src'])await cp(dir,'dist/'+dir,{recursive:true});
await cp('server.mjs','dist/server.mjs');await cp('package-lock.json','dist/package-lock.json');
const pkg=JSON.parse(await readFile('package.json','utf8'));pkg.scripts={start:'node --env-file-if-exists=.env server.mjs'};await writeFile('dist/package.json',JSON.stringify(pkg,null,2));
console.log('Built SafeWay Node application in dist/. API and resident sessions require the Node server; this is not a static hosted demo. Credentials and runtime records are excluded.');
