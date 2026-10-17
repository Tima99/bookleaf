import { Schema, model, type Types } from 'mongoose';
import {
  AI_STRATEGY_KINDS,
  TICKET_CATEGORIES,
  type AiStrategyConfig,
  type AiStrategyKind,
  type TicketCategory,
} from '@bookleaf/contracts';

/**
 * A configurable AI strategy (classification, priority scoring or response drafting).
 * The strategy row holds identity + which version is active; the prompt configuration
 * itself lives in immutable `AiStrategyVersion` documents.
 *
 * Invariant: at most one *enabled* strategy per (kind, category) — enforced by a
 * partial unique index — so "which strategy applies to this ticket?" is unambiguous.
 */
export interface AiStrategyDoc {
  _id: Types.ObjectId;
  key: string;
  name: string;
  kind: AiStrategyKind;
  category: TicketCategory | null;
  purpose: string;
  enabled: boolean;
  isDefault: boolean;
  activeVersion: number;
  latestVersion: number;
  updatedBy: Types.ObjectId | null;
  updatedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const aiStrategySchema = new Schema<AiStrategyDoc>(
  {
    key: { type: String, required: true, trim: true, maxlength: 100 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: AI_STRATEGY_KINDS, required: true },
    category: { type: String, enum: [...TICKET_CATEGORIES, null], default: null },
    purpose: { type: String, default: '', maxlength: 300 },
    enabled: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    activeVersion: { type: Number, required: true, min: 1 },
    latestVersion: { type: Number, required: true, min: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: null },
  },
  { timestamps: true },
);

aiStrategySchema.index({ key: 1 }, { unique: true });
// Active-strategy lookup + "one enabled strategy per scope" invariant.
aiStrategySchema.index(
  { kind: 1, category: 1 },
  { unique: true, partialFilterExpression: { enabled: true }, name: 'one_enabled_per_scope' },
);
// Strategy list grouped by kind/category.
aiStrategySchema.index({ kind: 1, category: 1, name: 1 });

export const AiStrategyModel = model<AiStrategyDoc>('AiStrategy', aiStrategySchema);

export interface AiStrategyVersionDoc {
  _id: Types.ObjectId;
  strategy: Types.ObjectId;
  version: number;
  config: AiStrategyConfig;
  changeNote: string;
  createdBy: Types.ObjectId | null;
  createdByName: string | null;
  createdAt: Date;
}

const aiStrategyVersionSchema = new Schema<AiStrategyVersionDoc>(
  {
    strategy: { type: Schema.Types.ObjectId, ref: 'AiStrategy', required: true },
    version: { type: Number, required: true, min: 1 },
    // Validated with the shared Zod schema before every write.
    config: { type: Schema.Types.Mixed, required: true },
    changeNote: { type: String, default: '', maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Version history (newest first) and exact version lookup.
aiStrategyVersionSchema.index({ strategy: 1, version: -1 }, { unique: true });

export const AiStrategyVersionModel = model<AiStrategyVersionDoc>(
  'AiStrategyVersion',
  aiStrategyVersionSchema,
);
