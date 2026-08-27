import { Module } from '@nestjs/common';
import { GarminModule } from '../garmin/garmin.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [GarminModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
