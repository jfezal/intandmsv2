import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CsrfService } from './csrf.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const headerToken =
      typeof request.headers['x-csrf-token'] === 'string'
        ? request.headers['x-csrf-token']
        : undefined;
    const cookieToken =
      typeof request.cookies?.intandms_csrf === 'string' ? request.cookies.intandms_csrf : undefined;

    const token = headerToken ?? cookieToken;
    if (!this.csrf.verifyToken(token)) {
      throw new ForbiddenException('CSRF validation failed.');
    }
    return true;
  }
}
