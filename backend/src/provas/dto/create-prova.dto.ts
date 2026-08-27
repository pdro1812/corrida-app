import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const TIPOS_VALIDOS = ['alvo', 'secundaria'] as const;

export class CreateProvaDto {
  @IsString()
  nome!: string;

  @IsDateString()
  data!: string;

  @IsOptional()
  @IsIn(TIPOS_VALIDOS)
  tipo?: (typeof TIPOS_VALIDOS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanciaKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  metaTempoSegundos?: number;
}
