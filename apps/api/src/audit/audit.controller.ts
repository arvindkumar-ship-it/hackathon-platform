import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditOutcome, Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUser } from '../auth/types/auth-user.type';
import { AuditService } from './audit.service';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(
    @Query('eventType') eventType: string | undefined,
    @Query('outcome') outcome: AuditOutcome | undefined,
    @Query('actorId') actorId: string | undefined,
    @Query('eventId') eventId: string | undefined,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @CurrentUser() _user: AuthUser,
  ) {
    return this.auditService.list({
      eventType,
      outcome,
      actorId,
      eventId,
      page: Math.max(1, Number(page)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize))),
    });
  }
}