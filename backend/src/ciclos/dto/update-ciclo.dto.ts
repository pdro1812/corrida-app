import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateCicloDto } from './create-ciclo.dto';

const STATUS_VALIDOS = ['ativo', 'concluido', 'cancelado'] as const;

export class UpdateCicloDto extends PartialType(CreateCicloDto) {
  @IsOptional()
  @IsIn(STATUS_VALIDOS)
  status?: (typeof STATUS_VALIDOS)[number];
}
