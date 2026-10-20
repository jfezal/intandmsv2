import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { RepositoriesService } from './repositories.service';

@ApiTags('repositories')
@Controller('repositories')
@UseGuards(SessionAuthGuard)
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.repositories.list(request.user!);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: { name: string; description?: string; rootRelativePath: string },
  ) {
    return this.repositories.createManaged(request.user!, body);
  }

  @Get(':repositoryId/folders')
  listFolders(
    @Req() request: AuthenticatedRequest,
    @Param('repositoryId') repositoryId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.repositories.listFolders(request.user!, repositoryId, parentId);
  }

  @Post(':repositoryId/folders')
  createFolder(
    @Req() request: AuthenticatedRequest,
    @Param('repositoryId') repositoryId: string,
    @Body() body: { name: string; parentId?: string },
  ) {
    return this.repositories.createFolder(request.user!, repositoryId, body);
  }
}
