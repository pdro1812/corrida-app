import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TreinosService } from './treinos.service';
import { CreateTreinoPrevistoDto } from './dto/create-treino-previsto.dto';
import { UpdateTreinoPrevistoDto } from './dto/update-treino-previsto.dto';
import { MarcarNaoRealizadoDto } from './dto/marcar-nao-realizado.dto';

@Controller()
export class TreinosController {
  constructor(private readonly treinosService: TreinosService) {}

  @Post('semanas/:semanaId/treinos')
  create(
    @Param('semanaId') semanaId: string,
    @Body() dto: CreateTreinoPrevistoDto,
  ) {
    return this.treinosService.create(semanaId, dto);
  }

  @Get('semanas/:semanaId/treinos')
  findAllBySemana(@Param('semanaId') semanaId: string) {
    return this.treinosService.findAllBySemana(semanaId);
  }

  // Precisa vir antes de 'treinos/:id' pra não ser interpretado como id.
  @Get('treinos/candidatos-vinculo')
  buscarCandidatosVinculo(
    @Query('data') data: string,
    @Query('dias') dias?: string,
  ) {
    return this.treinosService.buscarCandidatosVinculo(
      data,
      dias ? Number(dias) : 7,
    );
  }

  @Get('treinos/:id')
  findOne(@Param('id') id: string) {
    return this.treinosService.findOne(id);
  }

  @Patch('treinos/:id')
  update(@Param('id') id: string, @Body() dto: UpdateTreinoPrevistoDto) {
    return this.treinosService.update(id, dto);
  }

  @Patch('treinos/:id/nao-realizado')
  marcarNaoRealizado(
    @Param('id') id: string,
    @Body() dto: MarcarNaoRealizadoDto,
  ) {
    return this.treinosService.marcarNaoRealizado(id, dto);
  }

  @Delete('treinos/:id')
  remove(@Param('id') id: string) {
    return this.treinosService.remove(id);
  }
}
