import { PartialType } from '@nestjs/mapped-types';
import { CreateCpuDto } from './create-cpu.dto';

export class UpdateCpuDto extends PartialType(CreateCpuDto) {}
