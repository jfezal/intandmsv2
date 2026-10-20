import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { AppEnv } from '../../config/env.schema';
import { AuthService } from './auth.service';

export type AuthenticatedRequest = FastifyRequest & {
  user?: Awaited<ReturnType<AuthService['resolveUserFromToken']>>;
};

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    const token = request.cookies?.[cookieName];
    const user = await this.authService.resolveUserFromToken(token);
    if (!user) {
      throw new UnauthorizedException('Session expired or invalid.');
    }
    request.user = user;
    return true;
  }
}
