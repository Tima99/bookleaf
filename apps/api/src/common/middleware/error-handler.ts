import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { ApiError } from '@bookleaf/contracts';
import { AppError, NotFoundError } from '../errors';
import type { Logger } from '../logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
};

interface HttpLikeError {
  status?: number;
  statusCode?: number;
  type?: string;
}

function isHttpLikeError(err: unknown): err is HttpLikeError & Error {
  return err instanceof Error && ('status' in err || 'statusCode' in err);
}

/**
 * Converts every error into the shared `ApiError` shape. Expected errors keep their
 * status/code; anything unexpected becomes a 500 without leaking stack traces or
 * internal messages to the client (they are logged with the request id instead).
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    const requestId = req.requestId;
    const send = (status: number, error: ApiError['error']) => {
      if (res.headersSent) return;
      res
        .status(status)
        .json({ success: false, error: { ...error, requestId } } satisfies ApiError);
    };

    if (err instanceof AppError) {
      if (err.status >= 500) logger.error({ err, requestId }, err.message);
      return send(err.status, {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
    }

    if (err instanceof mongoose.Error.CastError) {
      return send(400, { code: 'VALIDATION_ERROR', message: `Invalid value for ${err.path}` });
    }

    if (err instanceof mongoose.Error.ValidationError) {
      return send(422, {
        code: 'VALIDATION_ERROR',
        message: 'Data failed validation',
        details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
      });
    }

    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 11000
    ) {
      return send(409, {
        code: 'CONFLICT',
        message: 'A record with the same unique value already exists',
      });
    }

    // body-parser errors (malformed JSON, payload too large)
    if (isHttpLikeError(err)) {
      const status = err.status ?? err.statusCode ?? 500;
      if (err.type === 'entity.parse.failed') {
        return send(400, { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' });
      }
      if (err.type === 'entity.too.large' || status === 413) {
        return send(413, { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' });
      }
      if (status >= 400 && status < 500) {
        return send(status, { code: 'VALIDATION_ERROR', message: 'Bad request' });
      }
    }

    logger.error({ err, requestId, method: req.method, path: req.path }, 'Unhandled error');
    return send(500, {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    });
  };
}
