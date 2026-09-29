import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Post,
    UseGuards,
    Version,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CheckRateLimitGuard } from '../../common/guards/check-rate-limit.guard';
import { CheckService } from './check.service';
import { CheckRequestDto } from './dto/check-request.dto';
import { CheckResponseDto } from './dto/check-response.dto';
import { PendingCheckRequestDto } from './dto/pending-check-request.dto';

@ApiTags('check')
@Controller('check')
@UseGuards(CheckRateLimitGuard)
export class CheckController {
    constructor(private readonly checkService: CheckService) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @Version('1')
    @ApiOperation({ summary: 'Check hardware compatibility for a game' })
    @ApiOkResponse({ type: CheckResponseDto })
    async checkCompatibility(
        @Body() dto: CheckRequestDto,
    ): Promise<CheckResponseDto> {
        return this.checkService.checkCompatibility(dto);
    }

    @Post('pending/:gameId')
    @HttpCode(HttpStatus.OK)
    @Version('2')
    @ApiOperation({ summary: 'Check a pending game by internal ID' })
    @ApiOkResponse({ type: CheckResponseDto })
    async checkPendingCompatibility(
        @Param('gameId', ParseIntPipe) gameId: number,
        @Body() dto: PendingCheckRequestDto,
    ): Promise<CheckResponseDto> {
        return this.checkService.checkPendingCompatibility(gameId, dto);
    }
}
