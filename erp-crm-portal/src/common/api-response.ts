import { Response } from 'express';

/** Consistent success envelope returned by every endpoint. */
export interface ApiSuccessBody<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
  path: string;
}

/** Consistent error envelope returned by the error middleware. */
export interface ApiErrorBody {
  success: false;
  statusCode: number;
  message: string;
  error: {
    code: string;
    details?: unknown;
    stack?: string;
  };
  timestamp: string;
  path: string;
}

export const sendSuccess = <T>(
  res: Response,
  options: { data: T; message?: string; statusCode?: number; meta?: Record<string, unknown> },
): Response<ApiSuccessBody<T>> => {
  const statusCode = options.statusCode ?? 200;
  const body: ApiSuccessBody<T> = {
    success: true,
    statusCode,
    message: options.message ?? 'Request completed successfully',
    data: options.data,
    ...(options.meta ? { meta: options.meta } : {}),
    timestamp: new Date().toISOString(),
    path: res.req?.originalUrl ?? '',
  };
  return res.status(statusCode).json(body);
};

export const sendCreated = <T>(res: Response, data: T, message = 'Resource created successfully') =>
  sendSuccess(res, { data, message, statusCode: 201 });

export const sendPaginated = <T>(
  res: Response,
  items: T[],
  meta: Record<string, unknown>,
  message = 'Records fetched successfully',
) => sendSuccess(res, { data: items, message, meta });
