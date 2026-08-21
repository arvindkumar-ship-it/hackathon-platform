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
  admin: 'e2e-admin@example.local',
  judge: 'e2e-judge@example.local',
  participant: 'e2e-participant@example.local',
};

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(emails) } },
  });
  const userIds = users.map((u) => u.id);

  await prisma.event.deleteMany({ where: { slug: { startsWith: 'e2e-' } } });
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
    create: { name: `E2E ${role}`, email, passwordHash: hash, role },
  });
}

describe('Critical path E2E (auth -> event -> team -> submission -> judging -> leaderboard)', () => {
  let app: INestApplication<App>;

  let adminToken: string;
  let participantToken: string;
  let judgeToken: string;

  let eventId: string;
  let eventSlug: string;
  let teamId: string;
  let submissionId: string;
  let rubricId: string;
  let criterionId: string;
  let assignmentId: string;
  let evaluationId: string;

  beforeAll(async () => {
    await cleanup();
    await seedUser(emails.admin, Role.ADMIN);
    await seedUser(emails.judge, Role.JUDGE);
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

  it('logs in as admin, judge, participant', async () => {
    const adminRes = await login(emails.admin);
    adminToken = adminRes.body.accessToken;

    const judgeRes = await login(emails.judge);
    judgeToken = judgeRes.body.accessToken;

    const participantRes = await login(emails.participant);
    participantToken = participantRes.body.accessToken;

    expect(adminToken).toBeDefined();
    expect(judgeToken).toBeDefined();
    expect(participantToken).toBeDefined();
  });

  it('admin creates an event', async () => {
    eventSlug = `e2e-${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Test Event', slug: eventSlug, description: 'Critical path test' })
      .expect(201);

    eventId = res.body.id;
    expect(eventId).toBeDefined();
  });
  it('admin opens registration then submissions', async () => {
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
  });

  // ASSUMPTION (unverified): participant must be an EventMember before
  // creating a team/submission. Original seed script adds EventMember rows
  // manually via prisma — no controller route for it was seen in this
  // session's startup log. If this step causes the NEXT step to fail with
  // 403/404, the real join mechanism needs to be identified.
  // ASK FOR src/teams/teams.controller.ts and teams.service.ts if this fails.
  it('adds participant and judge as event members (direct DB, no confirmed route)', async () => {
    expect(eventId).toBeDefined();
    await prisma.eventMember.createMany({
      data: [
        { eventId, userId: (await prisma.user.findUniqueOrThrow({ where: { email: emails.participant } })).id },
        { eventId, userId: (await prisma.user.findUniqueOrThrow({ where: { email: emails.judge } })).id },
      ],
      skipDuplicates: true,
    });
  });

  it('participant creates a team', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/teams`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ name: 'E2E Team' })
      .expect(201);

    teamId = res.body.id;
    expect(teamId).toBeDefined();
  });

  it('participant creates a submission', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/submissions`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({
        title: 'E2E Submission',
        description: 'A submission created during the critical-path E2E test.',
        figmaUrl: 'https://figma.com/file/e2e-test',
      })
      .expect(201);

    submissionId = res.body.id;
    expect(submissionId).toBeDefined();
  });

  it('participant submits the submission', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/submissions/${submissionId}/submit`)
      .set('Authorization', `Bearer ${participantToken}`);
    console.log('SUBMIT RESPONSE:', res.status, JSON.stringify(res.body));
  });

  it('admin creates a rubric', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/events/${eventId}/rubric`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Rubric',
        description: 'Rubric for critical-path E2E test',
        criteria: [
          { name: 'Quality', description: 'Overall quality', maxScore: 10, weight: 100, sortOrder: 0 },
        ],
      })
      .expect(201);

    rubricId = res.body.id;
    criterionId = res.body.criteria?.[0]?.id;
    expect(rubricId).toBeDefined();
    expect(criterionId).toBeDefined();
  });

  it('admin publishes the rubric', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/rubric/${rubricId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('admin assigns the judge to the submission', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/events/${eventId}/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        judgeId: (await prisma.user.findUniqueOrThrow({ where: { email: emails.judge } })).id,
        submissionId,
      })
      .expect(201);

    assignmentId = res.body.id;
    expect(assignmentId).toBeDefined();
  });

  it('admin moves event status into JUDGING', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'JUDGING' })
      .expect(200);
  });

  it('judge saves and submits an evaluation', async () => {
    const saveRes = await request(app.getHttpServer())
      .post(`/api/v1/judge/assignments/${assignmentId}/evaluation`)
      .set('Authorization', `Bearer ${judgeToken}`)
      .send({ scores: [{ criterionId, score: 9 }] })
      .expect(201);

    evaluationId = saveRes.body.id;
    expect(evaluationId).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/v1/judge/evaluations/${evaluationId}/submit`)
      .set('Authorization', `Bearer ${judgeToken}`)
      .expect(201);
  });

  it('admin recalculates and freezes the leaderboard', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/events/${eventId}/leaderboard/recalculate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'LEADERBOARD_FROZEN' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/events/${eventId}/leaderboard/freeze`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('admin reveals winners', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'WINNERS_REVEALED' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/events/${eventId}/winners/reveal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('public leaderboard is now visible and excludes judge identity', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/leaderboard`)
      .expect(200);

    expect(Array.isArray(res.body.entries)).toBe(true);
    if (res.body.entries.length) {
      expect(res.body.entries[0]).not.toHaveProperty('judgeId');
      expect(res.body.entries[0]).not.toHaveProperty('overallNote');
    }
  });
});