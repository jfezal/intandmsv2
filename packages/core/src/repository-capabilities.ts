export type RepositoryType = 'MANAGED' | 'INDEXED';

export const REPOSITORY_CAPABILITIES: Record<
  RepositoryType,
  {
    physicalWrite: boolean;
    upload: boolean;
    versionHistory: boolean;
    sourceDiscovery: boolean;
  }
> = {
  MANAGED: {
    physicalWrite: true,
    upload: true,
    versionHistory: true,
    sourceDiscovery: false,
  },
  INDEXED: {
    physicalWrite: true,
    upload: true,
    versionHistory: false,
    sourceDiscovery: true,
  },
};
