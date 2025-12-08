import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
} from '@nestjs/common';
import { GpuService } from './gpu.service';
import { CreateGpuDto } from './dto/create-gpu.dto';
import { UpdateGpuDto } from './dto/update-gpu.dto';

@Controller('gpu')
export class GpuController {
    constructor(private readonly gpuService: GpuService) {}

    @Post()
    create(@Body() createGpuDto: CreateGpuDto) {
        return this.gpuService.create(createGpuDto);
    }

    @Get()
    findAll() {
        return this.gpuService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.gpuService.findOne(+id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateGpuDto: UpdateGpuDto) {
        return this.gpuService.update(+id, updateGpuDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.gpuService.remove(+id);
    }
}
