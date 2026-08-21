import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateSubmissionDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsUrl(
    {
      protocols: ['https'],
      require_protocol: true,
    },
    {
      message: 'figmaUrl must be a valid HTTPS URL',
    },
  )
  @MaxLength(2000)
  figmaUrl?: string;
}
