import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { AppEnv } from '../../config/env.schema';
import { AuthService } from './auth.service';

export type AuthenticatedRequest = FastifyRequest & {
  user?: Awaited<ReturnType<AuthService['resolveUserFromToken']>>;
};

const ALLOW_PENDING_PASSWORD_CHANGE = 'intandms:allowPendingPasswordChange';

/** Lets a user whose password must be changed reach this route (session info, logout, change). */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    const token = request.cookies?.[cookieName];
    const user = await this.authService.resolveUserFromToken(token);
    if (!user) {
      throw new UnauthorizedException('Session expired or invalid.');
    }
    if (user.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new ForbiddenException({ message: 'Password change required.', code: 'password_change_required' });
      }
    }
    request.user = user;
    return true;
  }
}
