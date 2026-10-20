import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body()
    body: {
      name: string;
      protocol: 'smb' | 'nfs' | 'local';
      host: string;
      exportPath: string;
      mountPath: string;
    },
  ) {
    return this.connectors.create(request.user!, body);
  }
}
