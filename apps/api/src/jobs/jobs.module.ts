import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EMAIL_QUEUE } from './jobs.constants';
import { EmailProcessor } from './email.processor';
import { EmailService } from './email.service';
import { SmtpEmailProvider } from './smtp-email.provider';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
    }),
  ],
  providers: [
    SmtpEmailProvider,
    EmailService,
    EmailProcessor,
    NotificationsService,
  ],
  exports: [
    EmailService,
    NotificationsService,
    BullModule,
  ],
})
export class JobsModule {}