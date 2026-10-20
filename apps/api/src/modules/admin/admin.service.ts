import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateDepartmentBody,
  CreateGrantBody,
  CreateUserBody,
  RoleBody,
  UpdateDepartmentBody,
  UpdateRoleBody,
  UpdateUserBody,
} from '@intandms/contracts';
import { PERMISSIONS, PERMISSION_CATALOG, isScopablePermission, type PermissionKey } from '@intandms/core';
import { hashPassword } from '@intandms/identity';
import { Prisma } from '@prisma/client';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthPrincipal } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';

const roleWithPermissions = { rolePermissions: { include: { permission: true } } } as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  /* ---------- Users ---------- */

  async listUsers(principal: AuthPrincipal) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const now = new Date();
    const [users, lastLogins] = await Promise.all([
      this.prisma.client.user.findMany({
        orderBy: { login: 'asc' },
        include: {
          passwordCredential: { select: { mustResetPassword: true } },
          userRoles: { include: { role: { select: { id: true, key: true, displayName: true } } } },
          _count: {
            select: {
              scopedRoleAssignments: true,
              sessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
            },
          },
        },
      }),
      this.prisma.client.authEvent.groupBy({
        by: ['userId'],
        where: { outcome: 'success', userId: { not: null } },
        _max: { createdAt: true },
      }),
    ]);
    const lastLoginByUser = new Map(lastLogins.map((row) => [row.userId, row._max.createdAt]));
    return users.map((user) => ({
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      enabled: user.enabled,
      createdAt: user.createdAt,
      lastLoginAt: lastLoginByUser.get(user.id) ?? null,
      mustChangePassword: user.passwordCredential?.mustResetPassword ?? false,
      roles: user.userRoles.map((userRole) => userRole.role),
      grantCount: user._count.scopedRoleAssignments,
      activeSessions: user._count.sessions,
    }));
  }

  async createUser(principal: AuthPrincipal, input: CreateUserBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    await this.assertRolesExist(input.roleIds);
    await this.assertCanGrantGlobalRoles(principal, input.roleIds);
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.client.user.create({
        data: {
          login: input.login,
          displayName: input.displayName,
          passwordCredential: { create: { passwordHash, mustResetPassword: true } },
          userRoles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
      });
      await this.authz.writeAudit(principal, 'user.create', 'user', user.id, 'success', {
        login: user.login,
        roleIds: input.roleIds,
      });
      return { id: user.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That login is already in use.');
      }
      throw error;
    }
  }

  async updateUser(principal: AuthPrincipal, userId: string, input: UpdateUserBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const user = await this.requireUser(userId);
    if (input.enabled === false) {
      if (user.id === principal.id) {
        throw new BadRequestException('You cannot disable your own account.');
      }
      await this.assertAdminRemains({ userId, disable: true });
    }
    const disabling = input.enabled === false && user.enabled;
    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          displayName: input.displayName,
          enabled: input.enabled,
          ...(disabling ? { securityRevision: { increment: 1 } } : {}),
        },
      });
      if (disabling) {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    });
    await this.authz.writeAudit(principal, 'user.update', 'user', userId, 'success', {
      displayName: input.displayName ?? null,
      enabled: input.enabled ?? null,
    });
    return { id: userId };
  }

  async setUserRoles(principal: AuthPrincipal, userId: string, roleIds: string[]) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    await this.requireUser(userId);
    const unique = [...new Set(roleIds)];
    await this.assertRolesExist(unique);
    await this.assertCanGrantGlobalRoles(principal, unique);
    await this.assertAdminRemains({ userId, roleIds: unique });
    const before = await this.prisma.client.userRole.findMany({ where: { userId }, select: { roleId: true } });
    await this.prisma.client.$transaction([
      this.prisma.client.userRole.deleteMany({ where: { userId } }),
      this.prisma.client.userRole.createMany({ data: unique.map((roleId) => ({ userId, roleId })) }),
    ]);
    await this.authz.writeAudit(principal, 'user.roles.set', 'user', userId, 'success', {
      before: before.map((row) => row.roleId),
      after: unique,
    });
    return { id: userId, roleIds: unique };
  }

  async resetPassword(principal: AuthPrincipal, userId: string, password: string) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    await this.requireUser(userId);
    const passwordHash = await hashPassword(password);
    await this.prisma.client.$transaction([
      this.prisma.client.passwordCredential.upsert({
        where: { userId },
        create: { userId, passwordHash, mustResetPassword: true },
        update: { passwordHash, mustResetPassword: true, passwordChangedAt: new Date() },
      }),
      this.prisma.client.user.update({ where: { id: userId }, data: { securityRevision: { increment: 1 } } }),
      this.prisma.client.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.authz.writeAudit(principal, 'user.password_reset', 'user', userId, 'success');
    return { id: userId };
  }

  async revokeSessions(principal: AuthPrincipal, userId: string) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    await this.requireUser(userId);
    const [, revoked] = await this.prisma.client.$transaction([
      this.prisma.client.user.update({ where: { id: userId }, data: { securityRevision: { increment: 1 } } }),
      this.prisma.client.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.authz.writeAudit(principal, 'user.sessions_revoke', 'user', userId, 'success', { count: revoked.count });
    return { revoked: revoked.count };
  }

  /* ---------- Access grants (D-03) ---------- */

  async listGrants(principal: AuthPrincipal, filter: { userId?: string; repositoryId?: string }) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const rows = await this.prisma.client.scopedRoleAssignment.findMany({
      where: {
        repositoryId: filter.repositoryId ?? { not: null },
        ...(filter.userId
          ? {
              OR: [{ userId: filter.userId }, { department: { members: { some: { userId: filter.userId } } } }],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, login: true, displayName: true, enabled: true } },
        department: { select: { id: true, name: true } },
        role: { include: roleWithPermissions },
        repository: { select: { id: true, name: true, type: true, status: true } },
        folder: { select: { id: true, name: true, relativePath: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      user: row.user,
      department: row.department,
      inherited: Boolean(filter.userId && row.departmentId && row.userId !== filter.userId),
      role: {
        id: row.role.id,
        key: row.role.key,
        displayName: row.role.displayName,
        permissions: row.role.rolePermissions.map((rolePermission) => rolePermission.permission.key),
      },
      repository: row.repository,
      folder: row.folder,
    }));
  }

  async createGrant(principal: AuthPrincipal, input: CreateGrantBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const folderId = input.folderId ?? null;
    await this.authz.assertGrantableRoles([input.roleId]);
    const [user, department, repository, folder] = await Promise.all([
      input.userId ? this.prisma.client.user.findUnique({ where: { id: input.userId } }) : Promise.resolve(null),
      input.departmentId ? this.prisma.client.department.findUnique({ where: { id: input.departmentId } }) : Promise.resolve(null),
      this.prisma.client.repository.findUnique({ where: { id: input.repositoryId } }),
      folderId ? this.prisma.client.folder.findUnique({ where: { id: folderId } }) : Promise.resolve(null),
    ]);
    if (input.userId && !user) throw new NotFoundException('User not found.');
    if (input.departmentId && !department) throw new NotFoundException('Department not found.');
    if (!repository) throw new NotFoundException('Repository not found.');
    if (folderId && (!folder || folder.repositoryId !== repository.id)) {
      throw new BadRequestException('Folder does not belong to this repository.');
    }

    try {
      const grant = await this.prisma.client.scopedRoleAssignment.create({
        data: {
          userId: user?.id ?? null,
          departmentId: department?.id ?? null,
          roleId: input.roleId,
          repositoryId: repository.id,
          folderId,
          createdByUserId: principal.id,
        },
      });
      const targetType = department ? 'department' : 'user';
      const targetId = department?.id ?? user!.id;
      await this.authz.writeAudit(principal, 'access.grant', targetType, targetId, 'success', {
        grantId: grant.id,
        roleId: input.roleId,
        repositoryId: repository.id,
        folderId,
      });
      return { id: grant.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That role is already granted at this location.');
      }
      throw error;
    }
  }

  async revokeGrant(principal: AuthPrincipal, grantId: string) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const grant = await this.prisma.client.scopedRoleAssignment.findUnique({ where: { id: grantId } });
    if (!grant) throw new NotFoundException('Grant not found.');
    await this.prisma.client.scopedRoleAssignment.delete({ where: { id: grantId } });
    await this.authz.writeAudit(
      principal,
      'access.revoke',
      grant.departmentId ? 'department' : 'user',
      grant.departmentId ?? grant.userId!,
      'success',
      {
        grantId,
        roleId: grant.roleId,
        repositoryId: grant.repositoryId,
        folderId: grant.folderId,
      },
    );
    return { id: grantId };
  }

  /* ---------- Departments ---------- */

  async listDepartments(principal: AuthPrincipal) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const departments = await this.prisma.client.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        members: { include: { user: { select: { id: true, login: true, displayName: true, enabled: true } } } },
        _count: { select: { grants: true } },
      },
    });
    return departments.map((department) => ({
      id: department.id,
      name: department.name,
      description: department.description,
      createdAt: department.createdAt,
      memberCount: department.members.length,
      grantCount: department._count.grants,
      members: department.members
        .map((member) => member.user)
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    }));
  }

  async createDepartment(principal: AuthPrincipal, input: CreateDepartmentBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const memberIds = [...new Set(input.memberIds)];
    if (memberIds.length) await this.assertUsersExist(memberIds);
    try {
      const department = await this.prisma.client.department.create({
        data: {
          name: input.name,
          description: input.description || null,
          members: { create: memberIds.map((userId) => ({ userId })) },
        },
      });
      await this.authz.writeAudit(principal, 'department.create', 'department', department.id, 'success', {
        memberCount: memberIds.length,
      });
      return { id: department.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A department with that name already exists.');
      }
      throw error;
    }
  }

  async updateDepartment(principal: AuthPrincipal, departmentId: string, input: UpdateDepartmentBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    await this.requireDepartment(departmentId);
    if (input.memberIds) await this.assertUsersExist([...new Set(input.memberIds)]);
    try {
      await this.prisma.client.$transaction(async (tx) => {
        if (input.name !== undefined || input.description !== undefined) {
          await tx.department.update({
            where: { id: departmentId },
            data: {
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
            },
          });
        }
        if (input.memberIds) {
          const memberIds = [...new Set(input.memberIds)];
          await tx.departmentMember.deleteMany({
            where: { departmentId, userId: { notIn: memberIds } },
          });
          await tx.departmentMember.createMany({
            data: memberIds.map((userId) => ({ departmentId, userId })),
            skipDuplicates: true,
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A department with that name already exists.');
      }
      throw error;
    }
    await this.authz.writeAudit(principal, 'department.update', 'department', departmentId, 'success');
    return { id: departmentId };
  }

  async deleteDepartment(principal: AuthPrincipal, departmentId: string) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    await this.requireDepartment(departmentId);
    await this.prisma.client.department.delete({ where: { id: departmentId } });
    await this.authz.writeAudit(principal, 'department.delete', 'department', departmentId, 'success');
  }

  private async requireDepartment(departmentId: string) {
    const department = await this.prisma.client.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundException('Department not found.');
    return department;
  }

  private async assertUsersExist(userIds: string[]) {
    const found = await this.prisma.client.user.count({ where: { id: { in: userIds } } });
    if (found !== userIds.length) throw new NotFoundException('User not found.');
  }

  /** Admin preview of what a user can do at a location, with the reason for each permission. */
  async effectiveAccess(principal: AuthPrincipal, query: { userId: string; repositoryId: string; folderId?: string }) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const user = await this.prisma.client.user.findUnique({
      where: { id: query.userId },
      include: { userRoles: { include: { role: { include: roleWithPermissions } } } },
    });
    if (!user) throw new NotFoundException('User not found.');
    const globalPermissions = [
      ...new Set(user.userRoles.flatMap((userRole) => userRole.role.rolePermissions.map((rp) => rp.permission.key))),
    ];
    const grants = await this.authz.loadGrants(user.id);
    const access = await this.authz.effectiveAccessFor(globalPermissions, grants, {
      repositoryId: query.repositoryId,
      folderId: query.folderId,
    });
    const folderIds = [
      ...new Set(access.sources.flatMap((source) => (source.kind === 'folder' ? [source.folderId] : []))),
    ];
    const folders = folderIds.length
      ? await this.prisma.client.folder.findMany({
          where: { id: { in: folderIds } },
          select: { id: true, name: true, relativePath: true },
        })
      : [];
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    return {
      enabled: user.enabled,
      permissions: access.permissions,
      sources: access.sources.map((source) =>
        source.kind === 'folder' ? { ...source, folder: folderById.get(source.folderId) ?? null } : source,
      ),
    };
  }

  /* ---------- Roles & permissions ---------- */

  listPermissions(principal: AuthPrincipal) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    return Object.entries(PERMISSION_CATALOG).map(([key, entry]) => ({ key, ...entry }));
  }

  async listRoles(principal: AuthPrincipal) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const roles = await this.prisma.client.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { displayName: 'asc' }],
      include: { ...roleWithPermissions, _count: { select: { userRoles: true, scopedRoleAssignments: true } } },
    });
    return roles.map((role) => {
      const permissions = role.rolePermissions.map((rolePermission) => rolePermission.permission.key).sort();
      return {
        id: role.id,
        key: role.key,
        displayName: role.displayName,
        description: role.description,
        isSystem: role.isSystem,
        permissions,
        scopable: permissions.length > 0 && permissions.every(isScopablePermission),
        globalAssignments: role._count.userRoles,
        scopedAssignments: role._count.scopedRoleAssignments,
      };
    });
  }

  async createRole(principal: AuthPrincipal, input: RoleBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const permissionKeys = this.validPermissionKeys(input.permissionKeys);
    this.assertNoSystemAdminPermission(permissionKeys);
    const permissions = await this.ensurePermissionRows(permissionKeys);
    try {
      const role = await this.prisma.client.role.create({
        data: {
          key: input.key,
          displayName: input.displayName,
          description: input.description || null,
          rolePermissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
        },
      });
      await this.authz.writeAudit(principal, 'role.create', 'role', role.id, 'success', { permissionKeys });
      return { id: role.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A role with that key already exists.');
      }
      throw error;
    }
  }

  async updateRole(principal: AuthPrincipal, roleId: string, input: UpdateRoleBody) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const role = await this.prisma.client.role.findUnique({
      where: { id: roleId },
      include: { ...roleWithPermissions, _count: { select: { scopedRoleAssignments: true } } },
    });
    if (!role) throw new NotFoundException('Role not found.');
    if (role.isSystem) throw forbidden('System roles cannot be changed.');
    const permissionKeys = this.validPermissionKeys(input.permissionKeys);
    this.assertNoSystemAdminPermission(permissionKeys);
    const globalOnly = permissionKeys.filter((key) => !isScopablePermission(key));
    if (role._count.scopedRoleAssignments > 0 && globalOnly.length > 0) {
      throw new BadRequestException(
        `This role is granted on repositories or folders, so it cannot include system-wide permissions (${globalOnly.join(', ')}).`,
      );
    }
    const permissions = await this.ensurePermissionRows(permissionKeys);
    const before = role.rolePermissions.map((rolePermission) => rolePermission.permission.key).sort();
    await this.prisma.client.$transaction([
      this.prisma.client.role.update({
        where: { id: roleId },
        data: { displayName: input.displayName, description: input.description || null },
      }),
      this.prisma.client.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.client.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
      }),
    ]);
    await this.authz.writeAudit(principal, 'role.update', 'role', roleId, 'success', {
      before,
      after: [...permissionKeys].sort(),
    });
    return { id: roleId };
  }

  async deleteRole(principal: AuthPrincipal, roleId: string) {
    this.authz.assertPermission(principal, PERMISSIONS.USERS_MANAGE);
    const role = await this.prisma.client.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { userRoles: true, scopedRoleAssignments: true } } },
    });
    if (!role) throw new NotFoundException('Role not found.');
    if (role.isSystem) throw forbidden('System roles cannot be deleted.');
    if (role._count.userRoles + role._count.scopedRoleAssignments > 0) {
      throw new ConflictException('Remove this role from every user and grant before deleting it.');
    }
    await this.prisma.client.role.delete({ where: { id: roleId } });
    await this.authz.writeAudit(principal, 'role.delete', 'role', roleId, 'success', { key: role.key });
    return { id: roleId };
  }

  /* ---------- Helpers ---------- */

  private async requireUser(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private async assertRolesExist(roleIds: string[]) {
    if (roleIds.length === 0) return;
    const count = await this.prisma.client.role.count({ where: { id: { in: roleIds } } });
    if (count !== new Set(roleIds).size) throw new BadRequestException('One or more roles do not exist.');
  }

  /** Only full administrators may hand out the system administrator role. */
  private async assertCanGrantGlobalRoles(principal: AuthPrincipal, roleIds: string[]) {
    if (principal.permissions.includes(PERMISSIONS.SYSTEM_ADMIN) || roleIds.length === 0) return;
    const adminRoles = await this.prisma.client.role.count({
      where: {
        id: { in: roleIds },
        rolePermissions: { some: { permission: { key: PERMISSIONS.SYSTEM_ADMIN } } },
      },
    });
    if (adminRoles > 0) throw forbidden('Only a system administrator can assign the system administrator role.');
  }

  /** Keeps at least one enabled account holding system.admin. */
  private async assertAdminRemains(change: { userId: string; disable?: boolean; roleIds?: string[] }) {
    const admins = await this.prisma.client.user.findMany({
      where: {
        enabled: true,
        userRoles: { some: { role: { rolePermissions: { some: { permission: { key: PERMISSIONS.SYSTEM_ADMIN } } } } } },
      },
      select: { id: true },
    });
    if (!admins.some((admin) => admin.id === change.userId)) return;

    let stillAdmin = !change.disable;
    if (stillAdmin && change.roleIds) {
      stillAdmin =
        (await this.prisma.client.role.count({
          where: {
            id: { in: change.roleIds },
            rolePermissions: { some: { permission: { key: PERMISSIONS.SYSTEM_ADMIN } } },
          },
        })) > 0;
    }
    if (!stillAdmin && admins.length <= 1) {
      throw new BadRequestException('At least one enabled system administrator must remain.');
    }
  }

  private validPermissionKeys(keys: string[]): PermissionKey[] {
    const unique = [...new Set(keys)];
    const unknown = unique.filter((key) => !(key in PERMISSION_CATALOG));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    if (unique.length === 0) throw new BadRequestException('Choose at least one permission.');
    return unique as PermissionKey[];
  }

  private assertNoSystemAdminPermission(keys: PermissionKey[]) {
    if (keys.includes(PERMISSIONS.SYSTEM_ADMIN)) {
      throw new BadRequestException('system.admin is reserved for the built-in administrator role.');
    }
  }

  private async ensurePermissionRows(keys: PermissionKey[]) {
    return Promise.all(
      keys.map((key) =>
        this.prisma.client.permission.upsert({
          where: { key },
          create: { key, description: PERMISSION_CATALOG[key].description },
          update: {},
        }),
      ),
    );
  }
}
