import type { z } from 'zod';
import type { AiProvider } from '@bookleaf/contracts';
import { AiError } from '../../../common/errors';

export type LlmTask = 'triage' | 'draft';

export interface StructuredRequest<T> {
  task: LlmTask;
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  prompt: string;
  /** Model id; empty/undefined → provider default for the task. */
  model?: string;
  temperature?: number | null;
  maxOutputTokens: number;
}

export interface StructuredResult<T> {
  object: T;
  provider: AiProvider;
  model: string;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/**
 * Provider-independent contract used by every AI service. Ticket/strategy logic depends
 * only on this interface, so switching Anthropic ↔ OpenAI (or a test fake) requires no
 * change outside the provider module.
 *
 * Implementations must throw `AiError` (never provider-specific errors).
 */
export interface LlmClient {
  readonly provider: AiProvider | null;
  isConfigured(): boolean;
  defaultModel(task: LlmTask): string;
  /** When set, the client is cooling down after provider errors and fails fast. */
  circuitOpenUntil(): Date | null;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

/** Used when no API key is configured — every call fails fast with NOT_CONFIGURED. */
export class DisabledLlmClient implements LlmClient {
  readonly provider = null;

  constructor(private readonly models: { triage: string; draft: string }) {}

  isConfigured(): boolean {
    return false;
  }

  defaultModel(task: LlmTask): string {
    return this.models[task];
  }

  circuitOpenUntil(): Date | null {
    return null;
  }

  async generateStructured<T>(): Promise<StructuredResult<T>> {
    throw new AiError(
      'NOT_CONFIGURED',
      'AI is not configured on this server (no API key). Manual mode is active.',
    );
  }
}

/**
 * Minimal circuit breaker: after a rate-limit (or repeated provider failures) we stop
 * calling the provider for a cool-down period. Requests during the cool-down fail fast
 * (CIRCUIT_OPEN) and fall back to manual mode instead of piling up timeouts.
 */
export class CircuitBreaker {
  private openUntil = 0;
  private consecutiveFailures = 0;

  constructor(
    private readonly failureThreshold = 3,
    private readonly coolDownMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  assertClosed(): void {
    if (this.now() < this.openUntil) {
      throw new AiError(
        'CIRCUIT_OPEN',
        `AI temporarily paused after provider errors; retrying after ${new Date(this.openUntil).toISOString()}`,
      );
    }
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  recordFailure(error: AiError): void {
    if (error.kind === 'RATE_LIMITED') {
      this.openUntil = this.now() + (error.retryAfterMs ?? this.coolDownMs);
      return;
    }
    if (error.kind === 'PROVIDER_ERROR' || error.kind === 'TIMEOUT') {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.openUntil = this.now() + this.coolDownMs;
        this.consecutiveFailures = 0;
      }
    }
  }

  openUntilDate(): Date | null {
    return this.now() < this.openUntil ? new Date(this.openUntil) : null;
  }
}
