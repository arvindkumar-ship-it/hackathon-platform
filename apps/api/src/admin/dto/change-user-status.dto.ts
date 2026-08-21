import { IsBoolean } from 'class-validator';

export class ChangeUserStatusDto {
  @IsBoolean()
  isActive!: boolean;
}