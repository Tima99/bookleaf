import { Schema, model, type Types } from 'mongoose';

/** Admin-only notes. Only ever read by admin endpoints. */
export interface InternalNoteDoc {
  _id: Types.ObjectId;
  ticket: Types.ObjectId;
  author: Types.ObjectId;
  authorName: string;
  body: string;
  createdAt: Date;
}

const internalNoteSchema = new Schema<InternalNoteDoc>(
  {
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 5000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

internalNoteSchema.index({ ticket: 1, createdAt: 1 });

export const InternalNoteModel = model<InternalNoteDoc>('InternalNote', internalNoteSchema);
