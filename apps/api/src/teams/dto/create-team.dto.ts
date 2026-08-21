import { IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/, {
    message: 'Team name contains invalid characters',
  })
  name!: string;
}
