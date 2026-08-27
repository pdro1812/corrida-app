import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class RegistrarFeedbackDto {
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
}
