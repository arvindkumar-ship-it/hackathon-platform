import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditOutcome,
  AuditSeverity,
  Role,
  EventStatus,
  SubmissionStatus,
  AssignmentStatus,
  NotificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListUsersDto } from './dto/list-users.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview(adminId: string) {
    await this.assertAdmin(adminId);

    const [
      users,
      activeEvents,
      openSubmissions,
      pendingAssignments,
      auditFailures,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.event.count({
        where: {
          status: {
            notIn: [EventStatus.COMPLETED, EventStatus.ARCHIVED],
          },
        },
      }),
      this.prisma.submission.count({
        where: {
          status: SubmissionStatus.DRAFT,
        },
      }),
      this.prisma.judgeAssignment.count({
        where: {
          status: {
            in: [AssignmentStatus.ASSIGNED, AssignmentStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          outcome: {
            in: [AuditOutcome.FAILURE, AuditOutcome.DENIED],
          },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      users,
      activeEvents,
      openSubmissions,
      pendingAssignments,
      auditFailuresLast24Hours: auditFailures,
    };
  }

  async listUsers(adminId: string, dto: ListUsersDto) {
    await this.assertAdmin(adminId);

    const search = dto.search?.trim();

    const where = {
      ...(dto.role ? { role: dto.role } : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              eventMembers: true,
              teamMembers: true,
              judgeAssignments: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (dto.page - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: dto.page,
        pageSize: dto.pageSize,
        total,
        totalPages: Math.ceil(total / dto.pageSize),
      },
    };
  }

  async changeStatus(
    actorId: string,
    userId: string,
    isActive: boolean,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
    },
  ) {
    await this.assertAdmin(actorId);

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        email: true,
      },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (target.id === actorId && !isActive) {
      throw new ConflictException(
        'Admin cannot deactivate their own account',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    await this.audit.record({
      eventType: 'USER_STATUS_CHANGED',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.WARNING,
      actorId,
      targetType: 'USER',
      targetId: userId,
      requestId: metadata?.requestId,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      metadata: {
        previousIsActive: target.isActive,
        nextIsActive: isActive,
      } as Record<string, unknown>,
    });

    return updated;
  }

  async changeRole(
    actorId: string,
    userId: string,
    role: Role,
    metadata?: {
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
    },
  ) {
    await this.assertSuperAdmin(actorId);

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (target.id === actorId && target.role !== role) {
      throw new ConflictException(
        'Super admin cannot change their own role',
      );
    }

    if (
      target.role === Role.SUPER_ADMIN &&
      role !== Role.SUPER_ADMIN
    ) {
      const superAdminCount = await this.prisma.user.count({
        where: {
          role: Role.SUPER_ADMIN,
          isActive: true,
        },
      });

      if (superAdminCount <= 1) {
        throw new ConflictException(
          'Cannot remove the last active super admin',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    await this.audit.record({
      eventType: 'USER_ROLE_CHANGED',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.CRITICAL,
      actorId,
      targetType: 'USER',
      targetId: userId,
      requestId: metadata?.requestId,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      metadata: {
        previousRole: target.role,
        nextRole: role,
      } as Record<string, unknown>,
    });

    return updated;
  }

  async listJudges(adminId: string) {
    await this.assertAdmin(adminId);

    return this.prisma.user.findMany({
      where: {
        role: Role.JUDGE,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            judgeAssignments: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async notificationHealth(adminId: string) {
    await this.assertAdmin(adminId);

    const [pending, processing, failed, deadLetter, sentToday] =
      await this.prisma.$transaction([
        this.prisma.notification.count({
          where: { status: NotificationStatus.PENDING },
        }),
        this.prisma.notification.count({
          where: { status: NotificationStatus.PROCESSING },
        }),
        this.prisma.notification.count({
          where: { status: NotificationStatus.FAILED },
        }),
        this.prisma.notification.count({
          where: { status: NotificationStatus.DEAD_LETTER },
        }),
        this.prisma.notification.count({
          where: {
            status: NotificationStatus.SENT,
            sentAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
      ]);

    return {
      pending,
      processing,
      failed,
      deadLetter,
      sentToday,
    };
  }

  private async assertAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        isActive: true,
      },
    });

    if (
      !user ||
      !user.isActive ||
      (user.role !== Role.ADMIN &&
        user.role !== Role.SUPER_ADMIN)
    ) {
      throw new ForbiddenException('Admin permission required');
    }
  }

  private async assertSuperAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        isActive: true,
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Super admin permission required',
      );
    }
  }
}