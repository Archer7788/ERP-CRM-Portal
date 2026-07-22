import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database';
import { env } from '../../config/env';
import { ApiError } from '../../common/api-error';
import { AuthUser, JwtPayload } from '../../common/types';
import { UserRole } from '../../common/enums';
import { ChangePasswordInput, LoginInput, RegisterUserInput } from './auth.validation';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toPublicUser = (row: UserRow): PublicUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isActive: row.is_active,
  lastLoginAt: row.last_login_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);

const signToken = (user: UserRow): { token: string; expiresIn: string } => {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'erp-crm-operations-portal',
  } as jwt.SignOptions);
  return { token, expiresIn: env.JWT_EXPIRES_IN };
};

/** POST /auth/login - verifies credentials and issues a JWT. */
export const login = async (input: LoginInput) => {
  const result = await query<UserRow>('SELECT * FROM users WHERE email = $1', [input.email]);
  const user = result.rows[0];

  // The same generic message is returned for unknown email and wrong password
  // so the endpoint cannot be used to enumerate valid accounts.
  const invalidCredentials = ApiError.unauthorized(
    'Invalid email or password. Please check your credentials and try again.',
    'INVALID_CREDENTIALS',
  );

  if (!user) {
    // Constant-ish time: still run a hash comparison against a dummy hash.
    await bcrypt.compare(input.password, '$2a$10$C6UzMDM.H6dfI/f/IKcEeO1nJ8p8b6TQPHy0h.g0.3SgqWnpN6O5W');
    throw invalidCredentials;
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordMatches) throw invalidCredentials;

  if (!user.is_active) {
    throw ApiError.forbidden(
      'This user account has been deactivated. Please contact an administrator.',
      'USER_INACTIVE',
    );
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const { token, expiresIn } = signToken(user);
  return {
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn,
    user: toPublicUser(user),
  };
};

/** POST /auth/register - Admin only user provisioning. */
export const registerUser = async (input: RegisterUserInput): Promise<PublicUser> => {
  const existing = await query('SELECT id FROM users WHERE email = $1', [input.email]);
  if (existing.rowCount) {
    throw ApiError.conflict(`A user with the email "${input.email}" already exists.`, 'EMAIL_ALREADY_EXISTS');
  }

  const passwordHash = await hashPassword(input.password);
  const result = await query<UserRow>(
    `INSERT INTO users (name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.name, input.email, passwordHash, input.role, input.isActive],
  );
  return toPublicUser(result.rows[0]);
};

/** GET /auth/me */
export const getProfile = async (userId: string): Promise<PublicUser> => {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];
  if (!user) throw ApiError.notFound('User profile not found.', 'USER_NOT_FOUND');
  return toPublicUser(user);
};

/** POST /auth/change-password */
export const changePassword = async (user: AuthUser, input: ChangePasswordInput): Promise<void> => {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [user.id]);
  const row = result.rows[0];
  if (!row) throw ApiError.notFound('User profile not found.', 'USER_NOT_FOUND');

  const matches = await bcrypt.compare(input.currentPassword, row.password_hash);
  if (!matches) {
    throw ApiError.unauthorized('The current password you entered is incorrect.', 'INVALID_CURRENT_PASSWORD');
  }

  const newHash = await hashPassword(input.newPassword);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, user.id]);
};

/** GET /auth/users - Admin only listing of portal users. */
export const listUsers = async (): Promise<PublicUser[]> => {
  const result = await query<UserRow>('SELECT * FROM users ORDER BY created_at DESC');
  return result.rows.map(toPublicUser);
};
