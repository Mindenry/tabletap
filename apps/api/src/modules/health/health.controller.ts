import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';

@ApiTags('health')
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  @Public()
  @Get('health')
  live() {
    return {
      status: 'ok',
      service: 'tabletap-api',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
