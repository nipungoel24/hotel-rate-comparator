import { Client, Connection } from '@temporalio/client';
import type { InfrastructureConfig } from '@hotel/contracts';

export async function connectTemporal(
  config: InfrastructureConfig,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const connection = await Connection.connect({
    address: config.temporalAddress,
    connectTimeout: '5 seconds',
  });
  const client = new Client({ connection, namespace: config.namespace });
  return { client, close: () => connection.close() };
}
