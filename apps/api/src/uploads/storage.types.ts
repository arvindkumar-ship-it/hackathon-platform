export type UploadIntentInput = {
  storageKey: string;
  contentType: string;
  contentLength: number;
};

export type SignedUpload = {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
};

export type SignedDownload = {
  downloadUrl: string;
  expiresInSeconds: number;
};
