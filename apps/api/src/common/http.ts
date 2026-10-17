import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiPaginated, ApiSuccess, PaginationMeta } from '@bookleaf/contracts';
import type { z } from 'zod';
import { AuthenticationError, ValidationError } from './errors';
import type { AuthUser } from './auth-user';

/**
 * Typed request handling.
 *
 * `handle()` validates params / query / body with Zod *before* the controller runs, then
 * passes strongly-typed values in. Controllers never touch raw `req.body` and can't
 * forget validation. Query/param errors are 400; body errors are 422 (well-formed JSON
 * that fails business validation).
 */

export interface HandlerResult<T> {
  status: number;
  body: ApiSuccess<T>;
}

export function ok<T>(data: T, status = 200): HandlerResult<T> {
  return { status, body: { success: true, data } };
}

export function created<T>(data: T): HandlerResult<T> {
  return ok(data, 201);
}

export function paginated<T>(
  items: T[],
  meta: PaginationMeta,
): { status: number; body: ApiPaginated<T> } {
  return { status: 200, body: { success: true, data: items, meta } };
}

export function buildMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

type AnySchema = z.ZodType;
type Infer<S> = S extends AnySchema ? z.output<S> : undefined;

export interface HandlerContext<P, Q, B> {
  params: P;
  query: Q;
  body: B;
  req: Request;
  res: Response;
}

interface Schemas<
  P extends AnySchema | undefined,
  Q extends AnySchema | undefined,
  B extends AnySchema | undefined,
> {
  params?: P;
  query?: Q;
  body?: B;
}

function toDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

export function handle<
  P extends AnySchema | undefined = undefined,
  Q extends AnySchema | undefined = undefined,
  B extends AnySchema | undefined = undefined,
>(
  schemas: Schemas<P, Q, B>,
  fn: (
    ctx: HandlerContext<Infer<P>, Infer<Q>, Infer<B>>,
  ) => Promise<{ status?: number; body: unknown }>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = parsePart(schemas.params, req.params, 'Invalid path parameters', 400);
      const query = parsePart(schemas.query, req.query, 'Invalid query parameters', 400);
      const body = parsePart(schemas.body, req.body ?? {}, 'Request body failed validation', 422);
      const result = await fn({
        params: params as Infer<P>,
        query: query as Infer<Q>,
        body: body as Infer<B>,
        req,
        res,
      });
      res.status(result.status ?? 200).json(result.body);
    } catch (err) {
      next(err);
    }
  };
}

function parsePart(
  schema: AnySchema | undefined,
  value: unknown,
  message: string,
  status: 400 | 422,
) {
  if (!schema) return undefined;
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ValidationError(message, toDetails(parsed.error), status);
  return parsed.data;
}

/** Returns the authenticated user or throws (for use inside protected handlers). */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw new AuthenticationError();
  return req.user;
}
