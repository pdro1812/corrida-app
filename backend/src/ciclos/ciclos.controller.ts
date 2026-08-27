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
import { CiclosService } from './ciclos.service';
import { CreateCicloDto } from './dto/create-ciclo.dto';
import { UpdateCicloDto } from './dto/update-ciclo.dto';

@Controller('ciclos')
export class CiclosController {
  constructor(private readonly ciclosService: CiclosService) {}

  @Post()
  create(@Body() dto: CreateCicloDto) {
    return this.ciclosService.create(dto);
  }

  @Get()
  findAll(@Query('status') status?: string) {
    return this.ciclosService.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ciclosService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCicloDto) {
    return this.ciclosService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ciclosService.remove(id);
  }
}
