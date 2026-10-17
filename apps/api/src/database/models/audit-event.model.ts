import { Schema, model, type Types } from 'mongoose';

export const AUDIT_ENTITY_TYPES = ['TICKET', 'AI_STRATEGY', 'USER'] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface AuditChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** Append-only audit trail of important actions (status changes, overrides, assignments…). */
export interface AuditEventDoc {
  _id: Types.ObjectId;
  entityType: AuditEntityType;
  entityId: Types.ObjectId;
  /** Ticket number for quick display in activity feeds (ticket events only). */
  ticketNumber: number | null;
  action: string;
  summary: string;
  actor: { user: Types.ObjectId | null; name: string; role: 'AUTHOR' | 'ADMIN' | 'SYSTEM' };
  changes: AuditChange[];
  createdAt: Date;
}

const auditEventSchema = new Schema<AuditEventDoc>(
  {
    entityType: { type: String, enum: AUDIT_ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    ticketNumber: { type: Number, default: null },
    action: { type: String, required: true, maxlength: 60 },
    summary: { type: String, required: true, maxlength: 300 },
    actor: {
      type: new Schema(
        {
          user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          name: { type: String, required: true },
          role: { type: String, enum: ['AUTHOR', 'ADMIN', 'SYSTEM'], required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    // Array of { field, from, to }; values are arbitrary so the array is Mixed.
    changes: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Ticket activity timeline.
auditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
// Admin dashboard "recent activity" feed.
auditEventSchema.index({ createdAt: -1 });

export const AuditEventModel = model<AuditEventDoc>('AuditEvent', auditEventSchema);
