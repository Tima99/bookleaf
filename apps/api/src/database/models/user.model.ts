import { Schema, model, type Types } from 'mongoose';
import { USER_ROLES, type UserRole } from '@bookleaf/contracts';

/**
 * Authentication identity. Kept separate from the Author profile so admins (who are not
 * authors) share the same login mechanism, and so credentials never travel with
 * author/book queries.
 */
export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  /** Linked author profile for AUTHOR users. */
  author: Types.ObjectId | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, enum: USER_ROLES, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'Author', default: null },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Login lookup.
userSchema.index({ email: 1 }, { unique: true });
// One login per author profile.
userSchema.index(
  { author: 1 },
  { unique: true, partialFilterExpression: { author: { $type: 'objectId' } } },
);
// Admin directory (assignee picker).
userSchema.index({ role: 1, name: 1 });

export const UserModel = model<UserDoc>('User', userSchema);
