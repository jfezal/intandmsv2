#!/usr/bin/env node
/**
 * Local development only — resets password for an existing user (e.g. forgotten dev bootstrap).
 * Requires DATABASE_URL. Set INTANDMS_BOOTSTRAP_PASSWORD (min 12 chars).
 */
import { hashPassword } from '@intandms/identity';
import { createPrismaClient } from '../src/client';

async function main(): Promise<void> {
  const login = process.argv[2]?.trim().toLowerCase();
  const password = process.env.INTANDMS_BOOTSTRAP_PASSWORD?.trim();
  if (!login) {
    console.error('Usage: INTANDMS_BOOTSTRAP_PASSWORD=... npx tsx scripts/reset-admin-password.ts <login>');
    process.exit(1);
  }
  if (!password || password.length < 12) {
    console.error('Set INTANDMS_BOOTSTRAP_PASSWORD (at least 12 characters).');
    process.exit(1);
  }

  const db = createPrismaClient();
  try {
    const user = await db.user.findUnique({ where: { login }, include: { passwordCredential: true } });
    if (!user) {
      console.error(`User "${login}" not found.`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    if (user.passwordCredential) {
      await db.passwordCredential.update({
        where: { userId: user.id },
        data: { passwordHash },
      });
    } else {
      await db.passwordCredential.create({
        data: { userId: user.id, passwordHash },
      });
    }

    await db.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: 'user.password_reset_dev',
        targetType: 'user',
        targetId: user.id,
        outcome: 'success',
      },
    });

    console.log(`Password updated for "${login}". Use the value from INTANDMS_BOOTSTRAP_PASSWORD to log in.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
