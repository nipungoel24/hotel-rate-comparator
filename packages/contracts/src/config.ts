// Phase 1 infrastructure configuration; hotel contracts live in hotels.ts.
export const INFRASTRUCTURE_VERSION = 'phase-1';
export interface HealthResponse {
  status: 'ok';
  service: 'api' | 'suppliers';
}
export interface InfrastructureConfig {
  host: string;
  apiPort: number;
  suppliersPort: number;
  webPort: number;
  temporalAddress: string;
  namespace: string;
  taskQueue: string;
  temporalUiPort: number;
  supplierABaseUrl: string;
  supplierBBaseUrl: string;
}
export function readInfrastructureConfig(
  env: Record<string, string | undefined>,
): InfrastructureConfig {
  const text = (key: string, fallback: string): string => {
    const value = env[key] ?? fallback;
    if (!value.trim() || value !== value.trim())
      throw new Error(`Invalid ${key}`);
    return value;
  };
  const port = (key: string, fallback: number): number => {
    const value = text(key, String(fallback));
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
      throw new Error(`Invalid ${key}`);
    return Number(value);
  };
  const temporalAddress = text('TEMPORAL_ADDRESS', '127.0.0.1:7233');
  if (!/^[a-zA-Z0-9.-]+:\d+$/.test(temporalAddress))
    throw new Error('Invalid TEMPORAL_ADDRESS (host:port required)');
  const addressPort = Number(temporalAddress.split(':')[1]);
  if (addressPort < 1 || addressPort > 65535)
    throw new Error('Invalid TEMPORAL_ADDRESS port');
  const supplierUrl = (key: string): string => {
    const value = text(
      key,
      `http://${text('HOST', '127.0.0.1')}:${port('SUPPLIERS_PORT', 4001)}`,
    );
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error(`Invalid ${key}: HTTP(S) origin required`);
    }
    return url.origin;
  };
  return {
    host: text('HOST', '127.0.0.1'),
    apiPort: port('API_PORT', 3001),
    suppliersPort: port('SUPPLIERS_PORT', 4001),
    webPort: port('WEB_PORT', 5173),
    temporalAddress,
    namespace: text('TEMPORAL_NAMESPACE', 'default'),
    taskQueue: text('TEMPORAL_TASK_QUEUE', 'hotel-rate-comparator'),
    temporalUiPort: port('TEMPORAL_UI_PORT', 8233),
    supplierABaseUrl: supplierUrl('SUPPLIER_A_BASE_URL'),
    supplierBBaseUrl: supplierUrl('SUPPLIER_B_BASE_URL'),
  };
}
