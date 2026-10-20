import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.schema';

@Injectable()
export class CsrfService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  issueToken(): string {
    const nonce = randomBytes(18).toString('base64url');
    const signature = this.sign(nonce);
    return `${nonce}.${signature}`;
  }

  verifyToken(token: string | undefined): boolean {
    if (!token) {
      return false;
    }
    const [nonce, signature] = token.split('.');
    if (!nonce || !signature) {
      return false;
    }
    const expected = Buffer.from(this.sign(nonce));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private sign(nonce: string): string {
    const secret = this.config.get('SESSION_SIGNING_SECRET', { infer: true });
    return createHmac('sha256', secret).update(nonce).digest('base64url');
  }
}
