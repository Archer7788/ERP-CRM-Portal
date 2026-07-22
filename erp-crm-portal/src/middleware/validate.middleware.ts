import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AnyZodObject, ZodError, ZodTypeAny } from 'zod';
import { ApiError } from '../common/api-error';

export interface ValidationSchemas {
  body?: ZodTypeAny | AnyZodObject;
  query?: ZodTypeAny | AnyZodObject;
  params?: ZodTypeAny | AnyZodObject;
}

export const formatZodError = (error: ZodError): ApiError =>
  ApiError.unprocessable(
    'Request validation failed. Please correct the highlighted fields and try again.',
    'VALIDATION_ERROR',
    error.issues.map((issue) => ({
      field: issue.path.length ? issue.path.join('.') : '(root)',
      message: issue.message,
      code: issue.code,
    })),
  );

/** Ensures `req.validated` always exists, even on routes without a schema. */
export const initValidatedRequest: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  req.validated = {
    body: req.body ?? {},
    query: req.query ?? {},
    params: req.params ?? {},
  };
  next();
};

/**
 * Validates and normalises `body`, `query` and `params` against Zod schemas.
 * Parsed (coerced, trimmed, defaulted) output is exposed on `req.validated`.
 * Unknown keys are stripped, which prevents mass-assignment on write endpoints.
 */
export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.validated) {
        req.validated = { body: req.body ?? {}, query: req.query ?? {}, params: req.params ?? {} };
      }
      if (schemas.params) {
        req.validated.params = schemas.params.parse(req.params ?? {});
      }
      if (schemas.query) {
        req.validated.query = schemas.query.parse(req.query ?? {});
      }
      if (schemas.body) {
        const parsedBody = schemas.body.parse(req.body ?? {});
        req.validated.body = parsedBody;
        req.body = parsedBody;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(formatZodError(error));
        return;
      }
      next(error);
    }
  };
