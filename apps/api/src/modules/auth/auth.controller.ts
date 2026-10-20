import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { changePasswordBodySchema, loginBodySchema } from '@intandms/contracts';
import { isScopablePermission } from '@intandms/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppEnv } from '../../config/env.schema';
import { CsrfGuard } from '../../common/csrf.guard';
import { CsrfService } from '../../common/csrf.service';
import { parseBody } from '../../common/parse-body';
import { AuthorizationService } from '../authorization/authorization.service';
import { AuthService } from './auth.service';
import { AllowPendingPasswordChange, AuthenticatedRequest, SessionAuthGuard } from './session-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly csrf: CsrfService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get('csrf')
  @ApiOperation({ summary: 'Issue CSRF token (double-submit cookie)' })
  csrfToken(@Res({ passthrough: true }) reply: FastifyReply): { token: string } {
    const token = this.csrf.issueToken();
    void reply.setCookie('intandms_csrf', token, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
    });
    return { token };
  }

  @Get('bootstrap-status')
  @ApiOperation({ summary: 'Whether first administrator bootstrap is still allowed' })
  async bootstrapStatus(): Promise<{ bootstrapOpen: boolean }> {
    return { bootstrapOpen: await this.authService.isBootstrapOpen() };
  }

  @Post('login')
  @UseGuards(CsrfGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Local username/password login' })
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ user: { id: string; login: string; displayName: string; permissions: string[] } }> {
    const parsed = loginBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Invalid login payload.');
    }

    const ip =
      typeof request.ip === 'string'
        ? request.ip
        : typeof request.headers['x-forwarded-for'] === 'string'
          ? request.headers['x-forwarded-for']
          : undefined;

    const result = await this.authService.login(parsed.data, ip);
    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    const secure = this.config.get('NODE_ENV', { infer: true }) === 'production';

    void reply.setCookie(cookieName, result.token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: this.config.get('SESSION_ABSOLUTE_SECONDS', { infer: true }),
    });

    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    const token = request.cookies?.[cookieName];
    await this.authService.logout(token);
    void reply.clearCookie(cookieName, { path: '/' });
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @AllowPendingPasswordChange()
  @ApiOperation({ summary: 'Current authenticated user' })
  async me(@Req() request: AuthenticatedRequest): Promise<{
    id: string;
    login: string;
    displayName: string;
    permissions: string[];
    scopedPermissions: string[];
    mustChangePassword: boolean;
  }> {
    if (!request.user) {
      throw new Error('Authenticated user missing.');
    }
    const grants = await this.authz.grants(request.user);
    const scopedPermissions = [...new Set(grants.flatMap((grant) => grant.permissions).filter(isScopablePermission))].sort();
    return { ...request.user, scopedPermissions };
  }

  @Post('change-password')
  @UseGuards(SessionAuthGuard, CsrfGuard)
  @AllowPendingPasswordChange()
  @HttpCode(204)
  @ApiOperation({ summary: 'Change own password; revokes other sessions' })
  async changePassword(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<void> {
    const input = parseBody(changePasswordBodySchema, body);
    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    await this.authService.changePassword(request.user!.id, request.cookies?.[cookieName], input);
  }
}
