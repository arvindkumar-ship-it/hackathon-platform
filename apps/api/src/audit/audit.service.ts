import { Injectable } from '@nestjs/common';
import { AuditOutcome, AuditSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditInput } from './audit.types';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput) {
    return this.prisma.auditLog.create({
      data: {
        eventType: input.eventType,
        outcome: input.outcome,
        severity: input.severity ?? AuditSeverity.INFO,
        actorId: input.actorId,
        targetType: input.targetType,
        targetId: input.targetId,
        eventId: input.eventId,
        requestId: input.requestId,
        ipAddress: this.normalizeIp(input.ipAddress),
        userAgent: input.userAgent?.slice(0, 500),
        metadata: this.sanitizeMetadata(input.metadata) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(filters: {
    eventType?: string;
    outcome?: AuditOutcome;
    actorId?: string;
    eventId?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.outcome ? { outcome: filters.outcome } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.eventId ? { eventId: filters.eventId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  }

  private sanitizeMetadata(metadata?: Record<string, unknown>) {
    if (!metadata) return undefined;

    const blockedKeys = new Set([
      'password',
      'passwordHash',
      'accessToken',
      'refreshToken',
      'token',
      'secret',
      'apiKey',
      'authorization',
      'signedUrl',
      'uploadUrl',
    ]);

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (blockedKeys.has(key)) continue;

      if (typeof value === 'string') {
        result[key] = value.slice(0, 1000);
      } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        result[key] = value;
      }
    }

    return result;
  }

  private normalizeIp(ip?: string) {
    if (!ip) return undefined;
    return ip.replace(/^::ffff:/, '').slice(0, 80);
  }
}