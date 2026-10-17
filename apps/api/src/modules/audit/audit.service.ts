import { Types } from 'mongoose';
import { formatTicketReference, type ActivityDto } from '@bookleaf/contracts';
import type { Logger } from '../../common/logger';
import type { AuthUser } from '../../common/auth-user';
import {
  AuditEventModel,
  type AuditChange,
  type AuditEntityType,
  type AuditEventDoc,
} from '../../database/models';

export type AuditActor = {
  user: Types.ObjectId | null;
  name: string;
  role: 'AUTHOR' | 'ADMIN' | 'SYSTEM';
};

export const SYSTEM_ACTOR: AuditActor = { user: null, name: 'BookLeaf system', role: 'SYSTEM' };

export function actorFrom(user: AuthUser): AuditActor {
  return { user: new Types.ObjectId(user.id), name: user.name, role: user.role };
}

export interface AuditInput {
  entityType: AuditEntityType;
  entityId: Types.ObjectId | string;
  ticketNumber?: number | null;
  action: string;
  summary: string;
  actor: AuditActor;
  changes?: AuditChange[];
}

/**
 * Append-only audit trail. Recording is best-effort: a failed audit write is logged but
 * never rolls back the business operation it describes (documented trade-off).
 */
export class AuditService {
  constructor(private readonly logger: Logger) {}

  async record(input: AuditInput): Promise<void> {
    try {
      await AuditEventModel.create({
        entityType: input.entityType,
        entityId: new Types.ObjectId(input.entityId.toString()),
        ticketNumber: input.ticketNumber ?? null,
        action: input.action,
        summary: input.summary.slice(0, 300),
        actor: input.actor,
        changes: input.changes ?? [],
      });
    } catch (err) {
      this.logger.error({ err, action: input.action }, 'Failed to record audit event');
    }
  }

  async listForEntity(
    entityType: AuditEntityType,
    entityId: string,
    limit = 50,
  ): Promise<ActivityDto[]> {
    const rows = await AuditEventModel.find({ entityType, entityId: new Types.ObjectId(entityId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return rows.map(toActivityDto);
  }

  async listRecent(limit = 15): Promise<ActivityDto[]> {
    const rows = await AuditEventModel.find({ entityType: 'TICKET' })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return rows.map(toActivityDto);
  }
}

export function toActivityDto(row: AuditEventDoc): ActivityDto {
  return {
    id: row._id.toString(),
    action: row.action,
    summary: row.summary,
    actor: { id: row.actor.user?.toString() ?? null, name: row.actor.name, role: row.actor.role },
    ticket:
      row.entityType === 'TICKET' && row.ticketNumber !== null
        ? { id: row.entityId.toString(), reference: formatTicketReference(row.ticketNumber) }
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}
