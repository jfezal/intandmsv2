import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new BadRequestException(`${field}${issue?.message ?? 'Invalid request body.'}`);
  }
  return parsed.data;
}
