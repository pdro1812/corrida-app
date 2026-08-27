import { Module } from '@nestjs/common';
import { GarminService } from './garmin.service';

@Module({
  providers: [GarminService],
  exports: [GarminService],
})
export class GarminModule {}
