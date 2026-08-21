import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUser } from '../auth/types/auth-user.type';
import { RequestWithId } from '../common/middleware/request-id.middleware';
import { AdminService } from './admin.service';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { ChangeUserStatusDto } from './dto/change-user-status.dto';
import { ListUsersDto } from './dto/list-users.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser) {
    return this.adminService.overview(user.id);
  }

  @Get('users')
  listUsers(@CurrentUser() user: AuthUser, @Query() dto: ListUsersDto) {
    return this.adminService.listUsers(user.id, dto);
  }

  @Patch('users/:userId/status')
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: ChangeUserStatusDto,
    @Req() request: Request,
  ) {
    const requestWithId = request as RequestWithId;
    return this.adminService.changeStatus(user.id, userId, dto.isActive, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: requestWithId.requestId,
    });
  }

  @Patch('users/:userId/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: ChangeUserRoleDto,
    @Req() request: Request,
  ) {
    const requestWithId = request as RequestWithId;
    return this.adminService.changeRole(user.id, userId, dto.role, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestId: requestWithId.requestId,
    });
  }

  @Get('judges')
  listJudges(@CurrentUser() user: AuthUser) {
    return this.adminService.listJudges(user.id);
  }

  @Get('notifications/health')
  notificationHealth(@CurrentUser() user: AuthUser) {
    return this.adminService.notificationHealth(user.id);
  }
}