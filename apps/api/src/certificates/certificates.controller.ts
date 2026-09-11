import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { CertificatesService } from './certificates.service';

@Controller('certificates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PARTICIPANT)
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('me')
  listMine(@CurrentUser() user: AuthUser) {
    return this.certificatesService.listForUser(user.id);
  }

  // Same design, rendered inline for the catalogue preview (e.g. an <iframe>/<embed>)
  // instead of triggering a browser download.
  @Get(':id/preview')
  async preview(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.certificatesService.generatePreview(id, user.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Get(':id/download')
  async download(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.certificatesService.generatePdf(id, user.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }
}