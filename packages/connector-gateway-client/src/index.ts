export type ConnectorGatewayConfig = {
  baseUrl: string;
  token: string;
};

export type GatewayTestResult = {
  ok: boolean;
  message: string;
  entriesSample?: string[];
};

export type GatewayMountResult = {
  ok: boolean;
  message: string;
  mountPath?: string;
  mountGeneration?: number;
};

export type GatewayStatusResult = {
  mounted: boolean;
  mountPath?: string;
  mountGeneration?: number;
  message: string;
};

async function gatewayFetch<T>(
  config: ConnectorGatewayConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { detail?: string };
  if (!response.ok) {
    throw new Error((body as { detail?: string }).detail ?? `Gateway error ${response.status}`);
  }
  return body;
}

export function createConnectorGatewayClient(config: ConnectorGatewayConfig) {
  return {
    async setCredentials(connectorId: string, username: string, password: string): Promise<void> {
      await gatewayFetch(config, `/internal/v1/connectors/${connectorId}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    },

    async testSmb(connectorId: string, host: string, exportPath: string): Promise<GatewayTestResult> {
      return gatewayFetch(config, `/internal/v1/connectors/${connectorId}/test`, {
        method: 'POST',
        body: JSON.stringify({ protocol: 'smb', host, exportPath }),
      });
    },

    async mount(
      connectorId: string,
      input: { protocol: string; host: string; exportPath: string; generation: number },
    ): Promise<GatewayMountResult> {
      return gatewayFetch(config, `/internal/v1/connectors/${connectorId}/mount`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async unmount(connectorId: string): Promise<GatewayMountResult> {
      return gatewayFetch(config, `/internal/v1/connectors/${connectorId}/unmount`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },

    async status(connectorId: string): Promise<GatewayStatusResult> {
      return gatewayFetch(config, `/internal/v1/connectors/${connectorId}/status`, { method: 'GET' });
    },
  };
}
