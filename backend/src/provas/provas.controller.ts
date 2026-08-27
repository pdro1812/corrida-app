import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ProvasService } from './provas.service';
import { CreateProvaDto } from './dto/create-prova.dto';
import { RegistrarResultadoProvaDto } from './dto/registrar-resultado-prova.dto';

@Controller()
export class ProvasController {
  constructor(private readonly provasService: ProvasService) {}

  @Post('ciclos/:cicloId/provas')
  create(@Param('cicloId') cicloId: string, @Body() dto: CreateProvaDto) {
    return this.provasService.create(cicloId, dto);
  }

  @Get('ciclos/:cicloId/provas')
  findAllByCiclo(@Param('cicloId') cicloId: string) {
    return this.provasService.findAllByCiclo(cicloId);
  }

  @Patch('provas/:id/resultado')
  registrarResultado(
    @Param('id') id: string,
    @Body() dto: RegistrarResultadoProvaDto,
  ) {
    return this.provasService.registrarResultado(id, dto);
  }

  @Delete('provas/:id')
  remove(@Param('id') id: string) {
    return this.provasService.remove(id);
  }
}
