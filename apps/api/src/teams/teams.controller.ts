import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post('events/:eventId/teams')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  create(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.create(eventId, user.id, dto);
  }

  @Get('events/:eventId/teams')
  list(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teamsService.listForEvent(eventId, user.id);
  }

  @Get('teams/:teamId')
  getById(
    @Param('teamId', UuidParamPipe) teamId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teamsService.getById(teamId, user.id);
  }

  @Patch('teams/:teamId')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  update(
    @Param('teamId', UuidParamPipe) teamId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(teamId, user.id, dto);
  }

  @Delete('teams/:teamId/members/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  removeMember(
    @Param('teamId', UuidParamPipe) teamId: string,
    @Param('userId', UuidParamPipe) userId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teamsService.removeMember(teamId, userId, user.id);
  }
}
