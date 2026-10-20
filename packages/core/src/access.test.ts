import { describe, expect, it } from 'vitest';
import { resolveEffectiveAccess, type AccessGrant } from './access';

const REPO = 'repo-1';
const viewer = (id: string, folderId: string | null, repositoryId = REPO): AccessGrant => ({
  id,
  roleId: 'viewer',
  roleName: 'Viewer',
  repositoryId,
  folderId,
  permissions: ['documents.read', 'search.query'],
});
const contributor = (id: string, folderId: string | null): AccessGrant => ({
  id,
  roleId: 'contributor',
  roleName: 'Contributor',
  repositoryId: REPO,
  folderId,
  permissions: ['documents.read', 'documents.write'],
});

describe('resolveEffectiveAccess', () => {
  it('denies by default', () => {
    const access = resolveEffectiveAccess({ globalPermissions: [], grants: [], repositoryId: REPO, folderAncestry: [] });
    expect(access.permissions).toEqual([]);
  });

  it('applies a department-flattened grant like a direct user grant', () => {
    const grants = [contributor('department-grant', null)];
    const access = resolveEffectiveAccess({
      globalPermissions: [],
      grants,
      repositoryId: REPO,
      folderAncestry: ['child'],
    });
    expect(access.permissions).toEqual(expect.arrayContaining(['documents.read', 'documents.write']));
  });

  it('applies repository grants to the root and every folder', () => {
    const grants = [viewer('g1', null)];
    expect(
      resolveEffectiveAccess({ globalPermissions: [], grants, repositoryId: REPO, folderAncestry: [] }).permissions,
    ).toContain('documents.read');
    expect(
      resolveEffectiveAccess({ globalPermissions: [], grants, repositoryId: REPO, folderAncestry: ['child', 'parent'] })
        .permissions,
    ).toContain('documents.read');
  });

  it('inherits folder grants down the tree but not up or sideways', () => {
    const grants = [viewer('g1', 'parent')];
    const child = resolveEffectiveAccess({ globalPermissions: [], grants, repositoryId: REPO, folderAncestry: ['child', 'parent'] });
    expect(child.permissions).toContain('documents.read');
    expect(child.sources).toContainEqual(expect.objectContaining({ kind: 'folder', folderId: 'parent', inherited: true }));

    expect(
      resolveEffectiveAccess({ globalPermissions: [], grants, repositoryId: REPO, folderAncestry: [] }).permissions,
    ).toEqual([]);
    expect(
      resolveEffectiveAccess({ globalPermissions: [], grants, repositoryId: REPO, folderAncestry: ['sibling'] }).permissions,
    ).toEqual([]);
  });

  it('never lets a narrower grant reduce a broader inherited one', () => {
    const grants = [contributor('g1', 'parent'), viewer('g2', 'child')];
    const access = resolveEffectiveAccess({ globalPermissions: [], grants, repositoryId: REPO, folderAncestry: ['child', 'parent'] });
    expect(access.permissions).toEqual(['documents.read', 'documents.write', 'search.query']);
  });

  it('ignores grants for other repositories', () => {
    const grants = [viewer('g1', null, 'repo-2')];
    expect(
      resolveEffectiveAccess({ globalPermissions: [], grants, repositoryId: REPO, folderAncestry: [] }).permissions,
    ).toEqual([]);
  });

  it('ignores global-only permissions placed inside a scoped grant', () => {
    const grants: AccessGrant[] = [{ ...viewer('g1', null), permissions: ['users.manage', 'documents.read'] }];
    const access = resolveEffectiveAccess({ globalPermissions: [], grants, repositoryId: REPO, folderAncestry: [] });
    expect(access.permissions).toEqual(['documents.read']);
  });

  it('treats global resource permissions and system.admin as access everywhere', () => {
    expect(
      resolveEffectiveAccess({ globalPermissions: ['documents.read'], grants: [], repositoryId: REPO, folderAncestry: ['x'] })
        .permissions,
    ).toEqual(['documents.read']);
    expect(
      resolveEffectiveAccess({ globalPermissions: ['system.admin'], grants: [], repositoryId: REPO, folderAncestry: [] })
        .permissions,
    ).toEqual(['documents.read', 'documents.write', 'search.query']);
  });

  it('honours documents.write on an indexed repository (DMS writes new files onto the source)', () => {
    const grants = [contributor('g1', null)];
    expect(
      resolveEffectiveAccess({
        globalPermissions: [],
        grants,
        repositoryId: REPO,
        folderAncestry: ['child'],
        repositoryType: 'INDEXED',
      }).permissions,
    ).toEqual(['documents.read', 'documents.write']);
  });
});
