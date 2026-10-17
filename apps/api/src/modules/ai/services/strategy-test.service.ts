import type {
  PromptPreviewDto,
  StrategyTestResultDto,
  TestStrategyRequest,
} from '@bookleaf/contracts';
import { estimateTokens, toIsoDate } from '@bookleaf/utils';
import { AuthorModel, BookModel } from '../../../database/models';
import { selectKnowledgeSections } from '../../knowledge-base/retrieval';
import { buildTriagePrompt } from '../prompts/triage.prompt';
import type { ComposedPrompt } from '../prompts/types';
import type { LlmClient } from '../providers/llm-client';
import type { AiRunService } from './ai-run.service';
import { toPromptBook, type ResponseDraftService } from './response-draft.service';
import type { StrategyService } from './strategy.service';
import type { TriageService } from './triage.service';

/**
 * "Test strategy" console: compose the exact prompt a strategy version would send
 * (preview), optionally run it against a sample ticket, and show the structured output.
 * Nothing is written to tickets; runs are logged as STRATEGY_TEST for cost visibility.
 */
export class StrategyTestService {
  constructor(
    private readonly deps: {
      strategies: StrategyService;
      triage: TriageService;
      drafts: ResponseDraftService;
      runs: AiRunService;
      llm: LlmClient;
    },
  ) {}

  async test(strategyId: string, input: TestStrategyRequest): Promise<StrategyTestResultDto> {
    const strategy = await this.deps.strategies.resolveVersion(strategyId, input.version);
    const book = input.bookId ? await BookModel.findOne({ bookCode: input.bookId }).lean() : null;
    const author = book ? await AuthorModel.findById(book.author).lean() : null;

    const base = { strategyId, version: strategy.version };

    if (strategy.kind === 'RESPONSE') {
      const category = strategy.category ?? 'GENERAL_INQUIRY';
      const { prompt } = this.deps.drafts.assemble({
        strategy,
        category,
        subject: input.subject,
        description: input.description,
        ticket: null,
        author: author
          ? { name: author.name, joinedDate: toIsoDate(author.joinedDate), city: author.city }
          : { name: 'Sample Author', joinedDate: null, city: null },
        book: book ? toPromptBook(book) : null,
        accountRoyalty: book
          ? { totalPending: book.royaltyPending, totalPaid: book.royaltyPaid, bookCount: 1 }
          : null,
        history: [],
      });
      const preview = this.preview(prompt, category, input, strategy.config.knowledgeSections);
      if (input.dryRun)
        return {
          ...base,
          preview,
          output: null,
          model: null,
          latencyMs: null,
          usage: null,
          failure: null,
        };

      const result = await this.deps.drafts.callModel(prompt, strategy);
      await this.deps.runs.record({
        kind: 'STRATEGY_TEST',
        status: result.ok ? 'SUCCESS' : 'FAILED',
        strategies: [strategy],
        provider: this.deps.llm.provider,
        model: result.ok ? result.model : null,
        latencyMs: result.ok ? result.latencyMs : 0,
        inputTokens: result.ok ? result.usage.inputTokens : null,
        outputTokens: result.ok ? result.usage.outputTokens : null,
        failureKind: result.ok ? null : result.error.kind,
        failureMessage: result.ok ? null : result.error.message,
      });
      if (!result.ok) {
        return {
          ...base,
          preview,
          output: null,
          model: null,
          latencyMs: null,
          usage: null,
          failure: { kind: result.error.kind, message: result.error.message },
        };
      }
      return {
        ...base,
        preview,
        model: result.model,
        latencyMs: result.latencyMs,
        usage: result.usage,
        failure: null,
        output: {
          kind: 'DRAFT',
          draft: {
            body: result.output.reply,
            verificationChecklist: result.output.verificationChecklist,
            suggestedStatus: result.output.suggestedStatus,
            escalationRecommended: result.output.escalationRecommended,
            knowledgeSectionsUsed: result.output.knowledgeSectionsUsed,
          },
        },
      };
    }

    // CLASSIFICATION / PRIORITY: both feed the single triage call.
    const triageInput = {
      subject: input.subject,
      description: input.description,
      book: book ? { title: book.title, status: book.status } : null,
    };
    const override =
      strategy.kind === 'CLASSIFICATION' ? { classification: strategy } : { priority: strategy };

    if (input.dryRun) {
      const resolved = await this.deps.strategies.resolveTriageStrategies();
      const prompt = buildTriagePrompt({
        classification: override.classification ?? resolved.classification,
        priorities: resolved.priorities.map((p) =>
          override.priority && override.priority.category === p.category ? override.priority : p,
        ),
        ticket: triageInput,
        book: triageInput.book,
      });
      return {
        ...base,
        preview: this.preview(prompt, null, input, []),
        output: null,
        model: null,
        latencyMs: null,
        usage: null,
        failure: null,
      };
    }

    const outcome = await this.deps.triage.evaluate(triageInput, override);
    const preview = this.preview(outcome.prompt, null, input, []);
    if (outcome.ok || outcome.error.kind !== 'NOT_CONFIGURED') {
      await this.deps.runs.record({
        kind: 'STRATEGY_TEST',
        status: outcome.ok ? 'SUCCESS' : 'FAILED',
        strategies: [strategy],
        provider: this.deps.llm.provider,
        model: outcome.ok ? outcome.model : null,
        latencyMs: outcome.ok ? outcome.latencyMs : 0,
        inputTokens: outcome.ok ? outcome.usage.inputTokens : null,
        outputTokens: outcome.ok ? outcome.usage.outputTokens : null,
        failureKind: outcome.ok ? null : outcome.error.kind,
        failureMessage: outcome.ok ? null : outcome.error.message,
      });
    }
    if (!outcome.ok) {
      // Show what the rules-based fallback would have produced, plus why AI failed.
      return {
        ...base,
        preview,
        output: { kind: 'TRIAGE', triage: outcome.fallback },
        model: null,
        latencyMs: null,
        usage: null,
        failure: {
          kind: outcome.error.kind,
          message: `${outcome.error.message} — showing the rules-based fallback result.`,
        },
      };
    }
    return {
      ...base,
      preview,
      output: { kind: 'TRIAGE', triage: outcome.result },
      model: outcome.model,
      latencyMs: outcome.latencyMs,
      usage: outcome.usage,
      failure: null,
    };
  }

  private preview(
    prompt: ComposedPrompt,
    category: Parameters<typeof selectKnowledgeSections>[0]['category'] | null,
    input: TestStrategyRequest,
    pinned: Parameters<typeof selectKnowledgeSections>[0]['pinned'],
  ): PromptPreviewDto {
    const knowledge = category
      ? selectKnowledgeSections({
          category,
          text: `${input.subject} ${input.description}`,
          pinned,
        }).map((k) => k.id)
      : [];
    return {
      system: prompt.system,
      prompt: prompt.prompt,
      estimatedInputTokens: estimateTokens(prompt.system) + estimateTokens(prompt.prompt),
      knowledgeSections: knowledge,
    };
  }
}
