import { z } from 'zod';

/** 24-char hex MongoDB ObjectId, validated at the API boundary. */
export const ObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid identifier');
export type ObjectId = z.infer<typeof ObjectIdSchema>;

export const IdParamsSchema = z.object({ id: ObjectIdSchema });

export const PAGE_SIZE_MAX = 100;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiPaginated<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'CSRF_TOKEN_INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'RATE_LIMITED',
  'AI_UNAVAILABLE',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Comma-separated or repeated query params (`?status=OPEN,IN_PROGRESS` or
 * `?status=OPEN&status=IN_PROGRESS`) parsed into a de-duplicated array.
 */
export function csvEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (raw) => {
      if (raw === undefined || raw === null || raw === '') return undefined;
      const parts = (Array.isArray(raw) ? raw : [raw])
        .flatMap((v) => String(v).split(','))
        .map((v) => v.trim())
        .filter(Boolean);
      return parts.length ? [...new Set(parts)] : undefined;
    },
    z.array(z.enum(values)).optional(),
  );
}

/** ISO date string (YYYY-MM-DD or full ISO timestamp) coerced to a Date. */
export const DateQuerySchema = z.coerce.date();
