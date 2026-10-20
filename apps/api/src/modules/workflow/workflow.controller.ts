import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CsrfGuard } from '../../common/csrf.guard';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { WorkflowService } from './workflow.service';

@ApiTags('workflow')
@Controller('workflow')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('tasks/mine')
  myTasks(@Req() request: AuthenticatedRequest) {
    return this.workflow.myTasks(request.user!);
  }

  @Post('documents/:documentId/start-review')
  startReview(@Req() request: AuthenticatedRequest, @Param('documentId') documentId: string) {
    return this.workflow.startReview(request.user!, documentId);
  }

  @Post('tasks/:taskId/decide')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('taskId') taskId: string,
    @Body() body: { decision: 'approve' | 'reject'; comment?: string },
  ) {
    return this.workflow.decideTask(request.user!, taskId, body);
  }
}
