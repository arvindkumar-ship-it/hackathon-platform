import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'raw-token-from-email-link' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'YourNewPassword123!' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}