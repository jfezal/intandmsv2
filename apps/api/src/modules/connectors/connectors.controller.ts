import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  connectorCredentialsBodySchema,
  createConnectorBodySchema,
  updateConnectorBodySchema,
} from '@intandms/contracts';
import { CsrfGuard } from '../../common/csrf.guard';
import { parseBody } from '../../common/parse-body';
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
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.connectors.create(request.user!, parseBody(createConnectorBodySchema, body));
  }

  @Patch(':connectorId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('connectorId', ParseUUIDPipe) connectorId: string,
    @Body() body: unknown,
  ) {
    return this.connectors.update(request.user!, connectorId, parseBody(updateConnectorBodySchema, body));
  }

  @Delete(':connectorId')
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedRequest, @Param('connectorId', ParseUUIDPipe) connectorId: string) {
    await this.connectors.remove(request.user!, connectorId);
  }

  @Get('browse-host')
  browseHost(@Req() request: AuthenticatedRequest, @Query('path') folderPath?: string) {
    return this.connectors.browseHost(request.user!, folderPath);
  }

  @Get(':connectorId/browse')
  browse(
    @Req() request: AuthenticatedRequest,
    @Param('connectorId', ParseUUIDPipe) connectorId: string,
    @Query('path') relativePath?: string,
  ) {
    return this.connectors.browse(request.user!, connectorId, relativePath ?? '');
  }

  @Post(':connectorId/health-check')
  @HttpCode(200)
  health(@Req() request: AuthenticatedRequest, @Param('connectorId', ParseUUIDPipe) connectorId: string) {
    return this.connectors.healthCheck(request.user!, connectorId);
  }

  @Post(':connectorId/connect-test')
  @HttpCode(200)
  connectTest(@Req() request: AuthenticatedRequest, @Param('connectorId', ParseUUIDPipe) connectorId: string) {
    return this.connectors.connectTest(request.user!, connectorId);
  }

  @Post(':connectorId/credentials')
  @HttpCode(200)
  credentials(
    @Req() request: AuthenticatedRequest,
    @Param('connectorId', ParseUUIDPipe) connectorId: string,
    @Body() body: unknown,
  ) {
    return this.connectors.setCredentials(request.user!, connectorId, parseBody(connectorCredentialsBodySchema, body));
  }

  @Post(':connectorId/mount')
  @HttpCode(200)
  mount(@Req() request: AuthenticatedRequest, @Param('connectorId', ParseUUIDPipe) connectorId: string) {
    return this.connectors.applyMount(request.user!, connectorId);
  }
}
