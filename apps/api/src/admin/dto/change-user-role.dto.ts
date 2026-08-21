import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class ChangeUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}