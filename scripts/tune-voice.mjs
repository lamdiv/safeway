// Apply turn-taking settings without replacing the agent's tools, voice or knowledge base.
// Run: node --env-file=.env scripts/tune-voice.mjs
import {voiceConversationSettings} from '../src/demo/voice-agent.mjs';
const key=process.env.ELEVENLABS_API_KEY,id=process.env.HEADWATER_VOICE_AGENT_ID;
if(!key||!id)throw new Error('Set ELEVENLABS_API_KEY and HEADWATER_VOICE_AGENT_ID locally.');
const url='https://api.elevenlabs.io/v1/convai/agents/'+encodeURIComponent(id),headers={'xi-api-key':key,'Content-Type':'application/json'},settings=voiceConversationSettings();
const response=await fetch(url,{method:'PATCH',headers,body:JSON.stringify({conversation_config:settings}),signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error('Voice settings update failed: '+response.status);
const read=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
if(!read.ok)throw new Error('Voice settings verification failed: '+read.status);
const {conversation_config:c}=await read.json();
for(const [section,fields] of Object.entries(settings))for(const [name,value] of Object.entries(fields))if(JSON.stringify(c[section]?.[name])!==JSON.stringify(value))throw new Error('Voice setting not applied: '+section+'.'+name);
console.log(JSON.stringify({verified:true,turnEagerness:c.turn.turn_eagerness,silenceTimeoutSeconds:c.turn.turn_timeout,backgroundSpeechFiltering:c.vad.background_voice_detection,safetyOpeningProtected:c.agent.disable_first_message_interruptions,conversationInterruptionsPreserved:c.conversation.client_events.includes('interruption')},null,2));
