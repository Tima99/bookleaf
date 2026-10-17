import type { AiProvider } from '@bookleaf/contracts';
import { AiError } from '../../src/common/errors';
import type {
  LlmClient,
  StructuredRequest,
  StructuredResult,
} from '../../src/modules/ai/providers/llm-client';
import type { DraftOutput, TriageOutput } from '../../src/modules/ai/schemas/output.schemas';

export type FakeMode = 'ok' | 'rate_limited' | 'timeout' | 'invalid' | 'not_configured';

/**
 * Deterministic stand-in for the LLM provider. Tests never call a real model.
 * Records every request so tests can assert on prompt composition and cost controls.
 */
export class FakeLlm implements LlmClient {
  readonly provider: AiProvider = 'anthropic';
  mode: FakeMode = 'ok';
  calls: Array<StructuredRequest<unknown>> = [];
  triage: TriageOutput = {
    category: 'ROYALTY_PAYMENTS',
    categoryConfidence: 0.92,
    priority: 'MEDIUM',
    rationale: 'The author reports not receiving royalty payments.',
    priorityRationale: 'Payment concern with a known resolution path.',
    escalate: false,
  };
  draft: DraftOutput = {
    reply:
      'Dear Asha,\n\nThank you for reaching out about your royalties. Royalties are calculated quarterly and paid within 45 days of the quarter ending.\n\nWarm regards,\nBookLeaf Author Support Team',
    verificationChecklist: ['Confirm bank details are linked'],
    suggestedStatus: 'IN_PROGRESS',
    escalationRecommended: false,
    knowledgeSectionsUsed: ['royalty-policy'],
  };

  isConfigured(): boolean {
    return this.mode !== 'not_configured';
  }

  defaultModel(task: 'triage' | 'draft'): string {
    return task === 'triage' ? 'fake-triage-model' : 'fake-draft-model';
  }

  circuitOpenUntil(): Date | null {
    return null;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(request as StructuredRequest<unknown>);
    switch (this.mode) {
      case 'not_configured':
        throw new AiError('NOT_CONFIGURED', 'not configured');
      case 'rate_limited':
        throw new AiError('RATE_LIMITED', 'rate limited');
      case 'timeout':
        throw new AiError('TIMEOUT', 'timeout');
      case 'invalid':
        throw new AiError('INVALID_OUTPUT', 'invalid output');
      default: {
        const raw = request.task === 'triage' ? this.triage : this.draft;
        return {
          object: request.schema.parse(raw),
          provider: 'anthropic',
          model: this.defaultModel(request.task),
          latencyMs: 12,
          usage: { inputTokens: 500, outputTokens: 120 },
        };
      }
    }
  }

  callsFor(task: 'triage' | 'draft') {
    return this.calls.filter((c) => c.task === task);
  }
}
