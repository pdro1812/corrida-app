import { IsString, MinLength } from 'class-validator';

export class MarcarNaoRealizadoDto {
  @IsString()
  @MinLength(1)
  motivoNaoRealizado!: string;
}
