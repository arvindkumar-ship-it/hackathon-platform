import { IsEnum } from 'class-validator';
import { EventStatus } from '@prisma/client';

export class ChangeEventStatusDto {
  @IsEnum(EventStatus)
  status!: EventStatus;
}
