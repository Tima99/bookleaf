import { Types } from 'mongoose';
import {
  formatTicketReference,
  type AiFailureKind,
  type AiProvider,
  type AiRunDto,
  type AiRunKind,
  type PaginationMeta,
} from '@bookleaf/contracts';
import { buildMeta } from '../../../common/http';
import type { Logger } from '../../../common/logger';
import { AiRunModel, type StrategyRef } from '../../../database/models';
import type { ResolvedStrategy } from '../prompts/types';

export interface RecordRunInput {
  kind: AiRunKind;
  status: 'SUCCESS' | 'FAILED';
  ticket?: { id: Types.ObjectId | string; ticketNumber: number } | null;
  strategies: ResolvedStrategy[];
  provider: AiProvider | null;
  model: string | null;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  failureKind?: AiFailureKind | null;
  failureMessage?: string | null;
}

export function toStrategyRefs(strategies: ResolvedStrategy[]): StrategyRef[] {
  return strategies.map((s) => ({
    strategy: s.strategyId ? new Types.ObjectId(s.strategyId) : null,
    name: s.name,
    version: s.version,
  }));
}

/** Usage/latency/failure log for every AI call — the basis for cost monitoring. */
export class AiRunService {
  constructor(private readonly logger: Logger) {}

  async record(input: RecordRunInput): Promise<void> {
    try {
      await AiRunModel.create({
        kind: input.kind,
        status: input.status,
        ticket: input.ticket ? new Types.ObjectId(input.ticket.id.toString()) : null,
        ticketNumber: input.ticket?.ticketNumber ?? null,
        strategies: toStrategyRefs(input.strategies),
        provider: input.provider,
        model: input.model,
        latencyMs: Math.round(input.latencyMs),
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        failureKind: input.failureKind ?? null,
        failureMessage: input.failureMessage?.slice(0, 500) ?? null,
      });
    } catch (err) {
      this.logger.error({ err }, 'Failed to record AI run');
    }
  }

  async list(query: {
    page: number;
    pageSize: number;
    strategyId?: string;
    status?: 'SUCCESS' | 'FAILED';
  }): Promise<{ items: AiRunDto[]; meta: PaginationMeta }> {
    const filter: Record<string, unknown> = {};
    if (query.strategyId) filter['strategies.strategy'] = new Types.ObjectId(query.strategyId);
    if (query.status) filter.status = query.status;
    const [rows, total] = await Promise.all([
      AiRunModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      AiRunModel.countDocuments(filter),
    ]);
    return {
      items: rows.map((r) => ({
        id: r._id.toString(),
        kind: r.kind,
        status: r.status,
        ticket:
          r.ticket && r.ticketNumber !== null
            ? { id: r.ticket.toString(), reference: formatTicketReference(r.ticketNumber) }
            : null,
        strategies: r.strategies.map((s) => ({
          strategyId: s.strategy?.toString() ?? '',
          name: s.name,
          version: s.version,
        })),
        provider: r.provider,
        model: r.model,
        latencyMs: r.latencyMs,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        failureKind: r.failureKind,
        failureMessage: r.failureMessage,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: buildMeta(query.page, query.pageSize, total),
    };
  }

  async last24h(): Promise<{
    runs: number;
    failures: number;
    inputTokens: number;
    outputTokens: number;
  }> {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [row] = await AiRunModel.aggregate<{
      runs: number;
      failures: number;
      inputTokens: number;
      outputTokens: number;
    }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          runs: { $sum: 1 },
          failures: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
          inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
          outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
        },
      },
    ]);
    return row ?? { runs: 0, failures: 0, inputTokens: 0, outputTokens: 0 };
  }
}
