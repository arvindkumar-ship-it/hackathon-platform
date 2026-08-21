import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_JOB, EMAIL_QUEUE } from './jobs.constants';

type CreateNotificationInput = {
  userId?: string;
  eventId?: string;
  type: NotificationType;
  recipient: string;
  subject: string;
  templateKey: string;
  templateData: Record<string, unknown>;
  idempotencyKey: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue: Queue,
  ) {}

  async createAndQueue(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.upsert({
      where: {
        idempotencyKey: input.idempotencyKey,
      },
      create: {
        userId: input.userId,
        eventId: input.eventId,
        type: input.type,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.PENDING,
        recipient: input.recipient.toLowerCase().trim(),
        subject: input.subject,
        templateKey: input.templateKey,
        templateData: input.templateData as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
      },
      update: {},
    });

    if (
      notification.status === NotificationStatus.SENT ||
      notification.status === NotificationStatus.QUEUED ||
      notification.status === NotificationStatus.PROCESSING
    ) {
      return notification;
    }

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.QUEUED,
        queuedAt: new Date(),
      },
    });

    await this.emailQueue.add(
      EMAIL_JOB,
      {
        notificationId: notification.id,
      },
      {
        jobId: `notification:${notification.id}`,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1000,
        },
        removeOnFail: false,
      },
    );

    return notification;
  }
}