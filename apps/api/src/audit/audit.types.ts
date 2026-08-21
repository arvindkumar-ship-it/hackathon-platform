import { AuditOutcome, AuditSeverity } from '@prisma/client';

export type AuditInput = {
  eventType: string;
  outcome: AuditOutcome;
  severity?: AuditSeverity;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  eventId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};