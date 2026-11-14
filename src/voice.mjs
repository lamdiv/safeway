/** Photon SIP line + ElevenLabs voice-agent adapter. Never send during tests without an explicit mocked transport. */
export function voiceConfiguration(env=process.env){return {configured:Boolean(env.ELEVENLABS_API_KEY&&env.HEADWATER_VOICE_AGENT_ID&&env.HEADWATER_VOICE_PHONE_ID),provider:'Photon SIP / ElevenLabs',allowlistCount:(env.HEADWATER_TEST_RECIPIENTS||'').split(',').filter(Boolean).length,liveCallsRequireApproval:true};}
export function validateTestCall(input,env=process.env){
 if(input.approval!=='CALL TEST PARTICIPANT')throw new Error('Explicit test-call approval is required.');
 if(typeof input.to!=='string'||!/^\+[1-9]\d{6,14}$/.test(input.to))throw new Error('Recipient must be an international E.164 test number.');
 const allowed=(env.HEADWATER_TEST_RECIPIENTS||'').split(',').map(x=>x.trim()).filter(Boolean);if(!allowed.includes(input.to))throw new Error('Recipient is not on the server test-contact allowlist.');
 if(!voiceConfiguration(env).configured)throw new Error('Photon SIP / ElevenLabs voice is not configured. No call has been made.');
 if(typeof input.requestId!=='string'||input.requestId.length>100)throw new Error('A request ID is required.');
 return {agent_id:env.HEADWATER_VOICE_AGENT_ID,agent_phone_number_id:env.HEADWATER_VOICE_PHONE_ID,to_number:input.to,conversation_initiation_client_data:{dynamic_variables:{incident_name:'Headwater exercise — no actual emergency dispatch',case_id:input.requestId,exercise_notice:'This is an opt-in test exercise. Do not issue real evacuation or medical instructions.',evacuation_message:String(input.evacuationMessage||'').slice(0,1500)}}};
}
export async function initiateTestCall(input,{env=process.env,fetchImpl=fetch}={}){
 const payload=validateTestCall(input,env);
 const r=await fetchImpl('https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call',{method:'POST',headers:{'Content-Type':'application/json','xi-api-key':env.ELEVENLABS_API_KEY},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('Voice provider did not accept the test-call request.');const result=await r.json();if(!result.success)throw new Error('Voice provider returned an unsuccessful call request.');
 return {status:'provider_accepted',provider:'Photon SIP / ElevenLabs',conversationId:result.conversation_id??null,callId:result.sip_call_id??null,acknowledged:false,personSafe:null,message:'Provider accepted a test-call request. Connection and recipient acknowledgement are not established.'};
}
