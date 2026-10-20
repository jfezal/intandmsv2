import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../config/env.schema';
import { CsrfGuard } from './csrf.guard';
import { CsrfService } from './csrf.service';

const config = { get: () => 'test-signing-secret-at-least-32-characters' } as unknown as ConfigService<AppEnv, true>;
const service = new CsrfService(config);
const guard = new CsrfGuard(service);

function context(method: string, headers: Record<string, string> = {}, cookies: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers, cookies }) }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  it('allows safe methods without a token', () => {
    expect(guard.canActivate(context('GET'))).toBe(true);
  });

  it('allows a mutation carrying a valid header token', () => {
    expect(guard.canActivate(context('POST', { 'x-csrf-token': service.issueToken() }))).toBe(true);
  });

  it('refuses a mutation that only carries the cookie', () => {
    const token = service.issueToken();
    expect(() => guard.canActivate(context('POST', {}, { intandms_csrf: token }))).toThrow(ForbiddenException);
  });

  it('refuses a forged or truncated signature', () => {
    const [nonce, signature] = service.issueToken().split('.');
    expect(() => guard.canActivate(context('DELETE', { 'x-csrf-token': `${nonce}.${signature!.slice(0, -1)}x` }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context('PATCH', { 'x-csrf-token': `${nonce}.` }))).toThrow(ForbiddenException);
  });
});
