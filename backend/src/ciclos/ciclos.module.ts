import { Module } from '@nestjs/common';
import { CiclosController } from './ciclos.controller';
import { CiclosService } from './ciclos.service';

@Module({
  controllers: [CiclosController],
  providers: [CiclosService],
})
export class CiclosModule {}
