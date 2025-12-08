import { PartialType } from '@nestjs/mapped-types';
import { CreateGpuDto } from './create-gpu.dto';

export class UpdateGpuDto extends PartialType(CreateGpuDto) {}
