import { Request } from 'express';
import { AuthUser } from './auth-user.type';

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};
