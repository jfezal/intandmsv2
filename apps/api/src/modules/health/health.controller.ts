import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @ApiOperation({ summary: 'Service and database health' })
  async health(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok' };
    } catch {
      return { status: 'degraded', database: 'error' };
    }
  }
}
