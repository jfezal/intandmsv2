#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { hashPassword } from '@intandms/identity';
import { createPrismaClient } from '../src/client';

const ADMIN_ROLE_KEY = 'system_admin';
const ADMIN_PERMISSIONS = [
  'system.admin',
  'users.manage',
  'audit.read',
  'repositories.manage',
  'documents.read',
  'documents.write',
  'search.query',
  'jobs.manage',
  'connectors.manage',
  'messages.audit',
] as const;

async function readPassword(prompt: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const login = process.argv[2]?.trim().toLowerCase();
  if (!login) {
    console.error('Usage: npm run bootstrap:admin -- <login>');
    process.exit(1);
  }

  const envPassword = process.env.INTANDMS_BOOTSTRAP_PASSWORD;
  const password =
    envPassword ??
    (await readPassword('Administrator password: '));
  const confirm =
    envPassword ??
    (await readPassword('Confirm password: '));
  if (envPassword) {
    console.warn('Using INTANDMS_BOOTSTRAP_PASSWORD from environment (avoid in production shells).');
  }
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }
  if (password !== confirm) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  const db = createPrismaClient();
  try {
    const state = await db.installationState.findUnique({ where: { id: 'default' } });
    if (state?.bootstrapClosed) {
      console.error('Bootstrap is closed. Use an existing administrator account.');
      process.exit(1);
    }

    const existing = await db.user.findUnique({ where: { login } });
    if (existing) {
      console.error('Login already exists.');
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);

    await db.$transaction(async (tx) => {
      await tx.installationState.upsert({
        where: { id: 'default' },
        create: { id: 'default', bootstrapClosed: true },
        update: { bootstrapClosed: true },
      });

      for (const key of ADMIN_PERMISSIONS) {
        await tx.permission.upsert({
          where: { key },
          create: { key, description: key },
          update: {},
        });
      }

      const adminRole = await tx.role.upsert({
        where: { key: ADMIN_ROLE_KEY },
        create: { key: ADMIN_ROLE_KEY, displayName: 'System administrator' },
        update: {},
      });

      const permissions = await tx.permission.findMany({
        where: { key: { in: [...ADMIN_PERMISSIONS] } },
      });

      for (const permission of permissions) {
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: adminRole.id,
              permissionId: permission.id,
            },
          },
          create: { roleId: adminRole.id, permissionId: permission.id },
          update: {},
        });
      }

      const user = await tx.user.create({
        data: {
          login,
          displayName: login,
          passwordCredential: {
            create: { passwordHash },
          },
          userRoles: {
            create: { roleId: adminRole.id },
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: 'installation.bootstrap_admin',
          targetType: 'user',
          targetId: user.id,
          outcome: 'success',
        },
      });
    });

    console.log(`Bootstrap complete for administrator "${login}".`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
