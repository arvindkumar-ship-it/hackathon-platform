import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { ASSET_SCANNER } from './scanning/scanner.interface';
import { NoopScannerProvider } from './scanning/noop-scanner.provider';

@Module({
  providers: [
    UploadsService,
    NoopScannerProvider,
    {
      provide: ASSET_SCANNER,
      useExisting: NoopScannerProvider,
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}