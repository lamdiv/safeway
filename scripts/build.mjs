import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});await cp('src','dist/src',{recursive:true});
for(const name of ['agent.mjs','models.mjs','voice.mjs','operations-store.mjs'])await rm('dist/src/'+name,{force:true});
await mkdir('dist/api',{recursive:true});await writeFile('dist/api/config',JSON.stringify({agentAvailable:false,mode:'static-demo',voice:{configured:false},provider:'AWS Bedrock'}));await writeFile('dist/api/operations',JSON.stringify({state:null,persistence:'browser'}));
console.log('Built static research demo in dist/. Live Bedrock agent remains in the local Node server.');
