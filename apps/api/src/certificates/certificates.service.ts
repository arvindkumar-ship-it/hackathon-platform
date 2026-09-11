import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SubmissionStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

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

  async generatePdf(certificateId: string, userId: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { event: { select: { name: true, slug: true } }, user: { select: { name: true } } },
    });

    if (!certificate) throw new NotFoundException('Certificate not found');
    if (certificate.userId !== userId) throw new ForbiddenException('Not your certificate');

    const doc = new PDFDocument({ layout: 'landscape', size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    doc
      .fontSize(28)
      .text('Certificate of Participation', { align: 'center' })
      .moveDown(2)
      .fontSize(16)
      .text(`Awarded to`, { align: 'center' })
      .moveDown(0.5)
      .fontSize(22)
      .text(certificate.user.name, { align: 'center' })
      .moveDown(1)
      .fontSize(16)
      .text(`for participation in`, { align: 'center' })
      .moveDown(0.5)
      .fontSize(20)
      .text(certificate.event.name, { align: 'center' })
      .moveDown(2)
      .fontSize(10)
      .text(`Verification code: ${certificate.verificationCode}`, { align: 'center' })
      .text(`Issued: ${certificate.issuedAt.toDateString()}`, { align: 'center' });

    doc.end();

    return new Promise<{ buffer: Buffer; filename: string }>((resolve) => {
      doc.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          filename: `${certificate.event.slug}-certificate.pdf`,
        });
      });
    });
  }
}
