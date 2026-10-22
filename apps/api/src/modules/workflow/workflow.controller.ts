import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { decideTaskBodySchema, startReviewBodySchema } from '@intandms/contracts';
import { CsrfGuard } from '../../common/csrf.guard';
import { parseBody } from '../../common/parse-body';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkflowService } from './workflow.service';

@ApiTags('workflow')
@Controller('workflow')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('definitions')
  definitions(@Req() request: AuthenticatedRequest) {
    return this.workflow.listEnabled(request.user!);
  }

  @Get('tasks/mine')
  myTasks(@Req() request: AuthenticatedRequest) {
    return this.workflow.myTasks(request.user!);
  }

  @Get('documents/:documentId/candidates')
  candidates(
    @Req() request: AuthenticatedRequest,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('definitionId', ParseUUIDPipe) definitionId: string,
  ) {
    return this.workflow.candidates(request.user!, documentId, definitionId);
  }

  @Post('documents/:documentId/start-review')
  startReview(
    @Req() request: AuthenticatedRequest,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: unknown,
  ) {
    return this.workflow.startReview(request.user!, documentId, parseBody(startReviewBodySchema, body));
  }

  @Post('tasks/:taskId/decide')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: unknown,
  ) {
    return this.workflow.decideTask(request.user!, taskId, parseBody(decideTaskBodySchema, body));
  }
}
