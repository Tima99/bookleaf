import { Types } from 'mongoose';
import {
  formatTicketReference,
  PRIORITY_RANK,
  type TicketCategory,
  type TicketPriority,
  type TriageResultDto,
} from '@bookleaf/contracts';
import { AiError } from '../../../common/errors';
import type { Logger } from '../../../common/logger';
import {
  BookModel,
  TicketModel,
  type TicketDoc,
  type TriageSubdoc,
} from '../../../database/models';
import type { TicketEventBus } from '../../../events/event-bus';
import { buildTriagePrompt } from '../prompts/triage.prompt';
import type { ComposedPrompt, ResolvedStrategy } from '../prompts/types';
import type { LlmClient } from '../providers/llm-client';
import { classifyByKeywords } from '../rules/keyword-classifier';
import {
  CATEGORY_BASELINE_PRIORITY,
  evaluateFloorRules,
  maxPriority,
} from '../rules/priority-rules';
import { TriageOutputSchema } from '../schemas/output.schemas';
import { toStrategyRefs, type AiRunService } from './ai-run.service';
import type { StrategyService } from './strategy.service';

export interface TriageInput {
  subject: string;
  description: string;
  book: { title: string; status: string } | null;
}

export type TriageOutcome =
  | {
      ok: true;
      result: TriageResultDto;
      model: string;
      prompt: ComposedPrompt;
      latencyMs: number;
      usage: { inputTokens: number | null; outputTokens: number | null };
      strategies: ResolvedStrategy[];
    }
  | {
      ok: false;
      error: AiError;
      fallback: TriageResultDto;
      prompt: ComposedPrompt;
      strategies: ResolvedStrategy[];
    };

/**
 * Classification + priority scoring.
 *
 * 1. One structured model call returns category, confidence, priority and rationales.
 * 2. Deterministic floor rules (from the active strategies) can raise — never lower —
 *    the model's priority, encoding hard policy such as "ISBN errors are HIGH".
 * 3. If the model is unavailable or returns invalid output, the keyword classifier and
 *    the same floor rules produce a clearly-labelled RULES result. Ticket creation never
 *    waits for, or fails because of, this service.
 */
export class TriageService {
  constructor(
    private readonly deps: {
      llm: LlmClient;
      strategies: StrategyService;
      runs: AiRunService;
      events: TicketEventBus;
      logger: Logger;
    },
  ) {}

  /** Pure-ish evaluation used by both ticket triage and the strategy test console. */
  async evaluate(
    input: TriageInput,
    override?: { classification?: ResolvedStrategy; priority?: ResolvedStrategy },
  ): Promise<TriageOutcome> {
    const resolved = await this.deps.strategies.resolveTriageStrategies();
    const classification = override?.classification ?? resolved.classification;
    const priorities = resolved.priorities.map((p) =>
      override?.priority && override.priority.category === p.category ? override.priority : p,
    );
    const strategies = [classification, ...priorities];
    const prompt = buildTriagePrompt({
      classification,
      priorities,
      ticket: input,
      book: input.book,
    });

    const applyRules = (category: TicketCategory, modelPriority: TicketPriority | null) => {
      const categoryRules =
        priorities.find((p) => p.category === category)?.config.floorRules ?? [];
      const floor = evaluateFloorRules(
        [...classification.config.floorRules, ...categoryRules],
        input.subject,
        input.description,
      );
      const base = modelPriority ?? CATEGORY_BASELINE_PRIORITY[category];
      return {
        priority: floor.floor ? maxPriority(base, floor.floor) : base,
        applied: floor.applied,
      };
    };

    try {
      const response = await this.deps.llm.generateStructured({
        task: 'triage',
        schema: TriageOutputSchema,
        schemaName: 'ticket_triage',
        system: prompt.system,
        prompt: prompt.prompt,
        model: classification.config.model,
        temperature: classification.config.temperature,
        maxOutputTokens: classification.config.maxOutputTokens,
      });
      const out = response.object;
      const rules = applyRules(out.category, out.priority);
      const raised = rules.priority !== out.priority;
      return {
        ok: true,
        model: response.model,
        prompt,
        latencyMs: response.latencyMs,
        usage: response.usage,
        strategies,
        result: {
          category: out.category,
          categoryConfidence: Number(out.categoryConfidence.toFixed(2)),
          priority: rules.priority,
          rationale: out.rationale,
          priorityRationale: raised
            ? `${out.priorityRationale} (Raised from ${out.priority} by policy rule.)`
            : out.priorityRationale,
          escalate: out.escalate || rules.priority === 'CRITICAL',
          rulesApplied: rules.applied,
        },
      };
    } catch (err) {
      const error =
        err instanceof AiError ? err : new AiError('PROVIDER_ERROR', 'Unexpected triage failure');
      const keyword = classifyByKeywords(input.subject, input.description);
      const rules = applyRules(keyword.category, null);
      return {
        ok: false,
        error,
        prompt,
        strategies,
        fallback: {
          category: keyword.category,
          categoryConfidence: keyword.confidence,
          priority: rules.priority,
          rationale: keyword.matched.length
            ? `Keyword rules matched: ${keyword.matched.slice(0, 6).join(', ')}.`
            : 'No strong keyword signal; defaulted to General Inquiry.',
          priorityRationale: rules.applied.length
            ? `Policy rules: ${rules.applied.join('; ')}`
            : `Category baseline priority (${CATEGORY_BASELINE_PRIORITY[keyword.category]}).`,
          escalate: rules.priority === 'CRITICAL' || rules.priority === 'HIGH',
          rulesApplied: rules.applied,
        },
      };
    }
  }

  /**
   * Triage a persisted ticket and store the result. Admin overrides are respected with
   * conditional updates (`categorySource != ADMIN`), so a concurrent override always wins.
   */
  async triageTicket(ticketId: string): Promise<void> {
    const ticket = await TicketModel.findById(ticketId).lean();
    if (!ticket) return;
    const book = ticket.book
      ? await BookModel.findById(ticket.book).select('title status').lean()
      : null;

    const outcome = await this.evaluate({
      subject: ticket.subject,
      description: ticket.description,
      book: book ? { title: book.title, status: book.status } : null,
    });

    const result = outcome.ok ? outcome.result : outcome.fallback;
    const triage: TriageSubdoc = {
      status: outcome.ok
        ? 'COMPLETED'
        : outcome.error.kind === 'NOT_CONFIGURED'
          ? 'SKIPPED'
          : 'FAILED',
      source: outcome.ok ? 'AI' : 'RULES',
      category: result.category,
      categoryConfidence: result.categoryConfidence,
      priority: result.priority,
      rationale: result.rationale,
      priorityRationale: result.priorityRationale,
      escalate: result.escalate,
      rulesApplied: result.rulesApplied,
      model: outcome.ok ? outcome.model : null,
      strategyVersions: toStrategyRefs(
        outcome.strategies.filter(
          (s) => s.kind === 'CLASSIFICATION' || s.category === result.category,
        ),
      ),
      failureKind: outcome.ok ? null : outcome.error.kind,
      failureMessage: outcome.ok ? null : outcome.error.message,
      attempts: (ticket.triage?.attempts ?? 0) + 1,
      completedAt: new Date(),
    };

    await this.persist(ticket, triage);

    // Only real model calls are logged as runs (NOT_CONFIGURED makes no call).
    if (outcome.ok || outcome.error.kind !== 'NOT_CONFIGURED') {
      await this.deps.runs.record({
        kind: 'TRIAGE',
        status: outcome.ok ? 'SUCCESS' : 'FAILED',
        ticket: { id: ticket._id, ticketNumber: ticket.ticketNumber },
        strategies: outcome.strategies.filter(
          (s) => s.kind === 'CLASSIFICATION' || s.category === result.category,
        ),
        provider: this.deps.llm.provider,
        model: outcome.ok ? outcome.model : null,
        latencyMs: outcome.ok ? outcome.latencyMs : 0,
        inputTokens: outcome.ok ? outcome.usage.inputTokens : null,
        outputTokens: outcome.ok ? outcome.usage.outputTokens : null,
        failureKind: outcome.ok ? null : outcome.error.kind,
        failureMessage: outcome.ok ? null : outcome.error.message,
      });
    }

    this.deps.events.publish({
      type: 'ticket.triaged',
      ticketId: ticket._id.toString(),
      reference: formatTicketReference(ticket.ticketNumber),
      authorId: ticket.author.toString(),
      at: new Date().toISOString(),
    });
  }

  private async persist(ticket: TicketDoc, triage: TriageSubdoc): Promise<void> {
    const id = new Types.ObjectId(ticket._id);
    const source = triage.source === 'AI' ? 'AI' : 'RULES';
    await TicketModel.updateOne({ _id: id }, { $set: { triage } });
    if (triage.category) {
      await TicketModel.updateOne(
        { _id: id, categorySource: { $ne: 'ADMIN' } },
        { $set: { category: triage.category, categorySource: source } },
      );
    }
    if (triage.priority) {
      await TicketModel.updateOne(
        { _id: id, prioritySource: { $ne: 'ADMIN' } },
        {
          $set: {
            priority: triage.priority,
            priorityRank: PRIORITY_RANK[triage.priority],
            prioritySource: source,
          },
        },
      );
    }
  }
}
