import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSemanaDto {
  @IsInt()
  @Min(1)
  numeroSemana!: number;

  @IsDateString()
  dataInicio!: string;

  @IsDateString()
  dataFim!: string;

  @IsOptional()
  @IsString()
  fase?: string;

  @IsOptional()
  @IsString()
  rotinaExtra?: string;
}
