import { existsSync } from 'node:fs';
import path from 'node:path';
import { findWorkspaceRoot } from '@intandms/storage';

const envFile = path.join(findWorkspaceRoot(), '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
