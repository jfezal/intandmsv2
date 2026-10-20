import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CsrfGuard } from '../../common/csrf.guard';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { RetentionService } from './retention.service';

@ApiTags('retention')
@Controller('retention')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get('report/:repositoryId')
  report(@Req() request: AuthenticatedRequest, @Param('repositoryId') repositoryId: string) {
    return this.retention.report(request.user!, repositoryId);
  }

  @Post('holds')
  placeHold(
    @Req() request: AuthenticatedRequest,
    @Body() body: { policyId: string; documentId: string; reason: string },
  ) {
    return this.retention.placeHold(request.user!, body);
  }
}
