import { describe, expect, it } from 'vitest';
import { canEditMessage, directConversationKey, isActiveMember } from './messaging';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('directConversationKey', () => {
  it('is the same whichever user starts the conversation', () => {
    expect(directConversationKey(A, B)).toBe(directConversationKey(B, A));
  });

  it('ignores letter case in ids', () => {
    expect(directConversationKey(A.toUpperCase(), B)).toBe(directConversationKey(A, B));
  });

  it('refuses a conversation with oneself', () => {
    expect(() => directConversationKey(A, A)).toThrow();
  });
});

describe('canEditMessage', () => {
  const createdAt = new Date('2026-10-20T08:00:00Z');
  const message = { senderUserId: A, kind: 'text', createdAt };

  it('lets the sender edit inside the window', () => {
    expect(canEditMessage(message, A, 15, new Date('2026-10-20T08:14:59Z'))).toBe(true);
  });

  it('refuses after the window', () => {
    expect(canEditMessage(message, A, 15, new Date('2026-10-20T08:15:01Z'))).toBe(false);
  });

  it('refuses other users and system messages', () => {
    expect(canEditMessage(message, B, 15, createdAt)).toBe(false);
    expect(canEditMessage({ ...message, kind: 'system' }, A, 15, createdAt)).toBe(false);
    expect(canEditMessage({ ...message, senderUserId: null }, A, 15, createdAt)).toBe(false);
  });
});

describe('isActiveMember', () => {
  it('requires a current, non-follower membership', () => {
    expect(isActiveMember({ role: 'member', leftAt: null })).toBe(true);
    expect(isActiveMember({ role: 'owner', leftAt: null })).toBe(true);
    expect(isActiveMember({ role: 'member', leftAt: new Date() })).toBe(false);
    expect(isActiveMember({ role: 'follower', leftAt: null })).toBe(false);
    expect(isActiveMember(null)).toBe(false);
  });
});
