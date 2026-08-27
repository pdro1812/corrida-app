import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SemanasService } from './semanas.service';
import { CreateSemanaDto } from './dto/create-semana.dto';
import { UpdateSemanaDto } from './dto/update-semana.dto';

@Controller()
export class SemanasController {
  constructor(private readonly semanasService: SemanasService) {}

  @Post('ciclos/:cicloId/semanas')
  create(@Param('cicloId') cicloId: string, @Body() dto: CreateSemanaDto) {
    return this.semanasService.create(cicloId, dto);
  }

  @Get('ciclos/:cicloId/semanas')
  findAllByCiclo(@Param('cicloId') cicloId: string) {
    return this.semanasService.findAllByCiclo(cicloId);
  }

  @Get('semanas/:id')
  findOne(@Param('id') id: string) {
    return this.semanasService.findOne(id);
  }

  @Patch('semanas/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSemanaDto) {
    return this.semanasService.update(id, dto);
  }

  @Delete('semanas/:id')
  remove(@Param('id') id: string) {
    return this.semanasService.remove(id);
  }
}
