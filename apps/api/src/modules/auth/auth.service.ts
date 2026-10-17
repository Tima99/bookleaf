import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { AuthSessionDto, LoginRequest } from '@bookleaf/contracts';
import { AuthenticationError } from '../../common/errors';
import type { AuthUser } from '../../common/auth-user';
import { AuthorModel, UserModel } from '../../database/models';

export const BCRYPT_COST = 12;

const TokenPayloadSchema = z.object({
  sub: z.string(),
  role: z.enum(['AUTHOR', 'ADMIN']),
  csrf: z.string().min(16),
  exp: z.number(),
});

export interface AuthServiceOptions {
  jwtSecret: string;
  sessionTtlHours: number;
}

// Used to keep login timing constant when the email does not exist (no user enumeration).
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_COST);

export class AuthService {
  constructor(private readonly options: AuthServiceOptions) {}

  async login(
    input: LoginRequest,
  ): Promise<{ token: string; session: AuthSessionDto; maxAgeMs: number }> {
    const user = await UserModel.findOne({ email: input.email }).select('+passwordHash').lean();
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid || !user.isActive) {
      throw new AuthenticationError('Incorrect email or password', 'INVALID_CREDENTIALS');
    }

    const csrf = randomBytes(24).toString('base64url');
    const maxAgeMs = this.options.sessionTtlHours * 3_600_000;
    const token = jwt.sign({ role: user.role, csrf }, this.options.jwtSecret, {
      subject: user._id.toString(),
      expiresIn: Math.floor(maxAgeMs / 1000),
      algorithm: 'HS256',
    });
    await UserModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    const authUser = await this.resolveSession(token);
    return { token, session: this.toSessionDto(authUser), maxAgeMs };
  }

  /** Verifies the signed session token and loads the current user state. */
  async resolveSession(token: string): Promise<AuthUser> {
    let payload: z.infer<typeof TokenPayloadSchema>;
    try {
      const decoded = jwt.verify(token, this.options.jwtSecret, { algorithms: ['HS256'] });
      payload = TokenPayloadSchema.parse(decoded);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError(
          'Your session has expired. Please sign in again.',
          'SESSION_EXPIRED',
        );
      }
      throw new AuthenticationError();
    }

    const user = await UserModel.findById(payload.sub).lean();
    if (!user || !user.isActive) throw new AuthenticationError();
    // A role change invalidates existing sessions.
    if (user.role !== payload.role) throw new AuthenticationError();

    let authorCode: string | null = null;
    if (user.role === 'AUTHOR') {
      if (!user.author) throw new AuthenticationError('Author profile missing for this account');
      const author = await AuthorModel.findById(user.author).select('authorCode').lean();
      if (!author) throw new AuthenticationError('Author profile missing for this account');
      authorCode = author.authorCode;
    }

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      authorId: user.role === 'AUTHOR' && user.author ? user.author.toString() : null,
      authorCode,
      csrfToken: payload.csrf,
      sessionExpiresAt: new Date(payload.exp * 1000),
    };
  }

  toSessionDto(user: AuthUser): AuthSessionDto {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authorCode: user.authorCode,
      },
      csrfToken: user.csrfToken,
      expiresAt: user.sessionExpiresAt.toISOString(),
    };
  }
}
