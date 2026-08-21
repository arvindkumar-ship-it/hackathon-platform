import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  AssetStatus,
  AssetType,
  Role,
  SubmissionStatus,
} from '@prisma/client';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOAD_POLICIES } from './upload-policy';
import { SignedDownload, SignedUpload } from './storage.types';
import { ASSET_SCANNER } from './scanning/scanner.interface';
import type { AssetScanner } from './scanning/scanner.interface';

@Injectable()
export class UploadsService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly uploadTtl: number;
  private readonly downloadTtl: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(ASSET_SCANNER) private readonly scanner: AssetScanner,
  ) {
    const endpoint = this.config.get<string>('STORAGE_ENDPOINT');

    this.s3 = new S3Client({
      region: this.config.get<string>('STORAGE_REGION', 'us-east-1'),
      endpoint: endpoint || undefined,
      forcePathStyle:
        this.config.get<string>('STORAGE_FORCE_PATH_STYLE', 'false') ===
        'true',
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('STORAGE_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('STORAGE_SECRET_KEY'),
      },
    });

    this.bucket = this.config.getOrThrow<string>('STORAGE_BUCKET');
    this.uploadTtl = this.config.get<number>('UPLOAD_INTENT_TTL_SECONDS', 600);
    this.downloadTtl = this.config.get<number>(
      'DOWNLOAD_URL_TTL_SECONDS',
      300,
    );
  }

  async createUploadIntent(
    submissionId: string,
    userId: string,
    assetType: AssetType,
    originalName: string,
    mimeType: string,
    fileSize: number,
  ): Promise<SignedUpload & { assetId: string }> {
    const submission = await this.getSubmissionForOwner(
      submissionId,
      userId,
      { requireLeader: true },
    );

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new ForbiddenException(
        'Assets cannot be changed after submission lock',
      );
    }

    const policy = UPLOAD_POLICIES[assetType];

    if (!policy) {
      throw new BadRequestException(
        'This asset type cannot be uploaded by participants',
      );
    }

    const normalizedName = originalName.trim().toLowerCase();
    const extension = extname(normalizedName);

    if (!policy.extensions.includes(extension)) {
      throw new BadRequestException('File extension is not allowed');
    }

    if (!policy.mimeTypes.includes(mimeType.toLowerCase())) {
      throw new BadRequestException('File MIME type is not allowed');
    }

    if (!Number.isInteger(fileSize) || fileSize <= 0) {
      throw new BadRequestException('Invalid file size');
    }

    if (fileSize > policy.maxBytes) {
      throw new BadRequestException(
        `File exceeds maximum size of ${policy.maxBytes} bytes`,
      );
    }

    const storageKey = [
      'events',
      submission.eventId,
      'submissions',
      submissionId,
      `${randomUUID()}${extension}`,
    ].join('/');

    const asset = await this.prisma.submissionAsset.create({
      data: {
        submissionId,
        assetType,
        storageKey,
        originalName: originalName.slice(0, 255),
        safeName: `${randomUUID()}${extension}`,
        extension,
        mimeType: mimeType.toLowerCase(),
        fileSize,
        status: AssetStatus.PENDING,
      },
    });

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType.toLowerCase(),
      ContentLength: fileSize,
      Metadata: {
        assetId: asset.id,
        submissionId,
      },
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.uploadTtl,
    });

    return {
      assetId: asset.id,
      uploadUrl,
      storageKey,
      expiresInSeconds: this.uploadTtl,
    };
  }

  async completeUpload(submissionId: string, assetId: string, userId: string) {
    const submission = await this.getSubmissionForOwner(
      submissionId,
      userId,
      { requireLeader: true },
    );

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new ForbiddenException('Submission is no longer editable');
    }

    const asset = await this.prisma.submissionAsset.findFirst({
      where: {
        id: assetId,
        submissionId,
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const head = await this.s3.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: asset.storageKey,
      }),
    );

    if (!head.ContentLength || head.ContentLength !== asset.fileSize) {
      await this.markRejected(asset.id);

      throw new BadRequestException(
        'Uploaded file size does not match declared size',
      );
    }

    if (head.ContentType && head.ContentType.toLowerCase() !== asset.mimeType) {
      await this.markRejected(asset.id);

      throw new BadRequestException(
        'Uploaded file type does not match declared type',
      );
    }

    // Pluggable scan step: PENDING (head-check passed) -> SCANNING -> SAFE/REJECTED.
    // Currently backed by a no-op stub scanner (see scanning/noop-scanner.provider.ts).
    await this.prisma.submissionAsset.update({
      where: { id: asset.id },
      data: { status: AssetStatus.SCANNING },
    });

    const scanResult = await this.scanner.scan({
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
    });

    if (!scanResult.safe) {
      await this.markRejected(asset.id);

      throw new BadRequestException(
        scanResult.reason || 'Uploaded file failed content scan',
      );
    }

    const updated = await this.prisma.submissionAsset.update({
      where: { id: asset.id },
      data: {
        status: AssetStatus.SAFE,
        uploadedAt: new Date(),
      },
    });

    return updated;
  }

  async deleteAsset(submissionId: string, assetId: string, userId: string) {
    const submission = await this.getSubmissionForOwner(
      submissionId,
      userId,
      { requireLeader: true },
    );

    if (submission.status !== SubmissionStatus.DRAFT) {
      throw new ForbiddenException('Submission is no longer editable');
    }

    const asset = await this.prisma.submissionAsset.findFirst({
      where: {
        id: assetId,
        submissionId,
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: asset.storageKey,
      }),
    );

    await this.prisma.submissionAsset.update({
      where: { id: asset.id },
      data: {
        status: AssetStatus.DELETED,
      },
    });

    return {
      success: true,
    };
  }

  async getDownloadUrl(
    submissionId: string,
    assetId: string,
    userId: string,
  ): Promise<SignedDownload> {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const isTeamMember = submission.team.members.some(
      (member) => member.userId === userId,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isAdmin =
      user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;

    if (!isTeamMember && !isAdmin) {
      throw new ForbiddenException('You cannot access this asset');
    }

    const asset = await this.prisma.submissionAsset.findFirst({
      where: {
        id: assetId,
        submissionId,
        status: AssetStatus.SAFE,
      },
    });

    if (!asset) {
      throw new NotFoundException('Safe asset not found');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: asset.storageKey,
      ResponseContentDisposition: `attachment; filename="${asset.safeName}"`,
      ResponseContentType: asset.mimeType,
    });

    const downloadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.downloadTtl,
    });

    return {
      downloadUrl,
      expiresInSeconds: this.downloadTtl,
    };
  }

  private async getSubmissionForOwner(
    submissionId: string,
    userId: string,
    options?: { requireLeader?: boolean },
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const membership = submission.team.members.find(
      (member) => member.userId === userId,
    );

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this submission team',
      );
    }

    if (options?.requireLeader && membership.role !== 'LEADER') {
      throw new ForbiddenException(
        'Only team leader can manage submission assets',
      );
    }

    return submission;
  }

  private async markRejected(assetId: string) {
    await this.prisma.submissionAsset.update({
      where: { id: assetId },
      data: {
        status: AssetStatus.REJECTED,
      },
    });
  }
}