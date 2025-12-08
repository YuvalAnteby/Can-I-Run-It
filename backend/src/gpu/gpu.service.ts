import { Injectable } from '@nestjs/common';
import { CreateGpuDto } from './dto/create-gpu.dto';
import { UpdateGpuDto } from './dto/update-gpu.dto';

@Injectable()
export class GpuService {
    create(createGpuDto: CreateGpuDto) {
        return 'This action adds a new gpu';
    }

    findAll() {
        return `This action returns all gpu`;
    }

    findOne(id: number) {
        return `This action returns a #${id} gpu`;
    }

    update(id: number, updateGpuDto: UpdateGpuDto) {
        return `This action updates a #${id} gpu`;
    }

    remove(id: number) {
        return `This action removes a #${id} gpu`;
    }
}
