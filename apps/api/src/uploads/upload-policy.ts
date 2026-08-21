import { AssetType } from '@prisma/client';

export type UploadPolicy = {
  assetType: AssetType;
  mimeTypes: string[];
  extensions: string[];
  maxBytes: number;
};

export const UPLOAD_POLICIES: Record<AssetType, UploadPolicy | null> = {
  PROFILE_PHOTO: {
    assetType: AssetType.PROFILE_PHOTO,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxBytes: 5 * 1024 * 1024,
  },
  SUBMISSION_PDF: {
    assetType: AssetType.SUBMISSION_PDF,
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
    maxBytes: 20 * 1024 * 1024,
  },
  SUBMISSION_PPTX: {
    assetType: AssetType.SUBMISSION_PPTX,
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    extensions: ['.pptx'],
    maxBytes: 50 * 1024 * 1024,
  },
  SCREENSHOT: {
    assetType: AssetType.SCREENSHOT,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxBytes: 5 * 1024 * 1024,
  },
  CERTIFICATE: null,
  WINNER_POSTER: null,
  SIGNATURE: null,
};
