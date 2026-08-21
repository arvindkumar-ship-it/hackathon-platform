import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const endpoint = this.config.get<string>('STORAGE_ENDPOINT');
    const bucket = this.config.get<string>('STORAGE_BUCKET');

    const client = new S3Client({
      region: this.config.get<string>('STORAGE_REGION', 'us-east-1'),
      endpoint: endpoint || undefined,
      forcePathStyle:
        this.config.get<string>('STORAGE_FORCE_PATH_STYLE', 'false') === 'true',
      credentials: {
        accessKeyId: this.config.get<string>('STORAGE_ACCESS_KEY', ''),
        secretAccessKey: this.config.get<string>('STORAGE_SECRET_KEY', ''),
      },
      requestHandler: {
        requestTimeout: 2000,
      } as any,
    });

    try {
      if (!bucket) {
        throw new Error('STORAGE_BUCKET is not configured');
      }

      await client.send(new HeadBucketCommand({ Bucket: bucket }));

      return this.getStatus(key, true);
    } catch (error) {
      //console.error('STORAGE HEALTH CHECK RAW ERROR:', error);
      const status = this.getStatus(key, false, {
        message: error instanceof Error ? error.message : 'Storage check failed',
      });

      throw new HealthCheckError('Storage check failed', status);
    } finally {
      client.destroy();
    }
  }
}