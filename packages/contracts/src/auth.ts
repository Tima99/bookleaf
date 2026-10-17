import { z } from 'zod';
import { UserRoleSchema } from './enums';

export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const SessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: UserRoleSchema,
  /** External author code (e.g. AUTH001) for AUTHOR users, null for admins. */
  authorCode: z.string().nullable(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export interface AuthSessionDto {
  user: SessionUser;
  /** Echo this value in the `X-CSRF-Token` header on every state-changing request. */
  csrfToken: string;
  expiresAt: string;
}

export interface AdminUserDto {
  id: string;
  name: string;
  email: string;
}
