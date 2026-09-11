import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { SubmissionStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

// Fixed UI Verse certificate template. Exact pixel size of the source image —
// keep the PDF page the same size so the background is drawn 1:1, no scaling artifacts.
const TEMPLATE_PATH = join(process.cwd(), 'assets', 'certificates', 'uiverse-template.png');
const TEMPLATE_WIDTH = 983;
const TEMPLATE_HEIGHT = 696;

// Where the recipient's name sits, centered on the blank line under
// "PROUDLY PRESENTED TO". Tweak NAME_Y after checking /certificates/:id/preview.
const NAME_Y = 330;
const NAME_FONT_SIZE = 26;

const ELIGIBLE_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.LOCKED,
  SubmissionStatus.FINALIST,
  SubmissionStatus.WINNER,
];

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  // Ensures a Certificate row exists for every event the user has an
  // eligible (submitted+) submission in, then returns them all.
  async listForUser(userId: string) {
    const teamMemberships = await this.prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = teamMemberships.map((t) => t.teamId);

    const submissions = teamIds.length
      ? await this.prisma.submission.findMany({
          where: { teamId: { in: teamIds }, status: { in: ELIGIBLE_STATUSES } },
          select: { eventId: true },
          distinct: ['eventId'],
        })
      : [];

    for (const { eventId } of submissions) {
      const existing = await this.prisma.certificate.findFirst({
        where: { eventId, userId },
      });
      if (!existing) {
        await this.prisma.certificate.create({
          data: { eventId, userId, verificationCode: randomUUID() },
        });
      }
    }

    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      include: { event: { select: { name: true, slug: true } } },
      orderBy: { issuedAt: 'desc' },
    });

    return certificates.map((c) => ({
      id: c.id,
      eventName: c.event.name,
      eventSlug: c.event.slug,
      status: c.status,
      issuedAt: c.issuedAt,
    }));
  }

  private async findOwnCertificate(certificateId: string, userId: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { event: { select: { name: true, slug: true } }, user: { select: { name: true } } },
    });

    if (!certificate) throw new NotFoundException('Certificate not found');
    if (certificate.userId !== userId) throw new ForbiddenException('Not your certificate');

    return certificate;
  }

  // Draws the fixed UI Verse template as a full-bleed background and overlays
  // only the recipient's name — everything else in the design stays exactly
  // as-is, so preview and the downloaded PDF are always pixel-identical.
  private buildPdfBuffer(recipientName: string): Promise<Buffer> {
    const doc = new PDFDocument({
      size: [TEMPLATE_WIDTH, TEMPLATE_HEIGHT],
      margin: 0,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    doc.image(TEMPLATE_PATH, 0, 0, {
      width: TEMPLATE_WIDTH,
      height: TEMPLATE_HEIGHT,
    });

    doc
      .font('Times-Bold')
      .fontSize(NAME_FONT_SIZE)
      .fillColor('#1e293b')
      .text(recipientName, 0, NAME_Y, {
        width: TEMPLATE_WIDTH,
        align: 'center',
      });

    doc.end();

    return new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async generatePdf(certificateId: string, userId: string) {
    const certificate = await this.findOwnCertificate(certificateId, userId);
    const buffer = await this.buildPdfBuffer(certificate.user.name);
    return { buffer, filename: `${certificate.event.slug}-certificate.pdf` };
  }

  async generatePreview(certificateId: string, userId: string) {
    const certificate = await this.findOwnCertificate(certificateId, userId);
    const buffer = await this.buildPdfBuffer(certificate.user.name);
    return { buffer, filename: `${certificate.event.slug}-certificate-preview.pdf` };
  }
}