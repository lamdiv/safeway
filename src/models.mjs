import {ChatBedrockConverse} from '@langchain/aws';
import {ChatOpenAI} from '@langchain/openai';

export const MODEL_LIMITS=Object.freeze({maxCalls:8,maxOutputTokens:1200,maxRequestCharacters:120000});
// Configuration presence is not a successful authentication/model-access check.
export function modelConfiguration(env=process.env){
 const provider=(env.HEADWATER_PROVIDER||'bedrock').toLowerCase();
 if(!['bedrock','openai'].includes(provider))throw new Error('HEADWATER_PROVIDER must be bedrock or openai.');
 const bedrock=provider==='bedrock';
 const configured=bedrock?Boolean(env.AWS_BEARER_TOKEN_BEDROCK||env.AWS_PROFILE||(env.AWS_ACCESS_KEY_ID&&env.AWS_SECRET_ACCESS_KEY)||(env.BEDROCK_AWS_ACCESS_KEY_ID&&env.BEDROCK_AWS_SECRET_ACCESS_KEY)||env.HEADWATER_AWS_ENABLED==='true'):Boolean(env.OPENAI_API_KEY);
 return {provider,providerLabel:bedrock?'AWS Bedrock':'OpenAI',model:env.HEADWATER_MODEL||(bedrock?'us.amazon.nova-2-lite-v1:0':'gpt-5.4'),region:bedrock?(env.AWS_REGION||env.BEDROCK_AWS_REGION||env.AWS_DEFAULT_REGION||'us-east-1'):null,configured,accessVerified:false,limits:MODEL_LIMITS};
}
export function createChatModel({env=process.env,provider,model,apiKey}={}){
 const effective={...env,...(provider?{HEADWATER_PROVIDER:provider}:{}),...(model?{HEADWATER_MODEL:model}:{}),...(apiKey?{OPENAI_API_KEY:apiKey}:{})};
 const config=modelConfiguration(effective);
 if(!config.configured)throw new Error(config.provider==='bedrock'?'AWS Bedrock is not configured. Set AWS_BEARER_TOKEN_BEDROCK, AWS_PROFILE, or HEADWATER_AWS_ENABLED=true for the AWS default credential chain.':'OPENAI_API_KEY is not configured on the server.');
 if(config.provider==='openai')return new ChatOpenAI({model:config.model,apiKey:effective.OPENAI_API_KEY,useResponsesApi:true,maxRetries:0,timeout:90000,maxTokens:MODEL_LIMITS.maxOutputTokens});
 const credentials=effective.AWS_ACCESS_KEY_ID&&effective.AWS_SECRET_ACCESS_KEY?{accessKeyId:effective.AWS_ACCESS_KEY_ID,secretAccessKey:effective.AWS_SECRET_ACCESS_KEY,...(effective.AWS_SESSION_TOKEN?{sessionToken:effective.AWS_SESSION_TOKEN}:{})}:undefined;
 return new ChatBedrockConverse({model:config.model,region:config.region,maxTokens:MODEL_LIMITS.maxOutputTokens,maxRetries:0,clientOptions:{maxAttempts:1},...(effective.AWS_BEARER_TOKEN_BEDROCK?{bedrockBearerToken:effective.AWS_BEARER_TOKEN_BEDROCK}:{}),...(effective.AWS_PROFILE?{profile:effective.AWS_PROFILE}:{}),...(credentials?{credentials}:{}),...(effective.BEDROCK_AWS_ACCESS_KEY_ID?{bedrockApiKey:effective.BEDROCK_AWS_ACCESS_KEY_ID,bedrockApiSecret:effective.BEDROCK_AWS_SECRET_ACCESS_KEY,bedrockApiSessionToken:effective.BEDROCK_AWS_SESSION_TOKEN}:{})});
}
