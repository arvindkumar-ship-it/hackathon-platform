import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  EvaluationStatus,
  Prisma,
  Role,
  RubricStatus,
  SubmissionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateRubricDto } from './dto/create-rubric.dto';
import { SaveEvaluationDto } from './dto/save-evaluation.dto';
import { UpdateRubricDto } from './dto/update-rubric.dto';

@Injectable()
export class JudgingService {
  constructor(private readonly prisma: PrismaService) {}

  async createRubric(eventId: string, adminId: string, dto: CreateRubricDto) {
    await this.assertAdmin(adminId);
    this.assertWeights(dto.criteria.map((criterion) => criterion.weight));

    const existing = await this.prisma.rubric.findUnique({
      where: { eventId },
    });

    if (existing) {
      throw new ConflictException('Rubric already exists for this event');
    }

    return this.prisma.rubric.create({
      data: {
        eventId,
        createdById: adminId,
        name: dto.name.trim(),
        description: dto.description.trim(),
        criteria: {
          create: dto.criteria.map((criterion) => ({
            name: criterion.name.trim(),
            description: criterion.description.trim(),
            maxScore: criterion.maxScore,
            weight: criterion.weight,
            sortOrder: criterion.sortOrder,
          })),
        },
      },
      include: {
        criteria: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async getRubric(eventId: string) {
    const rubric = await this.prisma.rubric.findUnique({
      where: { eventId },
      include: {
        criteria: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!rubric) {
      throw new NotFoundException('Rubric not found');
    }

    return rubric;
  }

  async updateRubric(rubricId: string, adminId: string, dto: UpdateRubricDto) {
    await this.assertAdmin(adminId);
    this.assertWeights(dto.criteria.map((criterion) => criterion.weight));

    const rubric = await this.prisma.rubric.findUnique({
      where: { id: rubricId },
    });

    if (!rubric) {
      throw new NotFoundException('Rubric not found');
    }

    if (rubric.status !== RubricStatus.DRAFT) {
      throw new ConflictException('Published rubric cannot be modified');
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.rubricCriterion.deleteMany({
        where: { rubricId },
      });

      return transaction.rubric.update({
        where: { id: rubricId },
        data: {
          name: dto.name.trim(),
          description: dto.description.trim(),
          criteria: {
            create: dto.criteria.map((criterion) => ({
              name: criterion.name.trim(),
              description: criterion.description.trim(),
              maxScore: criterion.maxScore,
              weight: criterion.weight,
              sortOrder: criterion.sortOrder,
            })),
          },
        },
        include: {
          criteria: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }

  async publishRubric(rubricId: string, adminId: string) {
    await this.assertAdmin(adminId);

    const rubric = await this.prisma.rubric.findUnique({
      where: { id: rubricId },
      include: {
        criteria: true,
      },
    });

    if (!rubric) {
      throw new NotFoundException('Rubric not found');
    }

    if (rubric.status !== RubricStatus.DRAFT) {
      throw new ConflictException('Rubric is already published');
    }

    if (rubric.criteria.length === 0) {
      throw new ConflictException('Rubric requires criteria');
    }

    this.assertWeights(
      rubric.criteria.map((criterion) => Number(criterion.weight)),
    );

    return this.prisma.rubric.update({
      where: { id: rubricId },
      data: {
        status: RubricStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      include: {
        criteria: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async createAssignment(eventId: string, adminId: string, dto: CreateAssignmentDto) {
    await this.assertAdmin(adminId);

    const [judge, submission, rubric] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dto.judgeId },
        select: {
          id: true,
          role: true,
          isActive: true,
        },
      }),
      this.prisma.submission.findUnique({
        where: { id: dto.submissionId },
        select: {
          id: true,
          eventId: true,
          status: true,
        },
      }),
      this.prisma.rubric.findUnique({
        where: { eventId },
        select: {
          id: true,
          status: true,
        },
      }),
    ]);

    if (!judge || judge.role !== Role.JUDGE || !judge.isActive) {
      throw new ConflictException('Invalid or inactive judge');
    }

    if (!submission || submission.eventId !== eventId) {
      throw new NotFoundException('Submission not found in this event');
    }

    if (!rubric || rubric.status !== RubricStatus.PUBLISHED) {
      throw new ConflictException('A published rubric is required before assignment');
    }

    try {
      return await this.prisma.judgeAssignment.create({
        data: {
          eventId,
          rubricId: rubric.id,
          judgeId: dto.judgeId,
          submissionId: dto.submissionId,
          assignedById: adminId,
        },
        include: {
          judge: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          submission: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This judge is already assigned to this submission');
      }
      throw error;
    }
  }

  async listAssignmentsForAdmin(eventId: string, adminId: string) {
    await this.assertAdmin(adminId);

    return this.prisma.judgeAssignment.findMany({
      where: { eventId },
      include: {
        judge: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        submission: {
          select: {
            id: true,
            title: true,
            status: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        evaluation: {
          select: {
            id: true,
            status: true,
            totalScore: true,
            submittedAt: true,
          },
        },
      },
      orderBy: {
        assignedAt: 'desc',
      },
    });
  }

  async listJudgeAssignments(judgeId: string) {
    return this.prisma.judgeAssignment.findMany({
      where: {
        judgeId,
        status: {
          not: AssignmentStatus.REVOKED,
        },
      },
      include: {
        submission: {
          select: {
            id: true,
            title: true,
            description: true,
            figmaUrl: true,
            status: true,
            assets: {
              where: {
                status: 'SAFE',
              },
              select: {
                id: true,
                assetType: true,
                originalName: true,
                mimeType: true,
                fileSize: true,
              },
            },
          },
        },
        evaluation: {
          select: {
            id: true,
            status: true,
            totalScore: true,
            submittedAt: true,
          },
        },
      },
      orderBy: {
        assignedAt: 'asc',
      },
    });
  }

  async getJudgeAssignment(assignmentId: string, judgeId: string) {
    const assignment = await this.prisma.judgeAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        event: true,
        rubric: {
          include: {
            criteria: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        submission: {
          include: {
            assets: {
              where: {
                status: 'SAFE',
              },
            },
          },
        },
        evaluation: {
          include: {
            scores: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (assignment.judgeId !== judgeId) {
      throw new ForbiddenException('This submission is not assigned to you');
    }

    if (assignment.status === AssignmentStatus.REVOKED) {
      throw new ForbiddenException('Assignment is revoked');
    }

    return assignment;
  }

  async saveEvaluation(assignmentId: string, judgeId: string, dto: SaveEvaluationDto) {
    const assignment = await this.getJudgeAssignment(assignmentId, judgeId);

    if (
      assignment.event.status === 'LEADERBOARD_FROZEN' ||
      assignment.event.status === 'WINNERS_REVEALED' ||
      assignment.event.status === 'COMPLETED' ||
      assignment.event.status === 'ARCHIVED'
    ) {
      throw new ConflictException('Judging is closed for this event');
    }

    if (assignment.rubric.status !== RubricStatus.PUBLISHED) {
      throw new ConflictException('Rubric is not published');
    }

    if (assignment.status === AssignmentStatus.REVOKED) {
      throw new ForbiddenException('Assignment is revoked');
    }

    if (assignment.evaluation?.status === EvaluationStatus.SUBMITTED) {
      throw new ConflictException('Submitted evaluation cannot be modified');
    }

    const criteria = assignment.rubric.criteria;
    const criterionMap = new Map(criteria.map((criterion) => [criterion.id, criterion]));

    const uniqueIds = new Set(dto.scores.map((entry) => entry.criterionId));
    if (uniqueIds.size !== dto.scores.length) {
      throw new ConflictException('Duplicate criterion scores are not allowed');
    }

    for (const scoreEntry of dto.scores) {
      const criterion = criterionMap.get(scoreEntry.criterionId);

      if (!criterion) {
        throw new ConflictException('Score contains an invalid rubric criterion');
      }

      const maxScore = Number(criterion.maxScore);

      if (scoreEntry.score < 0 || scoreEntry.score > maxScore) {
        throw new ConflictException(
          `Score for ${criterion.name} must be between 0 and ${maxScore}`,
        );
      }
    }

    const totalScore = dto.scores.reduce((total, scoreEntry) => {
      const criterion = criterionMap.get(scoreEntry.criterionId)!;
      const normalized =
        (scoreEntry.score / Number(criterion.maxScore)) * Number(criterion.weight);
      return total + normalized;
    }, 0);

    const evaluation = await this.prisma.evaluation.upsert({
      where: {
        assignmentId,
      },
      create: {
        assignmentId,
        judgeId,
        submissionId: assignment.submissionId,
        totalScore: totalScore.toFixed(2),
        overallNote: dto.overallNote?.trim(),
        scores: {
          create: dto.scores.map((scoreEntry) => ({
            criterionId: scoreEntry.criterionId,
            score: scoreEntry.score,
            note: scoreEntry.note?.trim(),
          })),
        },
      },
      update: {
        totalScore: totalScore.toFixed(2),
        overallNote: dto.overallNote?.trim(),
        scores: {
          deleteMany: {},
          create: dto.scores.map((scoreEntry) => ({
            criterionId: scoreEntry.criterionId,
            score: scoreEntry.score,
            note: scoreEntry.note?.trim(),
          })),
        },
      },
      include: {
        scores: true,
      },
    });

    await this.prisma.judgeAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AssignmentStatus.IN_PROGRESS,
      },
    });

    return evaluation;
  }

  async submitEvaluation(evaluationId: string, judgeId: string) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: {
        assignment: {
          include: {
            event: true,
            rubric: {
              include: {
                criteria: true,
              },
            },
          },
        },
        scores: true,
      },
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    if (
      evaluation.assignment.event.status === 'LEADERBOARD_FROZEN' ||
      evaluation.assignment.event.status === 'WINNERS_REVEALED' ||
      evaluation.assignment.event.status === 'COMPLETED' ||
      evaluation.assignment.event.status === 'ARCHIVED'
    ) {
      throw new ConflictException('Judging is closed for this event');
    }

    if (evaluation.judgeId !== judgeId) {
      throw new ForbiddenException('You cannot submit this evaluation');
    }

    if (evaluation.status === EvaluationStatus.SUBMITTED) {
      throw new ConflictException('Evaluation already submitted');
    }

    const criterionIds = new Set(
      evaluation.assignment.rubric.criteria.map((criterion) => criterion.id),
    );

    const scoredIds = new Set(evaluation.scores.map((score) => score.criterionId));

    if (criterionIds.size !== scoredIds.size) {
      throw new ConflictException('Every rubric criterion must be scored');
    }

    for (const criterionId of criterionIds) {
      if (!scoredIds.has(criterionId)) {
        throw new ConflictException('Every rubric criterion must be scored');
      }
    }

    return this.prisma.$transaction(async (transaction) => {
      const submitted = await transaction.evaluation.update({
        where: { id: evaluationId },
        data: {
          status: EvaluationStatus.SUBMITTED,
          submittedAt: new Date(),
        },
        include: {
          scores: true,
        },
      });

      await transaction.judgeAssignment.update({
        where: { id: evaluation.assignmentId },
        data: {
          status: AssignmentStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      return submitted;
    });
  }

  private assertWeights(weights: number[]) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    if (Math.abs(total - 100) > 0.001) {
      throw new ConflictException(
        `Criterion weights must total 100. Current total: ${total}`,
      );
    }
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