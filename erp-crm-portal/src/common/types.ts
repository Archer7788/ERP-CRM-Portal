import { UserRole } from './enums';

/** The authenticated principal attached to every protected request. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
  iat?: number;
  exp?: number;
}

export interface ValidatedRequestData {
  body: any;
  query: any;
  params: any;
}
