import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { TeamsModule } from '../teams/teams.module';
import { UploadsModule } from '../uploads/uploads.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [EventsModule, TeamsModule, UploadsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
