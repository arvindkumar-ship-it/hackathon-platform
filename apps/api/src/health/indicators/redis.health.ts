import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.config.get<string>('REDIS_PORT', '6379')),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    try {
      await client.connect();
      const result = await client.ping();
      const isUp = result === 'PONG';

      if (!isUp) {
        throw new Error(`Unexpected PING response: ${result}`);
      }

      return this.getStatus(key, true);
    } catch (error) {
      const status = this.getStatus(key, false, {
        message: error instanceof Error ? error.message : 'Redis ping failed',
      });

      throw new HealthCheckError('Redis check failed', status);
    } finally {
      client.disconnect();
    }
  }
}