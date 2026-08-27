import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateTreinoRealizadoDto {
  // Vínculo explícito com o treino previsto correspondente — quem
  // registra manualmente já sabe a qual treino da planilha isso se
  // refere, então não tentamos casar por data como no RF15 (Garmin).
  @IsOptional()
  @IsUUID()
  treinoPrevistoId?: string;

  @IsDateString()
  data!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanciaKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  duracaoSegundos?: number;

  @IsOptional()
  @IsString()
  paceMedio?: string;

  @IsOptional()
  @IsInt()
  fcMedia?: number;

  @IsOptional()
  @IsInt()
  fcMax?: number;

  @IsOptional()
  @IsNumber()
  elevacaoM?: number;

  // Feedback estruturado (RF18) — opcional já na criação, mas também
  // pode ser preenchido/editado depois via PATCH .../feedback.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rpe?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sensacoes?: string[];

  @IsOptional()
  @IsString()
  feedbackTexto?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
