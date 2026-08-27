import { PartialType } from '@nestjs/mapped-types';
import { CreateTreinoPrevistoDto } from './create-treino-previsto.dto';

export class UpdateTreinoPrevistoDto extends PartialType(
  CreateTreinoPrevistoDto,
) {}
