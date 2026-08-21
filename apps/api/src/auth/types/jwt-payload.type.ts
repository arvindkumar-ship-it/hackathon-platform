import { Role } from '@prisma/client';

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
  type: 'access';
  iat?: number;
  exp?: number;
};
