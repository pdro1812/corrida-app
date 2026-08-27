import { IsOptional, IsUUID } from 'class-validator';

export class VincularTreinoRealizadoDto {
  // null desvincula (o realizado passa a ser avulso); omitir o campo
  // também é tratado como null pelo controller/service.
  @IsOptional()
  @IsUUID()
  treinoPrevistoId?: string | null;
}
