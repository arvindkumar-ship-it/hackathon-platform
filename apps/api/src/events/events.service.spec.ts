import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventStatus, Role } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    event: { findUnique: jest.Mock; update: jest.Mock };
    leaderboardSnapshot: { findUnique: jest.Mock };
  };

  const adminUser = { role: Role.ADMIN, isActive: true };
  const nonAdminUser = { role: Role.PARTICIPANT, isActive: true };

  const baseEvent = {
    id: 'event-1',
    status: EventStatus.JUDGING,
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      event: { findUnique: jest.fn(), update: jest.fn() },
      leaderboardSnapshot: { findUnique: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(EventsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('changeStatus', () => {
    it('rejects non-admin actors', async () => {
      prisma.user.findUnique.mockResolvedValue(nonAdminUser);

      await expect(
        service.changeStatus('actor', 'event-1', { status: EventStatus.LEADERBOARD_FROZEN }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a transition not present in EVENT_STATUS_TRANSITIONS', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        status: EventStatus.DRAFT,
      });

      await expect(
        service.changeStatus('admin', 'event-1', { status: EventStatus.WINNERS_REVEALED }),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks freeze without a non-empty leaderboard snapshot', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        status: EventStatus.JUDGING,
      });
      prisma.leaderboardSnapshot.findUnique.mockResolvedValue(null);

      await expect(
        service.changeStatus('admin', 'event-1', {
          status: EventStatus.LEADERBOARD_FROZEN,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows freeze when a non-empty snapshot exists', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        status: EventStatus.JUDGING,
      });
      prisma.leaderboardSnapshot.findUnique.mockResolvedValue({
        entries: [{ id: 'entry-1' }],
      });
      prisma.event.update.mockResolvedValue({
        ...baseEvent,
        status: EventStatus.LEADERBOARD_FROZEN,
      });

      const result = await service.changeStatus('admin', 'event-1', {
        status: EventStatus.LEADERBOARD_FROZEN,
      });

      expect(result.status).toBe(EventStatus.LEADERBOARD_FROZEN);
    });

    it('blocks winner reveal unless snapshot status is FROZEN', async () => {
      prisma.user.findUnique.mockResolvedValue(adminUser);
      prisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        status: EventStatus.LEADERBOARD_FROZEN,
      });
      prisma.leaderboardSnapshot.findUnique.mockResolvedValue({
        status: 'DRAFT',
      });

      await expect(
        service.changeStatus('admin', 'event-1', {
          status: EventStatus.WINNERS_REVEALED,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listPublic / getPublicBySlug', () => {
    it('excludes DRAFT and ARCHIVED from the public list query', async () => {
      prisma.event.findUnique.mockResolvedValue(null); // not used here
      const findManySpy = jest.fn().mockResolvedValue([]);
      (prisma as any).event.findMany = findManySpy;

      await service.listPublic();

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { notIn: [EventStatus.DRAFT, EventStatus.ARCHIVED] },
          },
        }),
      );
    });
  });
});