import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';

@Controller()
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('ciclos/:cicloId/import-planilha')
  @UseInterceptors(FileInterceptor('file'))
  importarPlanilha(
    @Param('cicloId') cicloId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Envie o CSV como multipart/form-data no campo "file"',
      );
    }
    return this.importService.importarPlanilhaCsv(
      cicloId,
      file.buffer.toString('utf-8'),
      file.originalname,
    );
  }

  @Get('ciclos/:cicloId/importacoes')
  listar(@Param('cicloId') cicloId: string) {
    return this.importService.listarPorCiclo(cicloId);
  }

  @Delete('importacoes/:id')
  remover(@Param('id') id: string) {
    return this.importService.remover(id);
  }
}
