import { Module } from '@nestjs/common';
import { TreinoRealizadoController } from './treino-realizado.controller';
import { TreinoRealizadoService } from './treino-realizado.service';
import { TreinosController } from './treinos.controller';
import { TreinosService } from './treinos.service';

@Module({
  controllers: [TreinosController, TreinoRealizadoController],
  providers: [TreinosService, TreinoRealizadoService],
})
export class TreinosModule {}
