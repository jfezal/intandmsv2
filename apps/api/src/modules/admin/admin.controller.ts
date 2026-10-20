import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CsrfGuard } from '../../common/csrf.guard';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(@Req() request: AuthenticatedRequest) {
    return this.admin.listUsers(request.user!);
  }

  @Post('scoped-roles')
  assignScopedRole(
    @Req() request: AuthenticatedRequest,
    @Body() body: { userId: string; roleId: string; repositoryId: string },
  ) {
    return this.admin.assignScopedRole(request.user!, body);
  }
}
