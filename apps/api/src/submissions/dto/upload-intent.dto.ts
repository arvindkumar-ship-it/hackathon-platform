import { AssetType } from '@prisma/client';
import { IsEnum, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class UploadIntentDto {
  @IsEnum(AssetType)
  assetType!: AssetType;

  @IsString()
  @MaxLength(255)
  originalName!: string;

  @IsString()
  @MaxLength(150)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  fileSize!: number;
}
