import { Schema, model, type Types } from 'mongoose';
import {
  MESSAGE_SENDER_TYPES,
  RESPONSE_ORIGINS,
  type MessageSenderType,
  type ResponseOrigin,
} from '@bookleaf/contracts';

/**
 * Public conversation messages (author ↔ BookLeaf team). Visible to the author.
 * Internal notes live in a separate collection so an author-facing query can never
 * accidentally include them.
 */
export interface TicketMessageDoc {
  _id: Types.ObjectId;
  ticket: Types.ObjectId;
  senderType: MessageSenderType;
  sender: Types.ObjectId;
  /** Snapshot of the sender's display name at send time (historical record). */
  senderName: string;
  body: string;
  /** Admin replies only: typed manually, from an AI draft (edited/unedited) or a template. */
  origin: ResponseOrigin | null;
  createdAt: Date;
}

const ticketMessageSchema = new Schema<TicketMessageDoc>(
  {
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
    senderType: { type: String, enum: MESSAGE_SENDER_TYPES, required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 10000 },
    origin: { type: String, enum: [...RESPONSE_ORIGINS, null], default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Conversation thread in chronological order.
ticketMessageSchema.index({ ticket: 1, createdAt: 1 });

export const TicketMessageModel = model<TicketMessageDoc>('TicketMessage', ticketMessageSchema);
