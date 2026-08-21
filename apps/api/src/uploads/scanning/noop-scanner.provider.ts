import { Injectable } from '@nestjs/common';
import { AssetScanInput, AssetScanner, AssetScanResult } from './scanner.interface';

// Stub scanner: always marks content as safe. This exists so the
// PENDING -> SCANNING -> SAFE/REJECTED state machine is real and wired,
// even though no actual malware scanning engine is connected yet.
// Swap this provider for a real one (e.g. ClamAV-backed) later without
// touching UploadsService.
@Injectable()
export class NoopScannerProvider implements AssetScanner {
  async scan(_input: AssetScanInput): Promise<AssetScanResult> {
    return { safe: true };
  }
}