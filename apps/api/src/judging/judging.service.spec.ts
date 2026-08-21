import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AssignmentStatus, EvaluationStatus, Role, RubricStatus } from '@prisma/client';
import { JudgingService } from './judging.service';
import { PrismaService } from '../prisma/prisma.service';

describe('JudgingService', () => {
  let service: JudgingService;
  let prisma: any;

  const adminUser = { role: Role.ADMIN, isActive: true };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      rubric: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      rubricCriterion: { deleteMany: jest.fn() },
      judgeAssignment: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      submission: { findUnique: jest.fn() },
      evaluation: { upsert: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [JudgingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(JudgingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createRubric — weight validation', () => {
    it('rejects criteria whose weights do not sum to 100', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);

      await expect(
        service.createRubric('event-1', 'admin', {
          name: 'Rubric',
          description: 'desc',
          criteria: [
            { name: 'A', description: 'd', maxScore: 10, weight: 40, sortOrder: 0 },
            { name: 'B', description: 'd', maxScore: 10, weight: 40, sortOrder: 1 },
          ],
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when a rubric already exists for the event', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.rubric.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createRubric('event-1', 'admin', {
          name: 'Rubric',
          description: 'desc',
          criteria: [
            { name: 'A', description: 'd', maxScore: 10, weight: 60, sortOrder: 0 },
            { name: 'B', description: 'd', maxScore: 10, weight: 40, sortOrder: 1 },
          ],
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createAssignment — uniqueness', () => {
    it('rejects duplicate judge+submission via Prisma P2002', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.user.findUnique.mockResolvedValueOnce(adminUser); // assertAdmin call
      // Second call (inside Promise.all) resolves the judge lookup
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'judge-1',
        role: Role.JUDGE,
        isActive: true,
      });
      prisma.submission.findUnique.mockResolvedValue({
        id: 'sub-1',
        eventId: 'event-1',
        status: 'SUBMITTED',
      });
      prisma.rubric.findUnique.mockResolvedValue({
        id: 'rubric-1',
        status: RubricStatus.PUBLISHED,
      });

      const prismaError = Object.assign(new Error('duplicate'), {
        code: 'P2002',
        constructor: { name: 'PrismaClientKnownRequestError' },
      });
      Object.setPrototypeOf(
        prismaError,
        require('@prisma/client').Prisma.PrismaClientKnownRequestError.prototype,
      );

      prisma.judgeAssignment.create.mockRejectedValue(prismaError);

      await expect(
        service.createAssignment('event-1', 'admin', {
          judgeId: 'judge-1',
          submissionId: 'sub-1',
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('saveEvaluation — score validation', () => {
    const buildAssignment = (overrides: Partial<any> = {}) => ({
      id: 'assignment-1',
      judgeId: 'judge-1',
      status: AssignmentStatus.ASSIGNED,
      submissionId: 'sub-1',
      event: { status: 'JUDGING' },
      rubric: {
        status: RubricStatus.PUBLISHED,
        criteria: [{ id: 'c1', name: 'Innovation', maxScore: 10, weight: 50 }],
      },
      evaluation: null,
      ...overrides,
    });

    it('rejects duplicate criterion scores', async () => {
      jest.spyOn(service, 'getJudgeAssignment').mockResolvedValue(buildAssignment() as any);

      await expect(
        service.saveEvaluation('assignment-1', 'judge-1', {
          scores: [
            { criterionId: 'c1', score: 5 },
            { criterionId: 'c1', score: 6 },
          ],
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a score outside 0..maxScore', async () => {
      jest.spyOn(service, 'getJudgeAssignment').mockResolvedValue(buildAssignment() as any);

      await expect(
        service.saveEvaluation('assignment-1', 'judge-1', {
          scores: [{ criterionId: 'c1', score: 15 }],
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when judging is closed for the event', async () => {
      jest
        .spyOn(service, 'getJudgeAssignment')
        .mockResolvedValue(buildAssignment({ event: { status: 'LEADERBOARD_FROZEN' } }) as any);

      await expect(
        service.saveEvaluation('assignment-1', 'judge-1', {
          scores: [{ criterionId: 'c1', score: 5 }],
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects modifying an already-submitted evaluation', async () => {
      jest.spyOn(service, 'getJudgeAssignment').mockResolvedValue(
        buildAssignment({ evaluation: { status: EvaluationStatus.SUBMITTED } }) as any,
      );

      await expect(
        service.saveEvaluation('assignment-1', 'judge-1', {
          scores: [{ criterionId: 'c1', score: 5 }],
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('submitEvaluation — completeness guard', () => {
    it('rejects submit when not every rubric criterion is scored', async () => {
      prisma.evaluation.findUnique.mockResolvedValue({
        id: 'eval-1',
        judgeId: 'judge-1',
        status: EvaluationStatus.DRAFT,
        assignmentId: 'assignment-1',
        assignment: {
          event: { status: 'JUDGING' },
          rubric: {
            criteria: [{ id: 'c1' }, { id: 'c2' }],
          },
        },
        scores: [{ criterionId: 'c1' }],
      });

      await expect(service.submitEvaluation('eval-1', 'judge-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects submit by a judge who does not own the evaluation', async () => {
      prisma.evaluation.findUnique.mockResolvedValue({
        id: 'eval-1',
        judgeId: 'someone-else',
        status: EvaluationStatus.DRAFT,
        assignmentId: 'assignment-1',
        assignment: {
          event: { status: 'JUDGING' },
          rubric: { criteria: [{ id: 'c1' }] },
        },
        scores: [{ criterionId: 'c1' }],
      });

      await expect(service.submitEvaluation('eval-1', 'judge-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});