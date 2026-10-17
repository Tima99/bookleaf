import type { AppConfig } from '../../../config/env';
import type { Logger } from '../../../common/logger';
import { AiSdkLlmClient } from './ai-sdk-client';
import { DisabledLlmClient, type LlmClient } from './llm-client';

/** Builds the configured LLM client, or a disabled one (manual mode) when no key is set. */
export function createLlmClient(config: AppConfig, logger: Logger): LlmClient {
  const models = { triage: config.ai.triageModel, draft: config.ai.draftModel };
  if (!config.ai.provider || !config.ai.apiKey) {
    logger.warn(
      'AI provider not configured — running in manual mode (rules-based triage, template replies)',
    );
    return new DisabledLlmClient(models);
  }
  logger.info({ provider: config.ai.provider, models }, 'AI provider configured');
  return new AiSdkLlmClient({
    provider: config.ai.provider,
    apiKey: config.ai.apiKey,
    models,
    timeouts: { triage: config.ai.triageTimeoutMs, draft: config.ai.draftTimeoutMs },
    maxRetries: config.ai.maxRetries,
    logger,
  });
}

export * from './llm-client';
