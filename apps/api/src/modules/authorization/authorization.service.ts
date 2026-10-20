import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  isScopablePermission,
  resolveEffectiveAccess,
  type AccessGrant,
  type EffectiveAccess,
  type PermissionKey,
} from '@intandms/core';
import { Prisma } from '@prisma/client';
import { forbidden } from '../../common/forbidden.exception';
import { PrismaService } from '../../prisma/prisma.service';

export type AuthPrincipal = {
  id: string;
  login: string;
  /** Permissions from global roles only; scoped grants are resolved per location. */
  permissions: string[];
};

export type AccessLocation = { repositoryId: string; folderId?: string | null };

/** `'all'` when held globally; otherwise whole repositories plus granted folder subtrees. */
export type AccessScope =
  | 'all'
  | { repositoryIds: string[]; folderGrants: Array<{ repositoryId: string; folderId: string }> };

const MAX_FOLDER_DEPTH = 256;

@Injectable()
export class AuthorizationService {
  /** Principals are created per request, so this caches grants for one request only. */
  private readonly grantCache = new WeakMap<AuthPrincipal, Promise<AccessGrant[]>>();

  constructor(private readonly prisma: PrismaService) {}

  hasPermission(principal: AuthPrincipal, permission: PermissionKey): boolean {
    if (principal.permissions.includes(PERMISSIONS.SYSTEM_ADMIN)) {
      return true;
    }
    return principal.permissions.includes(permission);
  }

  assertPermission(principal: AuthPrincipal, permission: PermissionKey): void {
    if (!this.hasPermission(principal, permission)) {
      throw forbidden();
    }
  }

  /** Scoped grants may only use non-system roles whose permissions are all scopable. */
  async assertGrantableRoles(roleIds: string[]): Promise<void> {
    const unique = [...new Set(roleIds)];
    if (unique.length === 0) return;
    const roles = await this.prisma.client.role.findMany({
      where: { id: { in: unique } },
      include: { rolePermissions: { include: { permission: true } } },
    });
    if (roles.length !== unique.length) {
      throw new NotFoundException('Role not found.');
    }
    for (const role of roles) {
      const globalOnly = role.rolePermissions
        .map((rolePermission) => rolePermission.permission.key)
        .filter((key) => !isScopablePermission(key));
      if (role.isSystem || globalOnly.length > 0) {
        throw new BadRequestException(
          `Role "${role.displayName}" contains system-wide permissions (${globalOnly.join(', ') || 'system role'}) and cannot be granted on a repository or folder.`,
        );
      }
    }
  }

  grants(principal: AuthPrincipal): Promise<AccessGrant[]> {
    let cached = this.grantCache.get(principal);
    if (!cached) {
      cached = this.loadGrants(principal.id);
      this.grantCache.set(principal, cached);
    }
    return cached;
  }

  async loadGrants(userId: string): Promise<AccessGrant[]> {
    const memberships = await this.prisma.client.departmentMember.findMany({
      where: { userId },
      select: { departmentId: true },
    });
    const departmentIds = memberships.map((row) => row.departmentId);
    const rows = await this.prisma.client.scopedRoleAssignment.findMany({
      where: {
        repositoryId: { not: null },
        OR: [{ userId }, ...(departmentIds.length ? [{ departmentId: { in: departmentIds } }] : [])],
      },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        department: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      roleId: row.roleId,
      roleName: row.department ? `${row.role.displayName} (${row.department.name})` : row.role.displayName,
      repositoryId: row.repositoryId!,
      folderId: row.folderId,
      permissions: row.role.rolePermissions.map((rolePermission) => rolePermission.permission.key),
    }));
  }

  /** Target folder first, then parents up to the root. `null` when the folder is not in the repository. */
  async folderAncestry(repositoryId: string, folderId: string | null | undefined): Promise<string[] | null> {
    if (!folderId) return [];
    const rows = await this.prisma.client.$queryRaw<Array<{ id: string; repository_id: string }>>`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, repository_id, 0 AS depth FROM folders WHERE id = ${folderId}::uuid
        UNION ALL
        SELECT f.id, f.parent_id, f.repository_id, c.depth + 1
        FROM folders f JOIN chain c ON f.id = c.parent_id
        WHERE c.depth < ${MAX_FOLDER_DEPTH}
      )
      SELECT id, repository_id FROM chain ORDER BY depth
    `;
    if (rows.length === 0 || rows.some((row) => row.repository_id !== repositoryId)) return null;
    return rows.map((row) => row.id);
  }

  async effectiveAccess(principal: AuthPrincipal, location: AccessLocation): Promise<EffectiveAccess> {
    return this.effectiveAccessFor(principal.permissions, await this.grants(principal), location);
  }

  async effectiveAccessFor(
    globalPermissions: readonly string[],
    grants: readonly AccessGrant[],
    location: AccessLocation,
  ): Promise<EffectiveAccess> {
    const ancestry = await this.folderAncestry(location.repositoryId, location.folderId);
    if (ancestry === null) return { permissions: [], sources: [] };
    const repository = await this.prisma.client.repository.findUnique({
      where: { id: location.repositoryId },
      select: { type: true },
    });
    return resolveEffectiveAccess({
      globalPermissions,
      grants,
      repositoryId: location.repositoryId,
      folderAncestry: ancestry,
      repositoryType: repository?.type,
    });
  }

  async can(principal: AuthPrincipal, permission: PermissionKey, location: AccessLocation): Promise<boolean> {
    if (this.hasPermission(principal, permission)) {
      return location.folderId ? (await this.folderAncestry(location.repositoryId, location.folderId)) !== null : true;
    }
    const access = await this.effectiveAccess(principal, location);
    return access.permissions.includes(permission);
  }

  async assertCan(principal: AuthPrincipal, permission: PermissionKey, location: AccessLocation): Promise<void> {
    if (!(await this.can(principal, permission, location))) {
      throw forbidden();
    }
  }

  /** Global holders, or anyone holding the permission through at least one grant. */
  async hasCapability(principal: AuthPrincipal, permission: PermissionKey): Promise<boolean> {
    if (this.hasPermission(principal, permission)) return true;
    return (await this.grants(principal)).some((grant) => grant.permissions.includes(permission));
  }

  async accessScope(principal: AuthPrincipal, permission: PermissionKey): Promise<AccessScope> {
    if (this.hasPermission(principal, permission)) return 'all';
    const relevant = (await this.grants(principal)).filter((grant) => grant.permissions.includes(permission));
    return {
      repositoryIds: [...new Set(relevant.filter((grant) => !grant.folderId).map((grant) => grant.repositoryId))],
      folderGrants: relevant
        .filter((grant): grant is AccessGrant & { folderId: string } => Boolean(grant.folderId))
        .map((grant) => ({ repositoryId: grant.repositoryId, folderId: grant.folderId })),
    };
  }

  /** SQL predicate limiting `documentAlias` rows to the scope (folder grants include their subtrees). */
  scopePredicate(scope: AccessScope, documentAlias = 'd'): Prisma.Sql {
    if (scope === 'all') return Prisma.sql`TRUE`;
    const alias = Prisma.raw(documentAlias);
    const parts: Prisma.Sql[] = [];
    if (scope.repositoryIds.length) {
      parts.push(
        Prisma.sql`${alias}.repository_id IN (${Prisma.join(scope.repositoryIds.map((id) => Prisma.sql`${id}::uuid`))})`,
      );
    }
    if (scope.folderGrants.length) {
      const roots = Prisma.join(scope.folderGrants.map((grant) => Prisma.sql`${grant.folderId}::uuid`));
      parts.push(Prisma.sql`${alias}.folder_id IN (
        WITH RECURSIVE subtree AS (
          SELECT id, 0 AS depth FROM folders WHERE id IN (${roots})
          UNION ALL
          SELECT f.id, s.depth + 1 FROM folders f JOIN subtree s ON f.parent_id = s.id WHERE s.depth < ${MAX_FOLDER_DEPTH}
        )
        SELECT id FROM subtree
      )`);
    }
    return parts.length ? Prisma.sql`(${Prisma.join(parts, ' OR ')})` : Prisma.sql`FALSE`;
  }

  /**
   * Folders a user may open only to reach a deeper grant: each granted folder and its ancestors.
   * Content inside a traverse-only folder stays hidden.
   */
  async traversableFolderIds(principal: AuthPrincipal, repositoryId: string, permission: PermissionKey): Promise<Set<string>> {
    const roots = (await this.grants(principal))
      .filter((grant) => grant.repositoryId === repositoryId && grant.folderId && grant.permissions.includes(permission))
      .map((grant) => grant.folderId!);
    if (roots.length === 0) return new Set();
    const rows = await this.prisma.client.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id, 0 AS depth FROM folders WHERE id IN (${Prisma.join(roots.map((id) => Prisma.sql`${id}::uuid`))})
        UNION ALL
        SELECT f.id, f.parent_id, c.depth + 1 FROM folders f JOIN chain c ON f.id = c.parent_id WHERE c.depth < ${MAX_FOLDER_DEPTH}
      )
      SELECT DISTINCT id FROM chain
    `;
    return new Set(rows.map((row) => row.id));
  }

  async writeAudit(
    principal: AuthPrincipal | null,
    action: string,
    targetType: string,
    targetId: string,
    outcome: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.client.auditEvent.create({
      data: {
        actorUserId: principal?.id,
        action,
        targetType,
        targetId,
        outcome,
        metadata: metadata ?? undefined,
      },
    });
  }
}
