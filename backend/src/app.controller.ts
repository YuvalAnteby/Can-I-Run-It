import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';

@ApiTags('app')
@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    @ApiOperation({ summary: 'Returns a welcome message' })
    @ApiOkResponse({ description: 'The welcome message', type: String })
    getHello(): string {
        return this.appService.getHello();
    }
}
