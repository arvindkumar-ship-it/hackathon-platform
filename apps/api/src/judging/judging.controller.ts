import {
  Body,
  Controller,
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
import { AuthUser } from '../auth/types/auth-user.type';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateRubricDto } from './dto/create-rubric.dto';
import { SaveEvaluationDto } from './dto/save-evaluation.dto';
import { UpdateRubricDto } from './dto/update-rubric.dto';
import { JudgingService } from './judging.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class JudgingController {
  constructor(private readonly judgingService: JudgingService) {}

  @Post('admin/events/:eventId/rubric')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createRubric(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRubricDto,
  ) {
    return this.judgingService.createRubric(eventId, user.id, dto);
  }

  @Get('events/:eventId/rubric')
  getRubric(@Param('eventId', UuidParamPipe) eventId: string) {
    return this.judgingService.getRubric(eventId);
  }

  @Patch('admin/rubric/:rubricId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateRubric(
    @Param('rubricId', UuidParamPipe) rubricId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateRubricDto,
  ) {
    return this.judgingService.updateRubric(rubricId, user.id, dto);
  }

  @Post('admin/rubric/:rubricId/publish')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  publishRubric(
    @Param('rubricId', UuidParamPipe) rubricId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.judgingService.publishRubric(rubricId, user.id);
  }

  @Post('admin/events/:eventId/assignments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createAssignment(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.judgingService.createAssignment(eventId, user.id, dto);
  }

  @Get('admin/events/:eventId/assignments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  listAssignments(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.judgingService.listAssignmentsForAdmin(eventId, user.id);
  }

  @Get('judge/assignments')
  @UseGuards(RolesGuard)
  @Roles(Role.JUDGE)
  listJudgeAssignments(@CurrentUser() user: AuthUser) {
    return this.judgingService.listJudgeAssignments(user.id);
  }

  @Get('judge/assignments/:assignmentId/submission')
  @UseGuards(RolesGuard)
  @Roles(Role.JUDGE)
  getJudgeAssignment(
    @Param('assignmentId', UuidParamPipe) assignmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.judgingService.getJudgeAssignment(assignmentId, user.id);
  }

  @Post('judge/assignments/:assignmentId/evaluation')
  @UseGuards(RolesGuard)
  @Roles(Role.JUDGE)
  saveEvaluation(
    @Param('assignmentId', UuidParamPipe) assignmentId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: SaveEvaluationDto,
  ) {
    return this.judgingService.saveEvaluation(assignmentId, user.id, dto);
  }

  @Post('judge/evaluations/:evaluationId/submit')
  @UseGuards(RolesGuard)
  @Roles(Role.JUDGE)
  submitEvaluation(
    @Param('evaluationId', UuidParamPipe) evaluationId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.judgingService.submitEvaluation(evaluationId, user.id);
  }
}