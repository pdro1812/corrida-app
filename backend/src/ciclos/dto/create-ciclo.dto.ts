import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// A prova alvo é criada junto com o ciclo (Prova tipo='alvo') — ver
// CiclosService.create e docs/DATA_MODEL.md.
export class CreateCicloDto {
  @IsString()
  nome!: string;

  @IsDateString()
  dataInicio!: string;

  @IsDateString()
  dataFim!: string;

  @IsString()
  provaNome!: string;

  @IsDateString()
  provaData!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  provaDistanciaKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  provaMetaTempoSegundos?: number;
}
