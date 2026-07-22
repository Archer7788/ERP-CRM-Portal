import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { query } from '../config/database';
import { ApiError } from '../common/api-error';
import { AuthUser, JwtPayload } from '../common/types';
import { UserRole } from '../common/enums';
import { asyncHandler } from '../common/async-handler';

const extractBearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
};

/**
 * Verifies the JWT, then re-loads the user from the database so that
 * deactivated or deleted accounts lose access immediately, even while their
 * previously issued token is still within its expiry window.
 */
export const authenticate: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      throw ApiError.unauthorized(
        'Missing or malformed Authorization header. Expected format: "Authorization: Bearer <token>".',
        'MISSING_AUTH_TOKEN',
      );
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('Your session has expired. Please log in again.', 'TOKEN_EXPIRED');
      }
      throw ApiError.unauthorized('The provided authentication token is invalid.', 'INVALID_TOKEN');
    }

    const result = await query<{
      id: string;
      name: string;
      email: string;
      role: UserRole;
      is_active: boolean;
    }>('SELECT id, name, email, role, is_active FROM users WHERE id = $1', [payload.sub]);

    const user = result.rows[0];
    if (!user) {
      throw ApiError.unauthorized('The user linked to this token no longer exists.', 'USER_NOT_FOUND');
    }
    if (!user.is_active) {
      throw ApiError.forbidden('This user account has been deactivated.', 'USER_INACTIVE');
    }

    const authUser: AuthUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    req.user = authUser;
    next();
  },
);

/**
 * Role Based Access Control. Usage: `authorize(UserRole.ADMIN, UserRole.SALES)`.
 * ADMIN always passes, since the Admin role has full access to every module.
 */
export const authorize =
  (...allowedRoles: UserRole[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication is required before authorization can be checked.', 'UNAUTHENTICATED'));
      return;
    }
    if (allowedRoles.length === 0 || req.user.role === UserRole.ADMIN || allowedRoles.includes(req.user.role)) {
      next();
      return;
    }
    next(
      ApiError.forbidden(
        `Access denied. This action requires one of the following roles: ${allowedRoles.join(', ')}. Your role is ${req.user.role}.`,
        'INSUFFICIENT_ROLE',
        { requiredRoles: allowedRoles, currentRole: req.user.role },
      ),
    );
  };

/** Convenience helper for controllers: guarantees a non-null user. */
export const requireUser = (req: Request): AuthUser => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication context is missing from this request.', 'UNAUTHENTICATED');
  }
  return req.user;
};
