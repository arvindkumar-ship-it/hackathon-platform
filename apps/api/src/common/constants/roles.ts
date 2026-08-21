import { Role } from '@prisma/client';

export const ADMIN_ROLES = [Role.ADMIN, Role.SUPER_ADMIN] as const;
