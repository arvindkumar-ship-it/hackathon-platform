import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetStatus, SubmissionStatus } from '@prisma/client';
import { UploadsService } from './uploads.service';
import { PrismaService } from '../prisma/prisma.service';
import { ASSET_SCANNER } from './scanning/scanner.interface';

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
    PutObjectCommand: jest.fn(),
    HeadObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/upload'),
}));

describe('UploadsService', () => {
  let service: UploadsService;
  let prisma: any;
  let scanner: { scan: jest.Mock };
  let s3Send: jest.Mock;

  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        STORAGE_REGION: 'us-east-1',
        STORAGE_FORCE_PATH_STYLE: 'true',
        UPLOAD_INTENT_TTL_SECONDS: 600,
        DOWNLOAD_URL_TTL_SECONDS: 300,
      };
      return values[key] ?? fallback;
    }),
    getOrThrow: jest.fn((key: string) => `test-${key}`),
  };

  beforeEach(async () => {
    prisma = {
      submissionAsset: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      submission: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    scanner = { scan: jest.fn().mockResolvedValue({ safe: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: ASSET_SCANNER, useValue: scanner },
      ],
    }).compile();

    service = moduleRef.get(UploadsService);
    s3Send = (service as any).s3.send;
  });

  afterEach(() => jest.clearAllMocks());

  const ownerSubmission = {
    id: 'sub-1',
    eventId: 'event-1',
    status: SubmissionStatus.DRAFT,
    team: {
      members: [{ userId: 'user-1', role: 'LEADER' }],
    },
  };

  describe('createUploadIntent — policy validation', () => {
    it('rejects a disallowed asset type', async () => {
      prisma.submission.findUnique.mockResolvedValue(ownerSubmission);

      await expect(
        service.createUploadIntent(
          'sub-1',
          'user-1',
          'CERTIFICATE' as any,
          'file.pdf',
          'application/pdf',
          1000,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a disallowed file extension', async () => {
      prisma.submission.findUnique.mockResolvedValue(ownerSubmission);

      await expect(
        service.createUploadIntent(
          'sub-1',
          'user-1',
          'SUBMISSION_PDF' as any,
          'malware.exe',
          'application/pdf',
          1000,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an oversized file', async () => {
      prisma.submission.findUnique.mockResolvedValue(ownerSubmission);

      await expect(
        service.createUploadIntent(
          'sub-1',
          'user-1',
          'SUBMISSION_PDF' as any,
          'huge.pdf',
          'application/pdf',
          10_000_000_000,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a non-leader team member', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        ...ownerSubmission,
        team: { members: [{ userId: 'user-1', role: 'MEMBER' }] },
      });

      await expect(
        service.createUploadIntent(
          'sub-1',
          'user-1',
          'SUBMISSION_PDF' as any,
          'doc.pdf',
          'application/pdf',
          1000,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects when submission is no longer DRAFT', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        ...ownerSubmission,
        status: SubmissionStatus.SUBMITTED,
      });

      await expect(
        service.createUploadIntent(
          'sub-1',
          'user-1',
          'SUBMISSION_PDF' as any,
          'doc.pdf',
          'application/pdf',
          1000,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('completeUpload — head-check + scan flow', () => {
    const asset = {
      id: 'asset-1',
      storageKey: 'events/event-1/submissions/sub-1/file.pdf',
      fileSize: 1000,
      mimeType: 'application/pdf',
    };

    beforeEach(() => {
      prisma.submission.findUnique.mockResolvedValue(ownerSubmission);
      prisma.submissionAsset.findFirst.mockResolvedValue(asset);
    });

    it('marks REJECTED when uploaded size mismatches declared size', async () => {
      s3Send.mockResolvedValue({ ContentLength: 500, ContentType: 'application/pdf' });
      prisma.submissionAsset.update.mockResolvedValue({});

      await expect(
        service.completeUpload('sub-1', 'asset-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.submissionAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.REJECTED },
      });
    });

    it('marks REJECTED when uploaded content-type mismatches declared type', async () => {
      s3Send.mockResolvedValue({ ContentLength: 1000, ContentType: 'image/png' });
      prisma.submissionAsset.update.mockResolvedValue({});

      await expect(
        service.completeUpload('sub-1', 'asset-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks REJECTED when the scanner reports unsafe content', async () => {
      s3Send.mockResolvedValue({ ContentLength: 1000, ContentType: 'application/pdf' });
      scanner.scan.mockResolvedValue({ safe: false, reason: 'signature match' });
      prisma.submissionAsset.update.mockResolvedValue({});

      await expect(
        service.completeUpload('sub-1', 'asset-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.submissionAsset.update).toHaveBeenLastCalledWith({
        where: { id: 'asset-1' },
        data: { status: AssetStatus.REJECTED },
      });
    });

    it('transitions PENDING -> SCANNING -> SAFE on a clean scan', async () => {
      s3Send.mockResolvedValue({ ContentLength: 1000, ContentType: 'application/pdf' });
      scanner.scan.mockResolvedValue({ safe: true });
      prisma.submissionAsset.update
        .mockResolvedValueOnce({ status: AssetStatus.SCANNING })
        .mockResolvedValueOnce({ status: AssetStatus.SAFE });

      const result = await service.completeUpload('sub-1', 'asset-1', 'user-1');

      expect(prisma.submissionAsset.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'asset-1' },
        data: { status: AssetStatus.SCANNING },
      });
      expect(prisma.submissionAsset.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'asset-1' },
        data: { status: AssetStatus.SAFE, uploadedAt: expect.any(Date) },
      });
      expect(result.status).toBe(AssetStatus.SAFE);
    });
  });
});