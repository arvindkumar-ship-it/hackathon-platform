import { Module } from '@nestjs/common';
import { JudgingController } from './judging.controller';
import { JudgingService } from './judging.service';

@Module({
  controllers: [JudgingController],
  providers: [JudgingService]
})
export class JudgingModule {}
