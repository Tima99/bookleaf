import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  RetryError,
  type LanguageModel,
} from 'ai';
import type { AiProvider } from '@bookleaf/contracts';
import { AiError } from '../../../common/errors';
import type { Logger } from '../../../common/logger';
import {
  CircuitBreaker,
  type LlmClient,
  type LlmTask,
  type StructuredRequest,
  type StructuredResult,
} from './llm-client';

export interface AiSdkClientOptions {
  provider: AiProvider;
  apiKey: string;
  models: { triage: string; draft: string };
  timeouts: { triage: number; draft: number };
  maxRetries: number;
  logger: Logger;
  breaker?: CircuitBreaker;
}

/**
 * Vercel AI SDK implementation of `LlmClient`.
 *
 * - Structured output via `generateText` + `Output.object(zodSchema)`; the Anthropic
 *   provider uses native `output_config.format` on current Claude models.
 * - Bounded retries (SDK handles 429/5xx with backoff) and a hard per-call timeout.
 * - All provider errors are normalised into `AiError` kinds the services understand.
 * - The API key is read from server env only; it never leaves this module.
 */
export class AiSdkLlmClient implements LlmClient {
  readonly provider: AiProvider;
  private readonly modelFactory: (modelId: string) => LanguageModel;
  private readonly breaker: CircuitBreaker;

  constructor(private readonly options: AiSdkClientOptions) {
    this.provider = options.provider;
    this.breaker = options.breaker ?? new CircuitBreaker();
    if (options.provider === 'anthropic') {
      const anthropic = createAnthropic({ apiKey: options.apiKey });
      this.modelFactory = (id) => anthropic(id);
    } else {
      const openai = createOpenAI({ apiKey: options.apiKey });
      this.modelFactory = (id) => openai(id);
    }
  }

  isConfigured(): boolean {
    return true;
  }

  defaultModel(task: LlmTask): string {
    return this.options.models[task];
  }

  circuitOpenUntil(): Date | null {
    return this.breaker.openUntilDate();
  }

  /**
   * A strategy may pin a model id. It's only honoured when the strategy targets the
   * configured provider — e.g. a Claude model id is never sent to OpenAI after switching
   * providers; the server default for the task is used instead.
   */
  private resolveModel(request: StructuredRequest<unknown>): string {
    const pinned = request.model?.trim();
    if (!pinned) return this.defaultModel(request.task);
    if (request.provider && request.provider !== this.provider) {
      this.options.logger.warn(
        { pinned, strategyProvider: request.provider, provider: this.provider },
        'Strategy model belongs to another provider — using the server default model',
      );
      return this.defaultModel(request.task);
    }
    return pinned;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.breaker.assertClosed();
    const modelId = this.resolveModel(request);
    const started = Date.now();

    try {
      const result = await generateText({
        model: this.modelFactory(modelId),
        instructions: request.system,
        prompt: request.prompt,
        output: Output.object({ schema: request.schema, name: request.schemaName }),
        maxOutputTokens: request.maxOutputTokens,
        // Providers drop sampling params for models that reject them (with a warning).
        ...(request.temperature !== null && request.temperature !== undefined
          ? { temperature: request.temperature }
          : {}),
        maxRetries: this.options.maxRetries,
        timeout: this.options.timeouts[request.task],
        // Each provider reads only its own key. Triage is a short classification → low
        // effort keeps it fast and cheap; drafting gets a bit more reasoning, still bounded.
        providerOptions: {
          openai: { reasoningEffort: request.task === 'triage' ? 'low' : 'medium' },
          anthropic: { effort: request.task === 'triage' ? 'low' : 'medium' },
        },
      });

      // Defence in depth: re-validate even though the SDK already parsed against the schema.
      const object = request.schema.parse(result.output);
      this.breaker.recordSuccess();
      return {
        object,
        provider: this.provider,
        model: modelId,
        latencyMs: Date.now() - started,
        usage: {
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
        },
      };
    } catch (err) {
      const aiError = normaliseError(err);
      this.breaker.recordFailure(aiError);
      this.options.logger.warn(
        { kind: aiError.kind, model: modelId, task: request.task, latencyMs: Date.now() - started },
        `AI call failed: ${aiError.message}`,
      );
      throw aiError;
    }
  }
}

function retryAfterMs(headers: Record<string, string> | undefined): number | undefined {
  const raw = headers?.['retry-after'];
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 5 * 60_000) : undefined;
}

/** Maps SDK/provider errors to stable failure kinds (never leaks provider internals). */
export function normaliseError(err: unknown): AiError {
  if (err instanceof AiError) return err;

  const root = RetryError.isInstance(err) ? err.lastError : err;

  if (APICallError.isInstance(root)) {
    if (root.statusCode === 429) {
      return new AiError(
        'RATE_LIMITED',
        'The AI provider is rate limiting requests',
        retryAfterMs(root.responseHeaders),
      );
    }
    if (root.statusCode === 401 || root.statusCode === 403) {
      return new AiError('NOT_CONFIGURED', 'The AI provider rejected the API key');
    }
    return new AiError('PROVIDER_ERROR', `AI provider error (HTTP ${root.statusCode ?? 'n/a'})`);
  }

  if (NoObjectGeneratedError.isInstance(root)) {
    return new AiError('INVALID_OUTPUT', 'The model did not return valid structured output');
  }

  if (root instanceof Error) {
    if (root.name === 'TimeoutError' || root.name === 'AbortError') {
      return new AiError('TIMEOUT', 'The AI provider did not respond in time');
    }
    if (root.name === 'ZodError' || root.name === 'TypeValidationError') {
      return new AiError('INVALID_OUTPUT', 'The model output failed validation');
    }
  }

  return new AiError('PROVIDER_ERROR', 'Unexpected AI provider failure');
}
