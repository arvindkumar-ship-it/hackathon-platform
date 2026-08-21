import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EvaluationScoreDto {
  @IsUUID()
  criterionId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  note?: string;
}

export class SaveEvaluationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluationScoreDto)
  scores!: EvaluationScoreDto[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  overallNote?: string;
}