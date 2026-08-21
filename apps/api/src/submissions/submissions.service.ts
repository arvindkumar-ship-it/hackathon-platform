import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Role, SubmissionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async create(eventId: string, userId: string, dto: CreateSubmissionDto) {
    const event = await this.eventsService.getById(eventId);

    if (
      event.status !== EventStatus.SUBMISSION_OPEN &&
      event.status !== EventStatus.REGISTRATION_OPEN
    ) {
      throw new ConflictException('Submissions are not open');
    }

    if (event.submissionDeadline && event.submissionDeadline <= new Date()) {
      throw new ConflictException('Submission deadline has passed');
    }

    const team = await this.prisma.team.findFirst({
      where: {
        eventId,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        submission: true,
      },
    });

    if (!team) {
      throw new ForbiddenException(
        'You must belong to a team before creating a submission',
      );
    }

    if (team.submission) {
      throw new ConflictException('Your team already has a submission');
    }

    return this.prisma.submission.create({
      data: {
        eventId,
        teamId: team.id,
        createdById: userId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        figmaUrl: dto.figmaUrl?.trim(),
      },
      include: {
        assets: true,
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async getMine(eventId: string, userId: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        eventId,
        members: {
          some: { userId },
        },
      },
      include: {
        submission: {
          include: {
            assets: {
              where: {
                status: {
                  not: 'DELETED',
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new ForbiddenException('You are not part of an event team');
    }

    return team.submission;
  }

  async getById(submissionId: string, userId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        event: true,
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        assets: {
          where: {
            status: {
              not: 'DELETED',
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const isMember = submission.team.members.some(
      (member) => member.userId === userId,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isAdmin = user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;

    if (!isMember && !isAdmin) {
      throw new ForbiddenException('You cannot access this submission');
    }

    return submission;
  }

  async update(submissionId: string, userId: string, dto: UpdateSubmissionDto) {
    const submission = await this.getById(submissionId, userId);

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new ConflictException('Submission is no longer editable');
    }

    // Corrected per spec's own errata: the deadline lives on the related
    // event, not directly on the submission.
    if (
      submission.event.submissionDeadline &&
      submission.event.submissionDeadline <= new Date()
    ) {
      throw new ConflictException('Submission deadline has passed');
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.figmaUrl !== undefined
          ? { figmaUrl: dto.figmaUrl.trim() }
          : {}),
      },
      include: {
        assets: true,
      },
    });
  }

  async submit(submissionId: string, userId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        event: true,
        team: {
          include: {
            members: true,
          },
        },
        assets: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const member = submission.team.members.find(
      (item) => item.userId === userId,
    );

    if (!member) {
      throw new ForbiddenException(
        'You are not a member of this submission team',
      );
    }

    if (member.role !== 'LEADER') {
      throw new ForbiddenException('Only team leader can finalize submission');
    }

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new ConflictException('Submission is already finalized');
    }

    if (submission.event.status !== EventStatus.SUBMISSION_OPEN) {
      throw new ConflictException('Submissions are not currently open');
    }

    if (
      submission.event.submissionDeadline &&
      submission.event.submissionDeadline <= new Date()
    ) {
      throw new ConflictException('Submission deadline has passed');
    }

    const activeAssets = submission.assets.filter(
      (asset) => asset.status !== 'DELETED',
    );

    const hasPresentation = activeAssets.some(
      (asset) =>
        asset.assetType === 'SUBMISSION_PDF' ||
        asset.assetType === 'SUBMISSION_PPTX',
    );

    if (!submission.figmaUrl && !hasPresentation) {
      throw new ConflictException(
        'At least one Figma URL or presentation file is required',
      );
    }

    const hasPendingAsset = activeAssets.some(
      (asset) => asset.status !== 'SAFE',
    );

    if (hasPendingAsset) {
      throw new ConflictException(
        'All uploaded assets must be verified before submission',
      );
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      include: {
        assets: true,
      },
    });
  }

  async lockSubmission(submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (
      submission.status !== SubmissionStatus.SUBMITTED &&
      submission.status !== SubmissionStatus.FINALIST
    ) {
      throw new ConflictException('Only submitted submissions can be locked');
    }

    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.LOCKED,
        lockedAt: new Date(),
      },
    });
  }
}
