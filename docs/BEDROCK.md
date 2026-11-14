# AWS Bedrock setup

Headwater defaults to **Amazon Nova 2 Lite**, using the Bedrock Converse API through `@langchain/aws`. It supports client-side tool calling. The deterministic geospatial and routing functions calculate the numbers; the model investigates and explains the results.

## Configuration

1. In your AWS account, open Amazon Bedrock in **US East (N. Virginia), `us-east-1`**. Confirm access to Nova 2 Lite and permissions for its US cross-region inference profile.
2. Copy `.env.example` to `.env`. For a Bedrock API key, set `AWS_BEARER_TOKEN_BEDROCK` locally. Alternatively set `AWS_PROFILE` and authenticate through your existing AWS CLI/SSO setup. Standard AWS environment credentials and an explicitly enabled default credential chain are supported.
3. Keep `HEADWATER_PROVIDER=bedrock`, `AWS_REGION=us-east-1`, and `HEADWATER_MODEL=us.amazon.nova-2-lite-v1:0`.
4. Restart `npm run dev`. Open Investigation, ask for a 10 m versus 20 m comparison, and inspect actual tool executions and token usage. Successful configuration detection is not a verified invocation.

The `us.` inference ID routes within the supported US destinations. A bare `amazon.nova-2-lite-v1:0` is not an in-region substitute in every region. If your account requires a different supported geography/profile, change the model ID and region together according to the [model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html). The [LangChain adapter documentation](https://docs.langchain.com/oss/javascript/integrations/chat/bedrock_converse) describes authentication options.

No live Bedrock invocation has been made during implementation. No AWS infrastructure is provisioned by this repository.

## Cost controls

AWS quotes Nova 2 Lite at **$0.30 per million input tokens / $2.50 per million output tokens** in its [published example](https://aws.amazon.com/blogs/machine-learning/build-an-ai-powered-equipment-repair-assistant-using-amazon-bedrock-agentcore/). At those rates, **20,000 aggregate input tokens + 2,000 aggregate output tokens = $0.011**. This is an illustration, not a measured Headwater bill. Check your selected model/profile, geography and current [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) before treating those rates as your account's quote.

Implemented controls:

- Eight total model calls shared across the coordinator and specialists in one investigation.
- At most 1,200 output tokens per call; no automatic provider retries or model fallback.
- Extended reasoning is left at Nova's default **off**.
- One concurrent investigation; a 150-second server deadline.
- Bounded user input and a 120,000-character per-request context guard.
- Provider-reported token counts are recorded when returned; unavailable usage is identified.

The guard measures characters, not tokens. Tool definitions and provider overhead also consume input. The controls are not a hard dollar cap; use AWS account budgets/monitoring for account-wide spend. No vector database, AgentCore deployment or continuously running AWS service is needed for the local demo.

## Access errors

If the first request fails, verify the selected AWS region, key/profile session expiry, `bedrock:InvokeModel` permissions and permissions for the inference profile's destination models/regions. The public interface shows a generic provider error without echoing credentials; server logs only the error class. Never paste credentials into chat.
