// import {
//   ConflictException,
//   ForbiddenException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { EventStatus, Role } from '@prisma/client';
// import { EVENT_STATUS_TRANSITIONS } from '../common/constants/event-status-transition';
// import { PrismaService } from '../prisma/prisma.service';
// import { ChangeEventStatusDto } from './dto/change-event-status.dto';
// import { CreateEventDto } from './dto/create-event.dto';
// import { UpdateEventDto } from './dto/update-event.dto';

// @Injectable()
// export class EventsService {
//   constructor(private readonly prisma: PrismaService) {}

//   async create(userId: string, dto: CreateEventDto) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       select: { role: true, isActive: true },
//     });
//     if (!user || !user.isActive || (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN)) {
//       throw new ForbiddenException('Admin permissions required');
//     }
//     return this.prisma.event.create({
//       data: {
//         name: dto.name,
//         slug: dto.slug,
//         description: dto.description,
//         registrationDeadline: dto.registrationDeadline ? new Date(dto.registrationDeadline) : null,
//         submissionDeadline: dto.submissionDeadline ? new Date(dto.submissionDeadline) : null,
//         judgingDeadline: dto.judgingDeadline ? new Date(dto.judgingDeadline) : null,
//       },
//     });
//   }

//   async list() {
//     return this.prisma.event.findMany({
//       orderBy: { createdAt: 'asc' },
//     });
//   }

//   async getById(id: string) {
//     const event = await this.prisma.event.findUnique({
//       where: { id },
//     });
//     if (!event) {
//       throw new NotFoundException('Event not found');
//     }
//     return event;
//   }

//   async update(userId: string, id: string, dto: UpdateEventDto) {
//     const event = await this.getById(id);
//     return this.prisma.event.update({
//       where: { id: event.id },
//       data: {
//         ...(dto.name ? { name: dto.name } : {}),
//         ...(dto.description ? { description: dto.description } : {}),
//       },
//     });
//   }

//   async changeStatus(userId: string, id: string, dto: ChangeEventStatusDto) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: userId },
//       select: { role: true, isActive: true },
//     });
//     if (!user || !user.isActive || (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN)) {
//       throw new ForbiddenException('Admin permissions required');
//     }
//     const event = await this.getById(id);
//     const nextStatus = dto.status;
//     const allowedTransitions = EVENT_STATUS_TRANSITIONS[event.status];
//     if (!allowedTransitions.includes(nextStatus)) {
//       throw new ConflictException(
//         `Cannot transition event from ${event.status} to ${nextStatus}`,
//       );
//     }
//     if (
//       nextStatus === EventStatus.LEADERBOARD_FROZEN &&
//       event.status !== EventStatus.JUDGING
//     ) {
//       throw new ConflictException('Leaderboard can be frozen only after judging');
//     }
//     if (
//       nextStatus === EventStatus.WINNERS_REVEALED &&
//       event.status !== EventStatus.LEADERBOARD_FROZEN
//     ) {
//       throw new ConflictException('Winners can be revealed only after leaderboard freeze');
//     }
//     // Ensure an admin explicitly recalculated the snapshot before allowing freeze.
//     if (nextStatus === EventStatus.LEADERBOARD_FROZEN) {
//       const snapshot = await this.prisma.leaderboardSnapshot.findUnique({
//         where: { eventId: event.id },
//         include: { entries: true },
//       });
//       if (!snapshot || snapshot.entries.length === 0) {
//         throw new ConflictException(
//           'Recalculate the leaderboard before moving to LEADERBOARD_FROZEN',
//         );
//       }
//     }
//     // Ensure the snapshot was actually frozen before allowing winner reveal.
//     if (nextStatus === EventStatus.WINNERS_REVEALED) {
//       const snapshot = await this.prisma.leaderboardSnapshot.findUnique({
//         where: { eventId: event.id },
//       });
//       if (!snapshot || snapshot.status !== 'FROZEN') {
//         throw new ConflictException(
//           'Freeze the leaderboard snapshot before moving to WINNERS_REVEALED',
//         );
//       }
//     }
//     return this.prisma.event.update({
//       where: { id: event.id },
//       data: { status: nextStatus },
//     });
//   }

//   async remove(userId: string, id: string) {
//     const event = await this.getById(id);
//     return this.prisma.event.delete({
//       where: { id: event.id },
//     });
//   }

//   async listPublic() {
//     return this.prisma.event.findMany({
//       where: {
//         status: {
//           notIn: [EventStatus.DRAFT, EventStatus.ARCHIVED],
//         },
//       },
//       select: {
//         id: true,
//         slug: true,
//         name: true,
//         description: true,
//         status: true,
//         registrationDeadline: true,
//         submissionDeadline: true,
//         judgingDeadline: true,
//         finalistCount: true,
//         winnerCount: true,
//       },
//       orderBy: { createdAt: 'asc' },
//     });
//   }

//   async getPublicBySlug(slug: string) {
//     const event = await this.prisma.event.findFirst({
//       where: {
//         slug,
//         status: {
//           notIn: [EventStatus.DRAFT, EventStatus.ARCHIVED],
//         },
//       },
//       select: {
//         id: true,
//         slug: true,
//         name: true,
//         description: true,
//         status: true,
//         registrationDeadline: true,
//         submissionDeadline: true,
//         judgingDeadline: true,
//         finalistCount: true,
//         winnerCount: true,
//       },
//     });
//     if (!event) {
//       throw new NotFoundException('Public event not found');
//     }
//     return event;
//   }

//   async register(eventId: string, userId: string) {
//     const event = await this.getById(eventId);

//     const existing = await this.prisma.eventMember.findFirst({
//       where: { eventId: event.id, userId },
//     });

//     if (existing) {
//       throw new ConflictException('Already registered for this event');
//     }

//     return this.prisma.eventMember.create({
//       data: {
//         eventId: event.id,
//         userId,
//         status: 'ACTIVE',
//       },
//     });
//   }

//   async getMembership(eventId: string, userId: string) {
//     const membership = await this.prisma.eventMember.findFirst({
//       where: { eventId, userId },
//     });

//     if (!membership) {
//       throw new NotFoundException('Not a member of this event');
//     }

//     return membership;
//   }
// }
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ChangeEventStatusDto } from './dto/change-event-status.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.id, dto);
  }

  @Get('events/public')
  listPublic() {
    return this.eventsService.listPublic();
  }

  @Get('events/public/:slug')
  getPublicBySlug(@Param('slug') slug: string) {
    return this.eventsService.getPublicBySlug(slug);
  }

  // NOTE: intentionally no auth guard here -- matches documented gap in
  // docs/authorization-matrix.md (returns ALL events including DRAFT,
  // unauthenticated). Flagged, not fixed, per existing project decision.
  @Get('events')
  list() {
    return this.eventsService.list();
  }

  @Get('events/:id')
  getById(@Param('id') id: string) {
    return this.eventsService.getById(id);
  }

  @Patch('events/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(user.id, id, dto);
  }

  @Patch('events/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ChangeEventStatusDto,
  ) {
    return this.eventsService.changeStatus(user.id, id, dto);
  }

  @Delete('events/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.eventsService.remove(user.id, id);
  }

  @Post('events/:eventId/register')
  @UseGuards(JwtAuthGuard)
  register(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.eventsService.register(eventId, user.id);
  }

  @Get('events/:eventId/membership')
  @UseGuards(JwtAuthGuard)
  getMembership(
    @Param('eventId') eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.eventsService.getMembership(eventId, user.id);
  }
}