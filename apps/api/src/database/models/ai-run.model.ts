import { Schema, model, type Types } from 'mongoose';
import {
  AI_FAILURE_KINDS,
  AI_PROVIDERS,
  AI_RUN_KINDS,
  type AiFailureKind,
  type AiProvider,
  type AiRunKind,
} from '@bookleaf/contracts';
import type { StrategyRef } from './ticket.model';

/**
 * One row per model call (success or failure): latency, token usage, strategy version
 * and failure kind. Powers cost visibility and the "execution metadata" view.
 * Prompts and outputs are NOT stored here (they contain author data).
 */
export interface AiRunDoc {
  _id: Types.ObjectId;
  kind: AiRunKind;
  status: 'SUCCESS' | 'FAILED';
  ticket: Types.ObjectId | null;
  ticketNumber: number | null;
  strategies: StrategyRef[];
  provider: AiProvider | null;
  model: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  failureKind: AiFailureKind | null;
  failureMessage: string | null;
  createdAt: Date;
}

const aiRunSchema = new Schema<AiRunDoc>(
  {
    kind: { type: String, enum: AI_RUN_KINDS, required: true },
    status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true },
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', default: null },
    ticketNumber: { type: Number, default: null },
    strategies: {
      type: [
        new Schema(
          {
            strategy: { type: Schema.Types.ObjectId, ref: 'AiStrategy', default: null },
            name: String,
            version: Number,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    provider: { type: String, enum: [...AI_PROVIDERS, null], default: null },
    model: { type: String, default: null },
    latencyMs: { type: Number, required: true },
    inputTokens: { type: Number, default: null },
    outputTokens: { type: Number, default: null },
    failureKind: { type: String, enum: [...AI_FAILURE_KINDS, null], default: null },
    failureMessage: { type: String, default: null, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Recent runs + 24h usage aggregation; also expires rows after 90 days (TTL).
aiRunSchema.index({ createdAt: -1 }, { expireAfterSeconds: 90 * 24 * 3600 });
// Per-strategy execution history and stats.
aiRunSchema.index({ 'strategies.strategy': 1, createdAt: -1 });

export const AiRunModel = model<AiRunDoc>('AiRun', aiRunSchema);
