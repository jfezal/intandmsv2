import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CsrfGuard } from '../../common/csrf.guard';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { ConnectorsService } from './connectors.service';

@ApiTags('connectors')
@Controller('connectors')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.connectors.list(request.user!);
  }

  @Post(':connectorId/health-check')
  health(@Req() request: AuthenticatedRequest, @Param('connectorId') connectorId: string) {
    return this.connectors.healthCheck(request.user!, connectorId);
  }

  @Post(':connectorId/connect-test')
  connectTest(@Req() request: AuthenticatedRequest, @Param('connectorId') connectorId: string) {
    return this.connectors.connectTest(request.user!, connectorId);
  }

  @Post(':connectorId/credentials')
  credentials(
    @Req() request: AuthenticatedRequest,
    @Param('connectorId') connectorId: string,
    @Body() body: { username: string; password: string },
  ) {
    return this.connectors.setCredentials(request.user!, connectorId, body);
  }

  @Post(':connectorId/mount')
  mount(@Req() request: AuthenticatedRequest, @Param('connectorId') connectorId: string) {
    return this.connectors.applyMount(request.user!, connectorId);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      name: string;
      protocol: 'smb' | 'nfs' | 'local';
      host: string;
      exportPath: string;
      mountPath?: string;
      smbUsername?: string;
    },
  ) {
    return this.connectors.create(request.user!, body);
  }
}
