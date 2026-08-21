import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import cookieParser from 'cookie-parser';
import * as argon2 from 'argon2';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TEST_PASSWORD = 'E2ETestPassword123!';
const emails = {
  admin: 'e2e-upload-admin@example.local',
  participant: 'e2e-upload-participant@example.local',
};

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
  });
  const userIds = users.map((u) => u.id);

  await prisma.event.deleteMany({ where: { slug: { startsWith: 'e2e-upload-' } } });
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function seedUser(email: string, role: Role) {
  const hash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
  return prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash, role },
    create: { name: `E2E Upload ${role}`, email, passwordHash: hash, role },
  });
}

describe('Upload runtime flow (upload-intent -> real MinIO PUT -> complete)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let participantToken: string;
  let eventId: string;
  let submissionId: string;

  beforeAll(async () => {
    await cleanup();
    await seedUser(emails.admin, Role.ADMIN);
    await seedUser(emails.participant, Role.PARTICIPANT);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  function login(email: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(201);
  }

  it('sets up event, opens it, adds participant, creates team + draft submission', async () => {
    const adminRes = await login(emails.admin);
    adminToken = adminRes.body.accessToken;

    const participantRes = await login(emails.participant);
    participantToken = participantRes.body.accessToken;

    const eventSlug = `e2e-upload-${Date.now()}`;
    const eventRes = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Upload Event', slug: eventSlug, description: 'Upload runtime test' })
      .expect(201);
    eventId = eventRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REGISTRATION_OPEN' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUBMISSION_OPEN' })
      .expect(200);

    const participantUser = await prisma.user.findUniqueOrThrow({
      where: { email: emails.participant },
    });
    await prisma.eventMember.createMany({
      data: [{ eventId, userId: participantUser.id }],
      skipDuplicates: true,
    });

    const teamRes = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/teams`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ name: 'E2E Upload Team' })
      .expect(201);
    expect(teamRes.body.id).toBeDefined();

    const submissionRes = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/submissions`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({
        title: 'E2E Upload Submission',
        description: 'Draft submission for upload runtime test',
      })
      .expect(201);

    submissionId = submissionRes.body.id;
    expect(submissionRes.body.status).toBe('DRAFT');
  });

  it('gets an upload-intent, PUTs a real file to MinIO, and completes the upload', async () => {
    const fileContent = Buffer.from('%PDF-1.4 fake pdf content for e2e upload test');
    const mimeType = 'application/pdf';

    const intentRes = await request(app.getHttpServer())
      .post(`/api/v1/submissions/${submissionId}/upload-intent`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({
        assetType: 'SUBMISSION_PDF',
        originalName: 'e2e-test.pdf',
        mimeType,
        fileSize: fileContent.length,
      })
      .expect(201);

    const { assetId, uploadUrl } = intentRes.body;
    expect(assetId).toBeDefined();
    expect(uploadUrl).toBeDefined();

    // Real PUT against the running MinIO container -- this is the genuine
    // runtime step that was never exercised before (only unit-mocked).
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileContent.length),
      },
      body: fileContent,
    });
    expect(putRes.ok).toBe(true);

    const completeRes = await request(app.getHttpServer())
      .post(`/api/v1/submissions/${submissionId}/assets/${assetId}/complete`)
      .set('Authorization', `Bearer ${participantToken}`)
      .expect(201);

    expect(completeRes.body.status).toBe('SAFE');

    const dbAsset = await prisma.submissionAsset.findUniqueOrThrow({
      where: { id: assetId },
    });
    expect(dbAsset.status).toBe('SAFE');
    expect(dbAsset.uploadedAt).not.toBeNull();
  });
});