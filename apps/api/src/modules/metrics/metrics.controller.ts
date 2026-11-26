import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async scrape(@Res({ passthrough: true }) res: Response) {
    res.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    res.header('cache-control', 'no-store');
    return this.metrics.render(this.prisma);
  }
}
