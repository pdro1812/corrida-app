import { Module } from '@nestjs/common';
import { SemanasController } from './semanas.controller';
import { SemanasService } from './semanas.service';

@Module({
  controllers: [SemanasController],
  providers: [SemanasService],
})
export class SemanasModule {}
