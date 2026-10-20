import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
@UseGuards(SessionAuthGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  query(
    @Req() request: AuthenticatedRequest,
    @Query('q') q = '',
    @Query('repositoryId') repositoryId?: string,
  ) {
    return this.search.query(request.user!, q, repositoryId);
  }
}
