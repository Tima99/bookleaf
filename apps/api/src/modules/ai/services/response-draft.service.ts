import { randomUUID } from 'node:crypto';
import { type Types } from 'mongoose';
import {
  formatTicketReference,
  type AiDraftDto,
  type DraftResultDto,
  type TicketCategory,
} from '@bookleaf/contracts';
import { toIsoDate } from '@bookleaf/utils';
import { AiError, NotFoundError } from '../../../common/errors';
import type { Logger } from '../../../common/logger';
import {
  AuthorModel,
  BookModel,
  TicketMessageModel,
  TicketModel,
  type BookDoc,
  type DraftSubdoc,
  type TicketDoc,
} from '../../../database/models';
import { examplesFor } from '../../knowledge-base/examples';
import { selectKnowledgeSections } from '../../knowledge-base/retrieval';
import { buildDraftPrompt, type DraftPromptInput } from '../prompts/draft.prompt';
import type { ComposedPrompt, PromptBook, ResolvedStrategy } from '../prompts/types';
import type { LlmClient } from '../providers/llm-client';
import { DraftOutputSchema, type DraftOutput } from '../schemas/output.schemas';
import { toStrategyRefs, type AiRunService } from './ai-run.service';
import { buildTemplateDraft } from './fallback-templates';
import type { StrategyService } from './strategy.service';

export function toPromptBook(book: BookDoc): PromptBook {
  return {
    bookCode: book.bookCode,
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    status: book.status,
    stage: book.stage,
    productionStage: book.productionStage,
    publicationDate: toIsoDate(book.publicationDate),
    mrp: book.mrp,
    authorRoyaltyPerCopy: book.authorRoyaltyPerCopy,
    totalCopiesSold: book.totalCopiesSold,
    totalRoyaltyEarned: book.totalRoyaltyEarned,
    royaltyPaid: book.royaltyPaid,
    royaltyPending: book.royaltyPending,
    lastRoyaltyPayoutDate: toIsoDate(book.lastRoyaltyPayoutDate),
    printPartner: book.printPartner,
    availableOn: book.availableOn ?? [],
  };
}

export function toDraftDto(draft: DraftSubdoc, currentPublicCount: number): AiDraftDto {
  return {
    id: draft.draftId,
    body: draft.body,
    source: draft.source,
    model: draft.model,
    strategy: draft.strategy
      ? {
          id: draft.strategy.strategy?.toString() ?? '',
          name: draft.strategy.name,
          version: draft.strategy.version,
        }
      : null,
    knowledgeSectionsUsed: draft.knowledgeSectionsUsed,
    verificationChecklist: draft.verificationChecklist,
    suggestedStatus: draft.suggestedStatus,
    escalationRecommended: draft.escalationRecommended,
    generatedAt: draft.generatedAt.toISOString(),
    stale: draft.basedOnPublicMessageCount !== currentPublicCount,
    usage:
      draft.source === 'AI'
        ? { inputTokens: draft.inputTokens, outputTokens: draft.outputTokens }
        : null,
  };
}

export interface DraftContextInput {
  subject: string;
  description: string;
  category: TicketCategory | null;
  ticket?: TicketDoc;
  authorId: Types.ObjectId;
  bookId: Types.ObjectId | null;
}

/**
 * AI-drafted replies.
 *
 * Cost controls: drafts are cached on the ticket and reused until a new public message
 * arrives (or the admin explicitly regenerates); concurrent requests for the same ticket
 * share one in-flight call; only the 1–3 relevant KB sections, one calibration example
 * and a bounded slice of history are sent.
 */
export class ResponseDraftService {
  private readonly inFlight = new Map<string, Promise<DraftResultDto>>();

  constructor(
    private readonly deps: {
      llm: LlmClient;
      strategies: StrategyService;
      runs: AiRunService;
      logger: Logger;
      now?: () => Date;
    },
  ) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async getOrGenerate(ticketId: string, options: { force: boolean }): Promise<DraftResultDto> {
    const existing = this.inFlight.get(ticketId);
    if (existing) return existing;
    const promise = this.generateForTicket(ticketId, options).finally(() =>
      this.inFlight.delete(ticketId),
    );
    this.inFlight.set(ticketId, promise);
    return promise;
  }

  private async generateForTicket(
    ticketId: string,
    options: { force: boolean },
  ): Promise<DraftResultDto> {
    const ticket = await TicketModel.findById(ticketId).lean();
    if (!ticket) throw new NotFoundError('Ticket');

    // Reuse a fresh draft instead of paying for a new call (tab switches, re-opens…).
    const fresh =
      ticket.draft && ticket.draft.basedOnPublicMessageCount === ticket.publicMessageCount;
    if (!options.force && ticket.draft && fresh) {
      if (ticket.draft.source === 'AI') {
        return {
          draft: toDraftDto(ticket.draft, ticket.publicMessageCount),
          failure: null,
          fromCache: true,
        };
      }
      if (!this.deps.llm.isConfigured()) {
        return {
          draft: toDraftDto(ticket.draft, ticket.publicMessageCount),
          failure: {
            kind: 'NOT_CONFIGURED',
            message: 'AI drafting is not configured; showing a policy template.',
          },
          fromCache: true,
        };
      }
    }

    const { prompt, strategy, input } = await this.composeForTicket(ticket);
    const generation = await this.callModel(prompt, strategy);

    if (!generation.ok) {
      if (generation.error.kind !== 'NOT_CONFIGURED') {
        await this.deps.runs.record({
          kind: 'DRAFT',
          status: 'FAILED',
          ticket: { id: ticket._id, ticketNumber: ticket.ticketNumber },
          strategies: [strategy],
          provider: this.deps.llm.provider,
          model: null,
          latencyMs: 0,
          failureKind: generation.error.kind,
          failureMessage: generation.error.message,
        });
      }
      // Degrade to a policy template so the admin can still reply quickly.
      const template = buildTemplateDraft({
        category: ticket.category,
        authorName: input.author.name,
        book: input.book,
      });
      const draft: DraftSubdoc = {
        draftId: randomUUID(),
        body: template.body,
        source: 'TEMPLATE',
        model: null,
        strategy: null,
        knowledgeSectionsUsed: template.knowledgeSectionsUsed,
        verificationChecklist: template.verificationChecklist,
        suggestedStatus: 'IN_PROGRESS',
        escalationRecommended: false,
        basedOnPublicMessageCount: ticket.publicMessageCount,
        inputTokens: null,
        outputTokens: null,
        generatedAt: this.now(),
      };
      await TicketModel.updateOne({ _id: ticket._id }, { $set: { draft } });
      return {
        draft: toDraftDto(draft, ticket.publicMessageCount),
        failure: { kind: generation.error.kind, message: generation.error.message },
        fromCache: false,
      };
    }

    const out = generation.output;
    const draft: DraftSubdoc = {
      draftId: randomUUID(),
      body: out.reply.trim(),
      source: 'AI',
      model: generation.model,
      strategy: toStrategyRefs([strategy])[0] ?? null,
      knowledgeSectionsUsed: out.knowledgeSectionsUsed,
      verificationChecklist: out.verificationChecklist,
      suggestedStatus: out.suggestedStatus,
      escalationRecommended: out.escalationRecommended,
      basedOnPublicMessageCount: ticket.publicMessageCount,
      inputTokens: generation.usage.inputTokens,
      outputTokens: generation.usage.outputTokens,
      generatedAt: this.now(),
    };
    await TicketModel.updateOne({ _id: ticket._id }, { $set: { draft } });
    await this.deps.runs.record({
      kind: 'DRAFT',
      status: 'SUCCESS',
      ticket: { id: ticket._id, ticketNumber: ticket.ticketNumber },
      strategies: [strategy],
      provider: this.deps.llm.provider,
      model: generation.model,
      latencyMs: generation.latencyMs,
      inputTokens: generation.usage.inputTokens,
      outputTokens: generation.usage.outputTokens,
    });
    return { draft: toDraftDto(draft, ticket.publicMessageCount), failure: null, fromCache: false };
  }

  async composeForTicket(ticket: TicketDoc, strategyOverride?: ResolvedStrategy) {
    return this.compose(
      {
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        ticket,
        authorId: ticket.author,
        bookId: ticket.book,
      },
      strategyOverride,
    );
  }

  /** Builds the full drafting context and prompt (also used for previews and tests). */
  async compose(
    ctx: DraftContextInput,
    strategyOverride?: ResolvedStrategy,
  ): Promise<{ prompt: ComposedPrompt; strategy: ResolvedStrategy; input: DraftPromptInput }> {
    const category: TicketCategory =
      ctx.category ?? strategyOverride?.category ?? 'GENERAL_INQUIRY';
    const strategy =
      strategyOverride ?? (await this.deps.strategies.resolveActive('RESPONSE', category));

    const [author, book, authorBooks, history] = await Promise.all([
      AuthorModel.findById(ctx.authorId).lean(),
      ctx.bookId ? BookModel.findById(ctx.bookId).lean() : Promise.resolve(null),
      category === 'ROYALTY_PAYMENTS'
        ? BookModel.find({ author: ctx.authorId }).select('royaltyPending royaltyPaid').lean()
        : Promise.resolve([]),
      ctx.ticket && strategy.config.maxHistoryMessages > 0
        ? TicketMessageModel.find({ ticket: ctx.ticket._id })
            .sort({ createdAt: -1 })
            .limit(strategy.config.maxHistoryMessages)
            .lean()
        : Promise.resolve([]),
    ]);
    if (!author) throw new NotFoundError('Author');

    return this.assemble({
      strategy,
      category,
      subject: ctx.subject,
      description: ctx.description,
      ticket: ctx.ticket ?? null,
      author: { name: author.name, joinedDate: toIsoDate(author.joinedDate), city: author.city },
      book: book ? toPromptBook(book) : null,
      accountRoyalty:
        authorBooks.length > 0
          ? {
              totalPending: authorBooks.reduce((s, b) => s + b.royaltyPending, 0),
              totalPaid: authorBooks.reduce((s, b) => s + b.royaltyPaid, 0),
              bookCount: authorBooks.length,
            }
          : null,
      history: history.reverse().map((m) => ({
        senderType: m.senderType,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  }

  /** Pure assembly from already-loaded parts (shared with the strategy test console). */
  assemble(parts: {
    strategy: ResolvedStrategy;
    category: TicketCategory;
    subject: string;
    description: string;
    ticket: TicketDoc | null;
    author: DraftPromptInput['author'];
    book: PromptBook | null;
    accountRoyalty: DraftPromptInput['accountRoyalty'];
    history: DraftPromptInput['history'];
  }): { prompt: ComposedPrompt; strategy: ResolvedStrategy; input: DraftPromptInput } {
    const { strategy, category, ticket } = parts;
    const text = `${parts.subject} ${parts.description}`;
    const input: DraftPromptInput = {
      strategy,
      ticket: {
        reference: ticket ? formatTicketReference(ticket.ticketNumber) : 'TEST',
        subject: parts.subject,
        description: parts.description,
        category,
        priority: ticket?.priority ?? null,
        status: ticket?.status ?? 'OPEN',
        createdAt: (ticket?.createdAt ?? this.now()).toISOString(),
      },
      author: parts.author,
      book: parts.book,
      accountRoyalty: parts.accountRoyalty,
      knowledge: selectKnowledgeSections({
        category,
        text,
        pinned: strategy.config.knowledgeSections,
      }),
      examples: examplesFor(category, 1, text),
      history: parts.history,
      now: this.now(),
    };
    return { prompt: buildDraftPrompt(input), strategy, input };
  }

  async callModel(
    prompt: ComposedPrompt,
    strategy: ResolvedStrategy,
  ): Promise<
    | {
        ok: true;
        output: DraftOutput;
        model: string;
        latencyMs: number;
        usage: { inputTokens: number | null; outputTokens: number | null };
      }
    | { ok: false; error: AiError }
  > {
    try {
      const response = await this.deps.llm.generateStructured({
        task: 'draft',
        schema: DraftOutputSchema,
        schemaName: 'support_reply_draft',
        system: prompt.system,
        prompt: prompt.prompt,
        model: strategy.config.model,
        temperature: strategy.config.temperature,
        maxOutputTokens: strategy.config.maxOutputTokens,
      });
      return {
        ok: true,
        output: response.object,
        model: response.model,
        latencyMs: response.latencyMs,
        usage: response.usage,
      };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof AiError
            ? err
            : new AiError('PROVIDER_ERROR', 'Unexpected drafting failure'),
      };
    }
  }
}
