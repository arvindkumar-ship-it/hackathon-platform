import { Injectable } from '@nestjs/common';
import { AssetScanInput, AssetScanner, AssetScanResult } from './scanner.interface';

// A missing scanner cannot establish that an upload is safe.
// Replace this provider with a real scanner to enable acceptance.
@Injectable()
export class NoopScannerProvider implements AssetScanner {
  async scan(_input: AssetScanInput): Promise<AssetScanResult> {
    return { safe: false, reason: 'Content scanner is not configured' };
  }
}
