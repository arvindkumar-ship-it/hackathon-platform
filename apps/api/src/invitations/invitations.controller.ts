import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('teams/:teamId/invitations')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  create(
    @Param('teamId', UuidParamPipe) teamId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(teamId, user.id, dto);
  }

  @Post('invitations/:token/accept')
  accept(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    return this.invitationsService.accept(token, user.id);
  }

  @Get('invitations')
  list(@CurrentUser() user: AuthUser) {
    return this.invitationsService.listForUser(user.id);
  }
}
