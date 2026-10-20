/** One DIRECT conversation per pair of users, whichever side starts it. */
export function directConversationKey(userA: string, userB: string): string {
  if (userA === userB) {
    throw new Error('A direct conversation needs two different users.');
  }
  return [userA.toLowerCase(), userB.toLowerCase()].sort().join(':');
}

export function canEditMessage(
  message: { senderUserId: string | null; kind: string; createdAt: Date },
  userId: string,
  editWindowMinutes: number,
  now: Date = new Date(),
): boolean {
  if (message.kind !== 'text' || message.senderUserId !== userId) return false;
  return now.getTime() - message.createdAt.getTime() <= editWindowMinutes * 60_000;
}

export type ConversationMembership = { role: string; leftAt: Date | null } | null | undefined;

/** DIRECT/GROUP access comes only from current membership; DOCUMENT threads follow document access. */
export function isActiveMember(membership: ConversationMembership): boolean {
  return Boolean(membership && membership.leftAt === null && membership.role !== 'follower');
}
