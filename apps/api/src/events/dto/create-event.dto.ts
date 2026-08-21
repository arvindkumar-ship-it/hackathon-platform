import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  registrationDeadline?: string;

  @IsOptional()
  @IsISO8601()
  submissionDeadline?: string;

  @IsOptional()
  @IsISO8601()
  judgingDeadline?: string;
}