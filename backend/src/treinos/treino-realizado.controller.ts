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
import { TreinoRealizadoService } from './treino-realizado.service';
import { CreateTreinoRealizadoDto } from './dto/create-treino-realizado.dto';
import { RegistrarFeedbackDto } from './dto/registrar-feedback.dto';
import { VincularTreinoRealizadoDto } from './dto/vincular-treino-realizado.dto';

@Controller('treinos-realizados')
export class TreinoRealizadoController {
  constructor(
    private readonly treinoRealizadoService: TreinoRealizadoService,
  ) {}

  @Post()
  create(@Body() dto: CreateTreinoRealizadoDto) {
    return this.treinoRealizadoService.create(dto);
  }

  @Get()
  findAll(@Query('fonte') fonte?: string) {
    return this.treinoRealizadoService.findAll(fonte);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.treinoRealizadoService.findOne(id);
  }

  @Patch(':id/feedback')
  registrarFeedback(
    @Param('id') id: string,
    @Body() dto: RegistrarFeedbackDto,
  ) {
    return this.treinoRealizadoService.registrarFeedback(id, dto);
  }

  @Patch(':id/vincular')
  vincular(@Param('id') id: string, @Body() dto: VincularTreinoRealizadoDto) {
    return this.treinoRealizadoService.vincular(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.treinoRealizadoService.remove(id);
  }
}
