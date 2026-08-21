// Test #2 — reproduces the EXACT client config used inside storage.health.ts,
// including the requestHandler timeout override, to isolate the difference.

import 'dotenv/config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

async function main() {
  const endpoint = process.env.STORAGE_ENDPOINT;
  const bucket = process.env.STORAGE_BUCKET;
  const region = process.env.STORAGE_REGION || 'us-east-1';
  const forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE === 'true';
  const accessKeyId = process.env.STORAGE_ACCESS_KEY || '';
  const secretAccessKey = process.env.STORAGE_SECRET_KEY || '';

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: {
      requestTimeout: 2000,
    } as any,
  });

  try {
    console.log('Trying HeadBucket WITH the requestHandler override (same as storage.health.ts)...');
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log('SUCCESS.');
  } catch (err) {
    console.log('FAILED. Full error below:\n');
    console.error(err);
  }

  client.destroy();
}

main();