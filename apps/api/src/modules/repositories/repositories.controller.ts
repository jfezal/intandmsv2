import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createRepositoryBodySchema, updateRepositoryBodySchema } from '@intandms/contracts';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { CsrfGuard } from '../../common/csrf.guard';
import { parseBody } from '../../common/parse-body';
import { RepositoriesService } from './repositories.service';

@ApiTags('repositories')
@Controller('repositories')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.repositories.list(request.user!);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.repositories.create(request.user!, parseBody(createRepositoryBodySchema, body));
  }

  @Get(':repositoryId/admin')
  adminDetail(@Req() request: AuthenticatedRequest, @Param('repositoryId', ParseUUIDPipe) repositoryId: string) {
    return this.repositories.adminDetail(request.user!, repositoryId);
  }

  @Patch(':repositoryId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Body() body: unknown,
  ) {
    return this.repositories.update(request.user!, repositoryId, parseBody(updateRepositoryBodySchema, body));
  }

  @Post(':repositoryId/rescan')
  @HttpCode(202)
  rescan(@Req() request: AuthenticatedRequest, @Param('repositoryId', ParseUUIDPipe) repositoryId: string) {
    return this.repositories.requestRescan(request.user!, repositoryId);
  }

  @Get(':repositoryId/access')
  myAccess(
    @Req() request: AuthenticatedRequest,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Query('folderId', new ParseUUIDPipe({ optional: true })) folderId?: string,
  ) {
    return this.repositories.myAccess(request.user!, repositoryId, folderId);
  }

  @Get(':repositoryId/folders')
  listFolders(
    @Req() request: AuthenticatedRequest,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Query('parentId', new ParseUUIDPipe({ optional: true })) parentId?: string,
  ) {
    return this.repositories.listFolders(request.user!, repositoryId, parentId);
  }

  @Post(':repositoryId/folders')
  createFolder(
    @Req() request: AuthenticatedRequest,
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Body() body: { name: string; parentId?: string },
  ) {
    return this.repositories.createFolder(request.user!, repositoryId, body);
  }
}
