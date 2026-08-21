import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @ApiPropertyOptional({ example: 'your-refresh-token' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}