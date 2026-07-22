import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async controller so that any rejected promise is forwarded to the
 * Express error handling middleware instead of crashing the process.
 */
export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
