import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createGrantBodySchema,
  createUserBodySchema,
  resetPasswordBodySchema,
  roleBodySchema,
  setUserRolesBodySchema,
  updateRoleBodySchema,
  updateUserBodySchema,
} from '@intandms/contracts';
import { CsrfGuard } from '../../common/csrf.guard';
import { parseBody } from '../../common/parse-body';
import { AuthenticatedRequest, SessionAuthGuard } from '../auth/session-auth.guard';
import { AdminService } from './admin.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | undefined, name: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!UUID.test(value)) throw new BadRequestException(`${name} must be a UUID.`);
  return value;
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(@Req() request: AuthenticatedRequest) {
    return this.admin.listUsers(request.user!);
  }

  @Post('users')
  createUser(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.admin.createUser(request.user!, parseBody(createUserBodySchema, body));
  }

  @Patch('users/:userId')
  updateUser(
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    return this.admin.updateUser(request.user!, userId, parseBody(updateUserBodySchema, body));
  }

  @Put('users/:userId/roles')
  setUserRoles(
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    return this.admin.setUserRoles(request.user!, userId, parseBody(setUserRolesBodySchema, body).roleIds);
  }

  @Post('users/:userId/reset-password')
  @HttpCode(200)
  resetPassword(
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    return this.admin.resetPassword(request.user!, userId, parseBody(resetPasswordBodySchema, body).password);
  }

  @Post('users/:userId/revoke-sessions')
  @HttpCode(200)
  revokeSessions(@Req() request: AuthenticatedRequest, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.admin.revokeSessions(request.user!, userId);
  }

  @Get('grants')
  listGrants(
    @Req() request: AuthenticatedRequest,
    @Query('userId') userId?: string,
    @Query('repositoryId') repositoryId?: string,
  ) {
    return this.admin.listGrants(request.user!, {
      userId: optionalUuid(userId, 'userId'),
      repositoryId: optionalUuid(repositoryId, 'repositoryId'),
    });
  }

  @Post('grants')
  createGrant(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.admin.createGrant(request.user!, parseBody(createGrantBodySchema, body));
  }

  @Delete('grants/:grantId')
  revokeGrant(@Req() request: AuthenticatedRequest, @Param('grantId', ParseUUIDPipe) grantId: string) {
    return this.admin.revokeGrant(request.user!, grantId);
  }

  @Get('effective-access')
  effectiveAccess(
    @Req() request: AuthenticatedRequest,
    @Query('userId') userId?: string,
    @Query('repositoryId') repositoryId?: string,
    @Query('folderId') folderId?: string,
  ) {
    const user = optionalUuid(userId, 'userId');
    const repository = optionalUuid(repositoryId, 'repositoryId');
    if (!user || !repository) throw new BadRequestException('userId and repositoryId are required.');
    return this.admin.effectiveAccess(request.user!, {
      userId: user,
      repositoryId: repository,
      folderId: optionalUuid(folderId, 'folderId'),
    });
  }

  @Get('permissions')
  listPermissions(@Req() request: AuthenticatedRequest) {
    return this.admin.listPermissions(request.user!);
  }

  @Get('roles')
  listRoles(@Req() request: AuthenticatedRequest) {
    return this.admin.listRoles(request.user!);
  }

  @Post('roles')
  createRole(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.admin.createRole(request.user!, parseBody(roleBodySchema, body));
  }

  @Patch('roles/:roleId')
  updateRole(
    @Req() request: AuthenticatedRequest,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() body: unknown,
  ) {
    return this.admin.updateRole(request.user!, roleId, parseBody(updateRoleBodySchema, body));
  }

  @Delete('roles/:roleId')
  deleteRole(@Req() request: AuthenticatedRequest, @Param('roleId', ParseUUIDPipe) roleId: string) {
    return this.admin.deleteRole(request.user!, roleId);
  }
}
