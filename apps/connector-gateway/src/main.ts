import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import { CredentialStore } from './credential-store';
import { MountStateStore } from './mount-state';
import { testSmbShare } from './smb';

const host = process.env.CONNECTOR_GATEWAY_HOST ?? '127.0.0.1';
const port = Number(process.env.CONNECTOR_GATEWAY_PORT ?? 3099);
const token = process.env.CONNECTOR_GATEWAY_TOKEN ?? '';
const dataRoot = process.env.CONNECTOR_GATEWAY_DATA ?? './data/connector-gateway';
const allowCifsMount = process.env.CONNECTOR_ALLOW_CIFS_MOUNT === 'true';

const credentials = new CredentialStore(path.join(dataRoot, 'credentials'));
const mounts = new MountStateStore(path.join(dataRoot, 'slots'));

function assertAuth(authorization: string | undefined): void {
  if (!token) {
    throw new Error('Gateway token not configured.');
  }
  if (authorization !== `Bearer ${token}`) {
    const err = new Error('Unauthorized');
    (err as Error & { statusCode: number }).statusCode = 401;
    throw err;
  }
}

async function runMountCifs(
  remote: string,
  mountPoint: string,
  username: string,
  password: string,
): Promise<{ ok: boolean; message: string }> {
  if (!allowCifsMount) {
    return {
      ok: false,
      message: 'CIFS mount disabled. Set CONNECTOR_ALLOW_CIFS_MOUNT=true on gateway host after hardening.',
    };
  }

  await mkdir(mountPoint, { recursive: true });
  const credFile = path.join(mountPoint, '..', `.cred-${path.basename(mountPoint)}`);
  await writeFile(credFile, `username=${username}\npassword=${password}\n`, { mode: 0o600 });

  return new Promise((resolve) => {
    const child = spawn('mount', ['-t', 'cifs', remote, mountPoint, '-o', `credentials=${credFile},ro`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      void rm(credFile, { force: true });
      if (code === 0) {
        resolve({ ok: true, message: 'CIFS mount applied.' });
      } else {
        resolve({ ok: false, message: stderr.slice(0, 400) || `mount exit ${code}` });
      }
    });
  });
}

async function runUnmount(mountPoint: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn('umount', [mountPoint], { stdio: 'ignore' });
    child.on('close', () => resolve());
  });
}

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') {
      return;
    }
    try {
      assertAuth(request.headers.authorization);
    } catch (error) {
      const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
      return reply.code(statusCode).send({ detail: (error as Error).message });
    }
  });

  app.post<{ Params: { connectorId: string }; Body: { username: string; password: string } }>(
    '/internal/v1/connectors/:connectorId/credentials',
    async (request) => {
      const { username, password } = request.body;
      await credentials.save(request.params.connectorId, { username, password });
      return { ok: true };
    },
  );

  app.post<{
    Params: { connectorId: string };
    Body: { protocol: string; host: string; exportPath: string };
  }>('/internal/v1/connectors/:connectorId/test', async (request) => {
    const { protocol, host: smbHost, exportPath } = request.body;
    if (protocol !== 'smb') {
      return { ok: false, message: 'Only SMB test is implemented in this gateway revision.' };
    }
    const cred = await credentials.load(request.params.connectorId);
    if (!cred) {
      return { ok: false, message: 'Credentials not configured on gateway.' };
    }
    return testSmbShare(smbHost, exportPath, cred.username, cred.password);
  });

  app.post<{
    Params: { connectorId: string };
    Body: { protocol: string; host: string; exportPath: string; generation: number };
  }>('/internal/v1/connectors/:connectorId/mount', async (request) => {
    const connectorId = request.params.connectorId;
    const { protocol, host: smbHost, exportPath, generation } = request.body;
    const cred = await credentials.load(connectorId);
    if (!cred) {
      return { ok: false, message: 'Credentials not configured on gateway.' };
    }

    const slot = await mounts.ensureSlot(connectorId);
    const existing = await mounts.read(connectorId);
    if (existing?.mountGeneration === generation && (await mounts.slotReachable(connectorId))) {
      return {
        ok: true,
        message: 'Already mounted for this generation.',
        mountPath: slot,
        mountGeneration: generation,
      };
    }

    if (existing) {
      await runUnmount(existing.mountPath);
      await mounts.clear(connectorId);
    }

    if (protocol === 'smb') {
      const share = exportPath.replace(/^\/+/, '').split('/')[0] ?? exportPath;
      const remote = `//${smbHost}/${share}`;
      const mounted = await runMountCifs(remote, slot, cred.username, cred.password);
      if (!mounted.ok) {
        return { ok: false, message: mounted.message };
      }
    } else if (protocol === 'local') {
      /* slot used as bind path placeholder — operator must populate */
    } else {
      return { ok: false, message: `Mount not implemented for protocol ${protocol}.` };
    }

    const record = {
      connectorId,
      mountPath: slot,
      mountGeneration: generation,
      protocol,
      host: smbHost,
      exportPath,
    };
    await mounts.write(record);
    return { ok: true, message: 'Mount recorded.', mountPath: slot, mountGeneration: generation };
  });

  app.post<{ Params: { connectorId: string } }>(
    '/internal/v1/connectors/:connectorId/unmount',
    async (request) => {
      const connectorId = request.params.connectorId;
      const existing = await mounts.read(connectorId);
      if (existing) {
        await runUnmount(existing.mountPath);
        await mounts.clear(connectorId);
      }
      await credentials.clear(connectorId);
      return { ok: true, message: 'Unmounted and credentials cleared on gateway.' };
    },
  );

  app.get<{ Params: { connectorId: string } }>(
    '/internal/v1/connectors/:connectorId/status',
    async (request) => {
      const connectorId = request.params.connectorId;
      const record = await mounts.read(connectorId);
      if (!record) {
        return { mounted: false, message: 'No mount record.' };
      }
      const reachable = await mounts.slotReachable(connectorId);
      return {
        mounted: reachable,
        mountPath: record.mountPath,
        mountGeneration: record.mountGeneration,
        message: reachable ? 'Mount slot reachable.' : 'Mount record exists but slot not reachable.',
      };
    },
  );

  await app.listen({ host, port });
  console.log(`[connector-gateway] listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
