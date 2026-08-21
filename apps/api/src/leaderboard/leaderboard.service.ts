import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EvaluationStatus,
  EventStatus,
  LeaderboardStatus,
  Role,
  SubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RankedSubmission } from './leaderboard.types';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(eventId: string, adminId: string) {
    await this.assertAdmin(adminId);

    const event = await this.getEvent(eventId);

    if (
      event.status === EventStatus.DRAFT ||
      event.status === EventStatus.REGISTRATION_OPEN
    ) {
      throw new ConflictException('Leaderboard is unavailable before judging');
    }

    return this.calculateRanking(eventId);
  }

  async recalculate(eventId: string, adminId: string) {
    await this.assertAdmin(adminId);

    const event = await this.getEvent(eventId);

    if (
      event.status !== EventStatus.JUDGING &&
      event.status !== EventStatus.LEADERBOARD_FROZEN
    ) {
      throw new ConflictException(
        'Leaderboard can only be recalculated during judging or freeze',
      );
    }

    if (event.status === EventStatus.LEADERBOARD_FROZEN) {
      const existing = await this.prisma.leaderboardSnapshot.findUnique({
        where: { eventId },
      });

      if (existing?.status === LeaderboardStatus.FROZEN) {
        throw new ConflictException('Frozen leaderboard cannot be recalculated');
      }
    }

    const ranking = await this.calculateRanking(eventId);

    return this.prisma.$transaction(async (transaction) => {
      const snapshot = await transaction.leaderboardSnapshot.upsert({
        where: { eventId },
        create: {
          eventId,
          generatedById: adminId,
          generatedAt: new Date(),
          status: LeaderboardStatus.DRAFT,
        },
        update: {
          generatedById: adminId,
          generatedAt: new Date(),
          status: LeaderboardStatus.DRAFT,
          frozenAt: null,
          publishedAt: null,
        },
      });

      await transaction.leaderboardEntry.deleteMany({
        where: { snapshotId: snapshot.id },
      });

      if (ranking.length > 0) {
        await transaction.leaderboardEntry.createMany({
          data: ranking.map((entry, index) => ({
            snapshotId: snapshot.id,
            submissionId: entry.submissionId,
            rank: index + 1,
            averageScore: entry.averageScore.toFixed(2),
            innovationScore: entry.innovationScore?.toFixed(2),
            usabilityScore: entry.usabilityScore?.toFixed(2),
            submittedAt: entry.submittedAt,
            isWinner: index < event.winnerCount,
            isFinalist: index < event.finalistCount,
          })),
        });
      }

      return transaction.leaderboardSnapshot.findUniqueOrThrow({
        where: { id: snapshot.id },
        include: {
          entries: { orderBy: { rank: 'asc' } },
        },
      });
    });
  }

  async freeze(eventId: string, adminId: string) {
    await this.assertAdmin(adminId);

    const event = await this.getEvent(eventId);

    if (event.status !== EventStatus.LEADERBOARD_FROZEN) {
      throw new ConflictException('Event must be in LEADERBOARD_FROZEN state');
    }

    const snapshot = await this.prisma.leaderboardSnapshot.findUnique({
      where: { eventId },
      include: { entries: true },
    });

    if (!snapshot || snapshot.entries.length === 0) {
      throw new ConflictException('Calculate leaderboard before freezing');
    }

    if (snapshot.status === LeaderboardStatus.FROZEN) {
      throw new ConflictException('Leaderboard is already frozen');
    }

    return this.prisma.leaderboardSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: LeaderboardStatus.FROZEN,
        frozenAt: new Date(),
      },
      include: {
        entries: { orderBy: { rank: 'asc' } },
      },
    });
  }

  async revealWinners(eventId: string, adminId: string) {
    await this.assertAdmin(adminId);

    const event = await this.getEvent(eventId);

    if (event.status !== EventStatus.WINNERS_REVEALED) {
      throw new ConflictException('Event must be in WINNERS_REVEALED state');
    }

    const snapshot = await this.prisma.leaderboardSnapshot.findUnique({
      where: { eventId },
    });

    if (!snapshot || snapshot.status !== LeaderboardStatus.FROZEN) {
      throw new ConflictException('A frozen leaderboard is required');
    }

    return this.prisma.leaderboardSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: LeaderboardStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      include: {
        entries: { orderBy: { rank: 'asc' } },
      },
    });
  }

  async getPublic(eventId: string) {
    const event = await this.getEvent(eventId);

    if (
      event.status !== EventStatus.WINNERS_REVEALED &&
      event.status !== EventStatus.COMPLETED
    ) {
      throw new NotFoundException('Results are not public yet');
    }

    const snapshot = await this.prisma.leaderboardSnapshot.findUnique({
      where: { eventId },
      include: {
        entries: {
          orderBy: { rank: 'asc' },
          include: {
            submission: {
              select: { id: true, title: true },
            },
          },
        },
      },
    });

    if (!snapshot || snapshot.status !== LeaderboardStatus.PUBLISHED) {
      throw new NotFoundException('Published results not found');
    }

    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
      },
      publishedAt: snapshot.publishedAt,
      entries: snapshot.entries.map((entry) => ({
        rank: entry.rank,
        submission: entry.submission,
        averageScore: entry.averageScore,
        isWinner: entry.isWinner,
        isFinalist: entry.isFinalist,
      })),
    };
  }

  private async calculateRanking(eventId: string): Promise<RankedSubmission[]> {
    const submissions = await this.prisma.submission.findMany({
      where: {
        eventId,
        status: {
          in: [
            SubmissionStatus.SUBMITTED,
            SubmissionStatus.LOCKED,
            SubmissionStatus.FINALIST,
            SubmissionStatus.WINNER,
          ],
        },
        evaluations: {
          some: { status: EvaluationStatus.SUBMITTED },
        },
      },
      include: {
        evaluations: {
          where: { status: EvaluationStatus.SUBMITTED },
          include: {
            scores: {
              include: { criterion: true },
            },
          },
        },
      },
    });

    const ranking: RankedSubmission[] = submissions.map((submission) => {
      const scores = submission.evaluations.map((evaluation) =>
        Number(evaluation.totalScore),
      );

      const averageScore = this.average(scores);

      const innovationScores = submission.evaluations.flatMap((evaluation) =>
        evaluation.scores
          .filter((score) => score.criterion.name === 'Innovation')
          .map(
            (score) =>
              (Number(score.score) / Number(score.criterion.maxScore)) *
              Number(score.criterion.weight),
          ),
      );

      const usabilityScores = submission.evaluations.flatMap((evaluation) =>
        evaluation.scores
          .filter((score) => score.criterion.name === 'Usability')
          .map(
            (score) =>
              (Number(score.score) / Number(score.criterion.maxScore)) *
              Number(score.criterion.weight),
          ),
      );

      return {
        submissionId: submission.id,
        averageScore,
        innovationScore: innovationScores.length
          ? this.average(innovationScores)
          : null,
        usabilityScore: usabilityScores.length
          ? this.average(usabilityScores)
          : null,
        submittedAt: submission.submittedAt,
      };
    });

    return ranking.sort((a, b) => {
      const scoreDifference = b.averageScore - a.averageScore;
      if (Math.abs(scoreDifference) > 0.001) return scoreDifference;

      const innovationDifference =
        (b.innovationScore ?? -1) - (a.innovationScore ?? -1);
      if (Math.abs(innovationDifference) > 0.001) return innovationDifference;

      const usabilityDifference =
        (b.usabilityScore ?? -1) - (a.usabilityScore ?? -1);
      if (Math.abs(usabilityDifference) > 0.001) return usabilityDifference;

      const firstDate = a.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const secondDate = b.submittedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (firstDate !== secondDate) return firstDate - secondDate;

      return a.submissionId.localeCompare(b.submissionId);
    });
  }

  private average(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private async getEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  private async assertAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (
      !user ||
      !user.isActive ||
      (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN)
    ) {
      throw new ForbiddenException('Admin permission required');
    }
  }
}