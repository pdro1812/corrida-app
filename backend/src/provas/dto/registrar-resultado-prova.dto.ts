import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RegistrarResultadoProvaDto {
  @IsInt()
  @Min(0)
  resultadoTempoSegundos!: number;

  @IsOptional()
  @IsString()
  resultadoPace?: string;
}
