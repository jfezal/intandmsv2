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

    // Browsers attach the cookie to forged requests automatically; only the custom header proves same-origin script.
    const headerToken =
      typeof request.headers['x-csrf-token'] === 'string'
        ? request.headers['x-csrf-token']
        : undefined;

    if (!this.csrf.verifyToken(headerToken)) {
      throw new ForbiddenException('CSRF validation failed.');
    }
    return true;
  }
}
