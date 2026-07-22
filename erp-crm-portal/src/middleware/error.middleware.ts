import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../common/api-error';
import { ApiErrorBody } from '../common/api-response';
import { formatZodError } from './validate.middleware';
import { isProduction } from '../config/env';
import { logger } from '../common/logger';

/** PostgreSQL error codes we translate into meaningful HTTP responses. */
const PG_ERROR_CODES: Record<string, (error: any) => ApiError> = {
  '23505': (error) =>
    ApiError.conflict(
      `A record with the same ${error.constraint ? `value for "${error.constraint}"` : 'unique value'} already exists.`,
      'DUPLICATE_RECORD',
      { constraint: error.constraint, detail: error.detail },
    ),
  '23503': (error) =>
    ApiError.badRequest(
      'The request references a related record that does not exist.',
      'FOREIGN_KEY_VIOLATION',
      { constraint: error.constraint, detail: error.detail },
    ),
  '23514': (error) =>
    ApiError.conflict(
      error.constraint === 'products_current_stock_non_negative'
        ? 'Operation rejected: stock quantity can never become negative.'
        : 'The request violates a database check constraint.',
      'CHECK_CONSTRAINT_VIOLATION',
      { constraint: error.constraint, detail: error.detail },
    ),
  '23502': (error) =>
    ApiError.badRequest(
      `Required field "${error.column ?? 'unknown'}" cannot be null.`,
      'NOT_NULL_VIOLATION',
      { column: error.column },
    ),
  '22P02': () => ApiError.badRequest('One of the supplied values has an invalid format.', 'INVALID_TEXT_REPRESENTATION'),
  '40001': () =>
    ApiError.conflict(
      'The record was modified by another transaction. Please retry the request.',
      'SERIALIZATION_FAILURE',
    ),
};

const normaliseError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) return formatZodError(error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return ApiError.unprocessable('The uploaded file exceeds the maximum allowed size.', 'FILE_TOO_LARGE');
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return ApiError.unprocessable(
        `Unexpected file field "${error.field}". Upload the image using the "image" form field.`,
        'UNEXPECTED_FILE_FIELD',
      );
    }
    return ApiError.unprocessable(`File upload failed: ${error.message}`, 'FILE_UPLOAD_ERROR');
  }

  const anyError = error as any;

  if (anyError?.code && PG_ERROR_CODES[anyError.code]) {
    return PG_ERROR_CODES[anyError.code](anyError);
  }

  if (anyError?.type === 'entity.parse.failed') {
    return ApiError.badRequest('The request body contains malformed JSON.', 'MALFORMED_JSON');
  }

  if (anyError?.type === 'entity.too.large') {
    return ApiError.unprocessable('The request body is too large.', 'PAYLOAD_TOO_LARGE');
  }

  return ApiError.internal(
    isProduction ? 'An unexpected internal error occurred. Please contact support.' : String(anyError?.message ?? error),
    'INTERNAL_SERVER_ERROR',
  );
};

/** 404 handler for unmatched routes. */
export const notFoundHandler = (req: Request, res: Response): void => {
  const body: ApiErrorBody = {
    success: false,
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} does not exist on this API.`,
    error: { code: 'ROUTE_NOT_FOUND' },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };
  res.status(404).json(body);
};

/** Central error handling middleware. Must be registered last. */
export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const apiError = normaliseError(error);

  if (apiError.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${apiError.statusCode} ${apiError.code}`, error);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${apiError.statusCode} ${apiError.code}: ${apiError.message}`);
  }

  const body: ApiErrorBody = {
    success: false,
    statusCode: apiError.statusCode,
    message: apiError.message,
    error: {
      code: apiError.code,
      ...(apiError.details !== undefined ? { details: apiError.details } : {}),
      ...(!isProduction && error instanceof Error && error.stack ? { stack: error.stack } : {}),
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };

  res.status(apiError.statusCode).json(body);
};
