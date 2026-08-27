import { PartialType } from '@nestjs/mapped-types';
import { CreateSemanaDto } from './create-semana.dto';

export class UpdateSemanaDto extends PartialType(CreateSemanaDto) {}
