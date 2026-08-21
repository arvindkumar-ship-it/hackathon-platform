export interface AssetScanResult {
  safe: boolean;
  reason?: string;
}

export interface AssetScanInput {
  storageKey: string;
  mimeType: string;
  fileSize: number;
}

export interface AssetScanner {
  scan(input: AssetScanInput): Promise<AssetScanResult>;
}

export const ASSET_SCANNER = Symbol('ASSET_SCANNER');