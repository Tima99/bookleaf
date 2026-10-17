import type { UserRole } from '@bookleaf/contracts';

/** The authenticated principal attached to `req.user` by the authenticate middleware. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** MongoDB id of the linked Author profile (AUTHOR role only). Derived server-side. */
  authorId: string | null;
  authorCode: string | null;
  csrfToken: string;
  sessionExpiresAt: Date;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}
