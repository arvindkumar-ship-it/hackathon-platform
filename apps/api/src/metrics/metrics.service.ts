import { Injectable } from '@nestjs/common';
import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from 'prom-client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EMAIL_QUEUE } from '../jobs/jobs.constants';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  readonly httpRequestTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });

  readonly emailQueueDepth = new Gauge({
    name: 'email_queue_depth',
    help: 'Number of waiting jobs in the email queue',
    registers: [this.registry],
  });

  readonly emailQueueFailed = new Gauge({
    name: 'email_queue_failed_total',
    help: 'Number of failed jobs in the email queue',
    registers: [this.registry],
  });

  constructor(@InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue) {
    collectDefaultMetrics({ register: this.registry });
  }

  private async refreshQueueMetrics() {
    const [waiting, failed] = await Promise.all([
      this.emailQueue.getWaitingCount(),
      this.emailQueue.getFailedCount(),
    ]);
    this.emailQueueDepth.set(waiting);
    this.emailQueueFailed.set(failed);
  }

  async getMetricsText(): Promise<string> {
    await this.refreshQueueMetrics();
    return this.registry.metrics();
  }
}