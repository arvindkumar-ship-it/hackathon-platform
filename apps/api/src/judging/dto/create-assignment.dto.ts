import { IsUUID } from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID()
  judgeId!: string;

  @IsUUID()
  submissionId!: string;
}