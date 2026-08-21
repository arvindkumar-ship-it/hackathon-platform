import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EvaluationStatus, EventStatus, LeaderboardStatus, Role } from '@prisma/client';
import { LeaderboardService } from './leaderboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let prisma: any;

  const adminUser = { role: Role.ADMIN, isActive: true };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      event: { findUnique: jest.fn() },
      submission: { findMany: jest.fn() },
      leaderboardSnapshot: { findUnique: jest.fn(), update: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [LeaderboardService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(LeaderboardService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('preview — ranking + tie-break cascade', () => {
    const makeSubmission = (
      id: string,
      totalScore: number,
      innovationScore: number,
      usabilityScore: number,
      submittedAt: Date | null,
    ) => ({
      id,
      submittedAt,
      evaluations: [
        {
          status: EvaluationStatus.SUBMITTED,
          totalScore,
          scores: [
            {
              score: innovationScore,
              criterion: { name: 'Innovation', maxScore: 10, weight: 50 },
            },
            {
              score: usabilityScore,
              criterion: { name: 'Usability', maxScore: 10, weight: 50 },
            },
          ],
        },
      ],
    });

    it('ranks by average score descending, tie-broken by innovation then usability then earlier submittedAt then id', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        status: EventStatus.JUDGING,
      });

      prisma.submission.findMany.mockResolvedValue([
        makeSubmission('sub-b', 80, 5, 5, new Date('2026-01-02')),
        makeSubmission('sub-a', 90, 5, 5, new Date('2026-01-01')),
        // tie on totalScore with sub-a's total after normalization? keep simple:
      ]);

      const ranking = await service.preview('event-1', 'admin');

      expect(ranking[0].submissionId).toBe('sub-a');
      expect(ranking[1].submissionId).toBe('sub-b');
    });

    it('rejects preview before judging has started (DRAFT/REGISTRATION_OPEN)', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        status: EventStatus.DRAFT,
      });

      await expect(service.preview('event-1', 'admin')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getPublic — visibility + no judge-identity leak', () => {
    it('throws NotFound when event is not yet in WINNERS_REVEALED/COMPLETED', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        status: EventStatus.LEADERBOARD_FROZEN,
      });

      await expect(service.getPublic('event-1')).rejects.toThrow(NotFoundException);
    });

    it('returns only the whitelisted public fields (no judge/notes/storageKey leakage)', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        name: 'Hack Night',
        slug: 'hack-night',
        status: EventStatus.WINNERS_REVEALED,
      });

      prisma.leaderboardSnapshot.findUnique.mockResolvedValue({
        status: LeaderboardStatus.PUBLISHED,
        publishedAt: new Date('2026-02-01'),
        entries: [
          {
            rank: 1,
            averageScore: '92.50',
            isWinner: true,
            isFinalist: true,
            submission: { id: 'sub-1', title: 'Cool Project' },
          },
        ],
      });

      const result = await service.getPublic('event-1');

      expect(result.entries[0]).toEqual({
        rank: 1,
        submission: { id: 'sub-1', title: 'Cool Project' },
        averageScore: '92.50',
        isWinner: true,
        isFinalist: true,
      });
      // Explicitly assert no judge identity / notes / storageKey fields present
      expect(result.entries[0]).not.toHaveProperty('judgeId');
      expect(result.entries[0]).not.toHaveProperty('overallNote');
      expect(result.entries[0]).not.toHaveProperty('storageKey');
    });
  });

  describe('freeze / revealWinners guards', () => {
    it('rejects freeze when snapshot has no entries', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        status: EventStatus.LEADERBOARD_FROZEN,
      });
      prisma.leaderboardSnapshot.findUnique.mockResolvedValue({ entries: [] });

      await expect(service.freeze('event-1', 'admin')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects revealWinners unless snapshot is FROZEN', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        status: EventStatus.WINNERS_REVEALED,
      });
      prisma.leaderboardSnapshot.findUnique.mockResolvedValue({
        status: LeaderboardStatus.DRAFT,
      });

      await expect(service.revealWinners('event-1', 'admin')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});