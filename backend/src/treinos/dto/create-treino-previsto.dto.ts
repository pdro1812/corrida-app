import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateTreinoPrevistoIntervaloDto } from './create-treino-previsto-intervalo.dto';

const TIPOS_VALIDOS = ['rodagem', 'qualidade', 'longo', 'descanso'] as const;

export class CreateTreinoPrevistoDto {
  @IsString()
  diaSemana!: string;

  @IsDateString()
  data!: string;

  @IsOptional()
  @IsIn(TIPOS_VALIDOS)
  tipo?: (typeof TIPOS_VALIDOS)[number];

  @IsString()
  descricao!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanciaAlvoKm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  duracaoAlvoSegundos?: number;

  @IsOptional()
  @IsString()
  paceAlvoMin?: string;

  @IsOptional()
  @IsString()
  paceAlvoMax?: string;

  // Estrutura do treino intervalado (RF08): aquecimento, tiros, recuperação, desaquecimento.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTreinoPrevistoIntervaloDto)
  intervalos?: CreateTreinoPrevistoIntervaloDto[];
}
