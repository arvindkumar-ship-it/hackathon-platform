import { Role } from '@prisma/client';

export class AuthUser {
  id!: string;
  email!: string;
  name!: string;
  role!: Role;
  isActive!: boolean;
}