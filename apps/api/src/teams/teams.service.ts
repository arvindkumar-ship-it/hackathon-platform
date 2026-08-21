import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(eventId: string, userId: string, dto: CreateTeamDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const membership = await this.prisma.eventMember.findFirst({
      where: { eventId, userId, status: 'ACTIVE' },
    });

    if (!membership) {
      throw new ForbiddenException('Must be an active event member to create a team');
    }

    const existingTeam = await this.prisma.team.findFirst({
      where: { eventId, name: dto.name },
    });

    if (existingTeam) {
      throw new ConflictException('Team name already taken in this event');
    }

    return this.prisma.team.create({
      data: {
        eventId,
        name: dto.name,
        members: {
          create: {
            userId,
            role: 'LEADER',
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });
  }

  async listByEvent(eventId: string) {
    return this.prisma.team.findMany({
      where: { eventId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForEvent(eventId: string, userId: string) {
    return this.listByEvent(eventId);
  }

  async getById(teamId: string, userId?: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    return team;
  }

  async update(teamId: string, userId: string, dto: UpdateTeamDto) {
    await this.assertTeamLeader(teamId, userId);

    if (dto.name) {
      const team = await this.getById(teamId);
      const existingTeam = await this.prisma.team.findFirst({
        where: { eventId: team.eventId, name: dto.name },
      });

      if (existingTeam && existingTeam.id !== teamId) {
        throw new ConflictException('Team name already taken in this event');
      }
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });
  }

  async removeMember(teamId: string, memberUserId: string, actorId: string) {
    await this.assertTeamLeader(teamId, actorId);

    const targetMember = await this.prisma.teamMember.findFirst({
      where: { teamId, userId: memberUserId },
    });

    if (!targetMember) {
      throw new NotFoundException('Team member not found');
    }

    if (targetMember.role === 'LEADER' && memberUserId === actorId) {
      throw new ConflictException('Team leader cannot be removed without transferring leadership');
    }

    await this.prisma.teamMember.delete({
      where: { id: targetMember.id },
    });

    return { success: true };
  }

  async assertTeamLeader(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: { teamId, userId, role: 'LEADER' },
    });

    if (!member) {
      throw new ForbiddenException('Team leader permission required');
    }

    return member;
  }
}