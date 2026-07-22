/**
 * Application level error carrying an HTTP status code, a machine readable code
 * and optional structured details. Everything thrown by services should be an ApiError
 * so that the error middleware can produce a consistent response body.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown) {
    return new ApiError(400, message, code, details);
  }

  static unauthorized(message = 'Authentication is required to access this resource', code = 'UNAUTHORIZED', details?: unknown) {
    return new ApiError(401, message, code, details);
  }

  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN', details?: unknown) {
    return new ApiError(403, message, code, details);
  }

  static notFound(message = 'The requested resource was not found', code = 'NOT_FOUND', details?: unknown) {
    return new ApiError(404, message, code, details);
  }

  static conflict(message: string, code = 'CONFLICT', details?: unknown) {
    return new ApiError(409, message, code, details);
  }

  static unprocessable(message: string, code = 'VALIDATION_ERROR', details?: unknown) {
    return new ApiError(422, message, code, details);
  }

  static tooManyRequests(message = 'Too many requests, please try again later', code = 'RATE_LIMITED') {
    return new ApiError(429, message, code);
  }

  static internal(message = 'An unexpected internal error occurred', code = 'INTERNAL_SERVER_ERROR', details?: unknown) {
    return new ApiError(500, message, code, details);
  }

  static serviceUnavailable(message: string, code = 'SERVICE_UNAVAILABLE', details?: unknown) {
    return new ApiError(503, message, code, details);
  }
}
