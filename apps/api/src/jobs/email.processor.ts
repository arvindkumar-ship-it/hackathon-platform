import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import {
  AuditOutcome,
  AuditSeverity,
  NotificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from './email.service';
import { renderTemplate } from './email-templates';
import { EMAIL_JOB, EMAIL_QUEUE } from './jobs.constants';

type EmailJobData = {
  notificationId: string;
};

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>) {
    if (job.name !== EMAIL_JOB) {
      throw new UnrecoverableError(`Unsupported email job: ${job.name}`);
    }

    const notification = await this.prisma.notification.findUnique({
      where: {
        id: job.data.notificationId,
      },
    });

    if (!notification) {
      throw new UnrecoverableError('Notification record not found');
    }

    if (
      notification.status === NotificationStatus.SENT ||
      notification.status === NotificationStatus.CANCELLED
    ) {
      return {
        skipped: true,
        status: notification.status,
      };
    }

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.PROCESSING,
        attempts: {
          increment: 1,
        },
      },
    });

    try {
      const rendered = renderTemplate(
        notification.templateKey,
        notification.templateData as Record<string, unknown>,
      );

      const result = await this.emailService.send({
        to: notification.recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      const sent = await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          lastError: null,
        },
      });

      await this.audit.record({
        eventType: 'NOTIFICATION_SENT',
        outcome: AuditOutcome.SUCCESS,
        actorId: notification.userId ?? undefined,
        eventId: notification.eventId ?? undefined,
        targetType: 'NOTIFICATION',
        targetId: notification.id,
        metadata: {
          type: notification.type,
          channel: notification.channel,
        },
      });

      return sent;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown email error';

      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
          lastError: message.slice(0, 2000),
        },
      });

      await this.audit.record({
        eventType: 'NOTIFICATION_SEND_FAILED',
        outcome: AuditOutcome.FAILURE,
        severity: AuditSeverity.WARNING,
        actorId: notification.userId ?? undefined,
        eventId: notification.eventId ?? undefined,
        targetType: 'NOTIFICATION',
        targetId: notification.id,
        metadata: {
          type: notification.type,
          attempt: job.attemptsMade + 1,
        },
      });

      throw error;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<EmailJobData> | undefined, error: Error) {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;

    if (job.attemptsMade >= maxAttempts) {
      await this.prisma.notification.update({
        where: {
          id: job.data.notificationId,
        },
        data: {
          status: NotificationStatus.DEAD_LETTER,
          lastError: error.message.slice(0, 2000),
          failedAt: new Date(),
        },
      });

      await this.audit.record({
        eventType: 'NOTIFICATION_DEAD_LETTER',
        outcome: AuditOutcome.FAILURE,
        severity: AuditSeverity.ERROR,
        targetType: 'NOTIFICATION',
        targetId: job.data.notificationId,
        metadata: {
          attempts: job.attemptsMade,
        },
      });
    }
  }
}