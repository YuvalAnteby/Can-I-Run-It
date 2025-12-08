import { Injectable } from '@nestjs/common';
import { CreateCpuDto } from './dto/create-cpu.dto';
import { UpdateCpuDto } from './dto/update-cpu.dto';

@Injectable()
export class CpuService {
    create(createCpuDto: CreateCpuDto) {
        return 'This action adds a new cpu';
    }

    findAll() {
        return `This action returns all cpu`;
    }

    findOne(id: number) {
        return `This action returns a #${id} cpu`;
    }

    update(id: number, updateCpuDto: UpdateCpuDto) {
        return `This action updates a #${id} cpu`;
    }

    remove(id: number) {
        return `This action removes a #${id} cpu`;
    }
}
