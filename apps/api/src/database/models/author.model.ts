import { Schema, model, type Types } from 'mongoose';

export interface AuthorDoc {
  _id: Types.ObjectId;
  /** External id from the BookLeaf dataset, e.g. AUTH001. Preserved verbatim. */
  authorCode: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  joinedDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const authorSchema = new Schema<AuthorDoc>(
  {
    authorCode: { type: String, required: true, trim: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, default: null, maxlength: 40 },
    city: { type: String, default: null, maxlength: 80 },
    joinedDate: { type: Date, default: null },
  },
  { timestamps: true },
);

authorSchema.index({ authorCode: 1 }, { unique: true });
authorSchema.index({ email: 1 }, { unique: true });
// Admin author directory default sort.
authorSchema.index({ name: 1 });

export const AuthorModel = model<AuthorDoc>('Author', authorSchema);
