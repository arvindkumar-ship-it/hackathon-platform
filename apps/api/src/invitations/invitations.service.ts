import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, Role, TeamMemberRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  async create(teamId: string, actorId: string, dto: CreateInvitationDto) {
    await this.teamsService.assertTeamLeader(teamId, actorId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        event: true,
        members: true,
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (team.event.status !== EventStatus.REGISTRATION_OPEN) {
      throw new ConflictException('Invitations are closed');
    }

    if (team.members.length >= team.event.maxTeamSize) {
      throw new ConflictException('Team has reached maximum size');
    }

    const invitedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitedEmail },
    });

    // Policy fix from spec: only PARTICIPANT accounts may join teams —
    // JUDGE/ADMIN/SUPER_ADMIN accounts must be rejected here.
    if (existingUser && existingUser.role !== Role.PARTICIPANT) {
      throw new ConflictException('Only participant accounts can join teams');
    }

    if (existingUser) {
      const existingMembership = await this.prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId,
            userId: existingUser.id,
          },
        },
      });

      if (existingMembership) {
        throw new ConflictException('User is already in this team');
      }
    }

    const existingInvitation = await this.prisma.teamInvitation.findFirst({
      where: {
        teamId,
        invitedEmail,
        status: 'PENDING',
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (existingInvitation) {
      throw new ConflictException('Invitation already exists');
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await this.prisma.teamInvitation.create({
      data: {
        teamId,
        invitedEmail,
        tokenHash,
        expiresAt,
        createdById: actorId,
      },
    });

    return {
      success: true,
      token: rawToken,
      expiresAt,
    };
  }

  async accept(rawToken: string, userId: string) {
    const tokenHash = this.hashToken(rawToken);

    const invitation = await this.prisma.teamInvitation.findUnique({
      where: { tokenHash },
      include: {
        team: {
          include: {
            event: true,
            members: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.status !== 'PENDING' || invitation.expiresAt <= new Date()) {
      throw new ConflictException('Invitation expired or unavailable');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.email.toLowerCase() !== invitation.invitedEmail) {
      throw new ForbiddenException(
        'Invitation email does not match your account',
      );
    }

    if (invitation.team.event.status !== EventStatus.REGISTRATION_OPEN) {
      throw new ConflictException('Registration is closed');
    }

    if (invitation.team.members.length >= invitation.team.event.maxTeamSize) {
      throw new ConflictException('Team has reached maximum size');
    }

    const existingEventTeam = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        team: {
          eventId: invitation.team.eventId,
        },
      },
    });

    if (existingEventTeam) {
      throw new ConflictException(
        'You already belong to a team in this event',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.teamMember.create({
        data: {
          teamId: invitation.teamId,
          userId,
          role: TeamMemberRole.MEMBER,
        },
      });

      await transaction.teamInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

      return {
        success: true,
        teamId: invitation.teamId,
      };
    });
  }

  async listForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.teamInvitation.findMany({
      where: {
        invitedEmail: user.email.toLowerCase(),
        status: 'PENDING',
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            event: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
