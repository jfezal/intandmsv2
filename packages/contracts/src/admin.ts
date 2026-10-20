import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;

const uuid = z.string().uuid();
const password = z.string().min(PASSWORD_MIN_LENGTH).max(256);
const displayName = z.string().trim().min(1).max(256);

export const createUserBodySchema = z.object({
  login: z
    .string()
    .trim()
    .min(2)
    .max(128)
    .regex(/^[a-z0-9._-]+$/i, 'Login may contain letters, digits, dot, dash and underscore.')
    .transform((value) => value.toLowerCase()),
  displayName,
  password,
  roleIds: z.array(uuid).max(32).default([]),
});

export const updateUserBodySchema = z
  .object({ displayName: displayName.optional(), enabled: z.boolean().optional() })
  .refine((body) => body.displayName !== undefined || body.enabled !== undefined, 'Nothing to update.');

export const setUserRolesBodySchema = z.object({ roleIds: z.array(uuid).max(32) });

export const resetPasswordBodySchema = z.object({ password });

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: password,
});

export const createGrantBodySchema = z
  .object({
    userId: uuid.optional(),
    departmentId: uuid.optional(),
    roleId: uuid,
    repositoryId: uuid,
    folderId: uuid.nullable().optional(),
  })
  .refine((body) => Boolean(body.userId) !== Boolean(body.departmentId), 'Grant a user or a department, not both.');

export const createDepartmentBodySchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(1000).optional(),
  memberIds: z.array(uuid).max(200).default([]),
});

export const updateDepartmentBodySchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    memberIds: z.array(uuid).max(200).optional(),
  })
  .refine((body) => body.name !== undefined || body.description !== undefined || body.memberIds !== undefined, 'Nothing to update.');

export const roleBodySchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase letters, digits and underscores.'),
  displayName: z.string().trim().min(1).max(128),
  description: z.string().trim().max(1000).optional(),
  permissionKeys: z.array(z.string().min(1).max(128)).max(64),
});

export const updateRoleBodySchema = roleBodySchema.omit({ key: true });

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
export type CreateGrantBody = z.infer<typeof createGrantBodySchema>;
export type CreateDepartmentBody = z.infer<typeof createDepartmentBodySchema>;
export type UpdateDepartmentBody = z.infer<typeof updateDepartmentBodySchema>;
export type RoleBody = z.infer<typeof roleBodySchema>;
export type UpdateRoleBody = z.infer<typeof updateRoleBodySchema>;
