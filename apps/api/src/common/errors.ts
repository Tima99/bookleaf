import type { AiFailureKind, ApiErrorDetail, ErrorCode } from '@bookleaf/contracts';

/** Base class for expected, client-presentable failures. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ApiErrorDetail[], status: 400 | 422 = 400) {
    super(status, 'VALIDATION_ERROR', message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Please sign in to continue', code: ErrorCode = 'UNAUTHENTICATED') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, 'FORBIDDEN', message);
  }
}

export class CsrfError extends AppError {
  constructor() {
    super(
      403,
      'CSRF_TOKEN_INVALID',
      'Missing or invalid CSRF token. Refresh the page and try again.',
    );
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message: string) {
    super(409, 'INVALID_STATE_TRANSITION', message);
  }
}

/**
 * Normalised failure from an LLM provider. The AI services catch this and degrade
 * gracefully; it only surfaces as an HTTP error where the caller explicitly asked for AI.
 */
export class AiError extends Error {
  constructor(
    public readonly kind: AiFailureKind,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
