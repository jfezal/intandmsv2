import { z } from 'zod';

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(256);
const description = z.string().trim().max(2000).optional();
const host = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9.:_-]+$/, 'Host must be a hostname or IP address.');
const exportPath = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !value.split(/[\\/]/).includes('..'), 'Path may not contain "..".');
const relativePath = z
  .string()
  .trim()
  .max(1024)
  .default('')
  .transform((value) => value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
  .refine((value) => !value.split('/').includes('..'), 'Path may not contain "..".');

export const SCAN_INTERVAL_MIN_MINUTES = 15;
const scanIntervalMinutes = z
  .number()
  .int()
  .min(SCAN_INTERVAL_MIN_MINUTES)
  .max(7 * 24 * 60)
  .nullable();

export const createConnectorBodySchema = z.discriminatedUnion('protocol', [
  z.object({ protocol: z.literal('local'), name, mountPath: z.string().trim().min(1).max(512) }),
  z.object({ protocol: z.literal('smb'), name, host, exportPath, smbUsername: z.string().trim().max(256).optional() }),
  z.object({ protocol: z.literal('nfs'), name, host, exportPath }),
]);

export const updateConnectorBodySchema = z
  .object({ name: name.optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional() })
  .refine((body) => body.name !== undefined || body.status !== undefined, 'Nothing to update.');

export const connectorCredentialsBodySchema = z.object({
  username: z.string().trim().min(1).max(256),
  password: z.string().min(1).max(512),
});

const initialGrant = z.object({ userId: uuid, roleId: uuid });

export const createRepositoryBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MANAGED'),
    name,
    description,
    grants: z.array(initialGrant).max(50).default([]),
  }),
  z.object({
    type: z.literal('INDEXED'),
    name,
    description,
    connectorId: uuid,
    rootPath: relativePath,
    scanIntervalMinutes: scanIntervalMinutes.default(null),
    grants: z.array(initialGrant).max(50).default([]),
  }),
]);

export const updateRepositoryBodySchema = z.object({
  revision: z.number().int().min(0),
  name: name.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  scanIntervalMinutes: scanIntervalMinutes.optional(),
  status: z.enum(['ACTIVE', 'DISABLED', 'ARCHIVED']).optional(),
});

export type CreateConnectorBody = z.infer<typeof createConnectorBodySchema>;
export type UpdateConnectorBody = z.infer<typeof updateConnectorBodySchema>;
export type CreateRepositoryBody = z.infer<typeof createRepositoryBodySchema>;
export type UpdateRepositoryBody = z.infer<typeof updateRepositoryBodySchema>;
