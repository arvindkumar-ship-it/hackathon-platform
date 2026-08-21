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
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { UploadsService } from '../uploads/uploads.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { UploadIntentDto } from './dto/upload-intent.dto';
import { SubmissionsService } from './submissions.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SubmissionsController {
  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly uploadsService: UploadsService,
  ) {}

  @Post('events/:eventId/submissions')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  create(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubmissionDto,
  ) {
    return this.submissionsService.create(eventId, user.id, dto);
  }

  @Get('events/:eventId/submissions/me')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  getMine(
    @Param('eventId', UuidParamPipe) eventId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissionsService.getMine(eventId, user.id);
  }

  @Get('submissions/:submissionId')
  getById(
    @Param('submissionId', UuidParamPipe) submissionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissionsService.getById(submissionId, user.id);
  }

  @Patch('submissions/:submissionId')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  update(
    @Param('submissionId', UuidParamPipe) submissionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSubmissionDto,
  ) {
    return this.submissionsService.update(submissionId, user.id, dto);
  }

  @Post('submissions/:submissionId/upload-intent')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createUploadIntent(
    @Param('submissionId', UuidParamPipe) submissionId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadIntentDto,
  ) {
    return this.uploadsService.createUploadIntent(
      submissionId,
      user.id,
      dto.assetType,
      dto.originalName,
      dto.mimeType,
      dto.fileSize,
    );
  }

  @Post('submissions/:submissionId/assets/:assetId/complete')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  completeUpload(
    @Param('submissionId', UuidParamPipe) submissionId: string,
    @Param('assetId', UuidParamPipe) assetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploadsService.completeUpload(submissionId, assetId, user.id);
  }

  @Delete('submissions/:submissionId/assets/:assetId')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  deleteAsset(
    @Param('submissionId', UuidParamPipe) submissionId: string,
    @Param('assetId', UuidParamPipe) assetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploadsService.deleteAsset(submissionId, assetId, user.id);
  }

  @Get('submissions/:submissionId/assets/:assetId/download-url')
  getDownloadUrl(
    @Param('submissionId', UuidParamPipe) submissionId: string,
    @Param('assetId', UuidParamPipe) assetId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.uploadsService.getDownloadUrl(submissionId, assetId, user.id);
  }

  @Post('submissions/:submissionId/submit')
  @UseGuards(RolesGuard)
  @Roles(Role.PARTICIPANT)
  submit(
    @Param('submissionId', UuidParamPipe) submissionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.submissionsService.submit(submissionId, user.id);
  }
}