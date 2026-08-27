import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const TIPOS_VALIDOS = [
  'aquecimento',
  'tiro',
  'recuperacao',
  'desaquecimento',
] as const;

export class CreateTreinoPrevistoIntervaloDto {
  @IsInt()
  @Min(1)
  ordem!: number;

  @IsIn(TIPOS_VALIDOS)
  tipo!: (typeof TIPOS_VALIDOS)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  repeticaoNumero?: number;

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
}
