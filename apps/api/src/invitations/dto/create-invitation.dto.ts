import { IsEmail, MaxLength } from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
