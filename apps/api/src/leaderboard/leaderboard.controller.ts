import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { LeaderboardService } from './leaderboard.service';

@Controller()
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('events/:eventId/leaderboard')
  getPublic(@Param('eventId', UuidParamPipe) eventId: string) {
    return this.leaderboardService.getPublic(eventId);
  }

  @Get('admin/events/:eventId/leaderboard/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  preview(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaderboardService.preview(eventId, user.id);
  }

  @Post('admin/events/:eventId/leaderboard/recalculate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  recalculate(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaderboardService.recalculate(eventId, user.id);
  }

  @Post('admin/events/:eventId/leaderboard/freeze')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  freeze(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaderboardService.freeze(eventId, user.id);
  }

  @Post('admin/events/:eventId/winners/reveal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  reveal(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.leaderboardService.revealWinners(eventId, user.id);
  }
}