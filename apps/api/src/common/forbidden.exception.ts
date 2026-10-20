import { ForbiddenException } from '@nestjs/common';

export function forbidden(message = 'Forbidden.'): ForbiddenException {
  return new ForbiddenException(message);
}
