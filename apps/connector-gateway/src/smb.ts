import SMB2 from '@marsaud/smb2';

export async function testSmbShare(
  host: string,
  sharePath: string,
  username: string,
  password: string,
): Promise<{ ok: boolean; message: string; entriesSample?: string[] }> {
  const share = sharePath.replace(/^\/+/, '').split('/')[0] ?? sharePath;
  const domain = process.env.SMB_DOMAIN ?? '';

  const client = new SMB2({
    share: `\\\\${host}\\${share}`,
    domain,
    username,
    password,
    autoCloseTimeout: 5000,
  });

  try {
    const listed = await new Promise<string[]>((resolve, reject) => {
      client.readdir('\\', (error?: Error, files?: string[]) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(files ?? []);
      });
    });
    const sample = listed.slice(0, 8);
    return { ok: true, message: 'SMB read/list succeeded.', entriesSample: sample };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `SMB test failed: ${message.slice(0, 240)}` };
  }
  // autoCloseTimeout on client handles disconnect
}
