import { createHash, randomBytes } from 'node:crypto';

export type SessionTiming = {
  idleSeconds: number;
  absoluteSeconds: number;
};

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function digestSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiry(timing: SessionTiming, from = new Date()): Date {
  return new Date(from.getTime() + timing.absoluteSeconds * 1000);
}
