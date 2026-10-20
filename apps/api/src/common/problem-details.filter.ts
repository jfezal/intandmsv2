import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  code?: string;
};

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const requestId =
      typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        detail = response;
        title = response;
      } else if (typeof response === 'object' && response !== null) {
        const body = response as Record<string, unknown>;
        if (typeof body.code === 'string') {
          code = body.code;
        }
        if (typeof body.message === 'string') {
          detail = body.message;
          title = body.message;
        } else if (Array.isArray(body.message) && typeof body.message[0] === 'string') {
          detail = body.message[0];
          title = body.message[0];
        } else if (typeof body.error === 'string') {
          title = body.error;
        }
      }
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title,
      status,
      detail,
      instance: request.url,
      requestId,
      code,
    };

    void reply.status(status).send(problem);
  }
}
