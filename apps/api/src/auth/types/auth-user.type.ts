import { Role } from '@prisma/client';

export class AuthUser {
  id!: string;
  email!: string;
  name!: string;
  phone?: string;
  role!: Role;
  isActive!: boolean;
}