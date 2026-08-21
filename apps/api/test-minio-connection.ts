// Standalone MinIO connectivity test — run directly, bypasses NestJS entirely.
// Usage (from apps/api folder): npx tsx test-minio-connection.ts

import 'dotenv/config';
import { HeadBucketCommand, S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

async function main() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  const region = process.env.STORAGE_REGION || 'us-east-1';
  const forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE === 'true';
  const accessKeyId = process.env.STORAGE_ACCESS_KEY || '';
  const secretAccessKey = process.env.STORAGE_SECRET_KEY || '';

  console.log('--- Config being used ---');
  console.log({ endpoint, bucket, region, forcePathStyle, accessKeyId, secretAccessKeyLength: secretAccessKey.length });
  console.log('-------------------------');

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    console.log('\n[1] Trying ListBuckets (basic connectivity + auth check)...');
    const listResult = await client.send(new ListBucketsCommand({}));
    console.log('SUCCESS. Buckets found:', listResult.Buckets?.map((b) => b.Name));
  } catch (err) {
    console.log('FAILED at ListBuckets. Full error below:\n');
    console.error(err);
  }

  try {
    console.log('\n[2] Trying HeadBucket on configured bucket...');
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log('SUCCESS. Bucket is reachable:', bucket);
  } catch (err) {
    console.log('FAILED at HeadBucket. Full error below:\n');
    console.error(err);
  }

  client.destroy();
}

main();