import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { MockActivityEnvironment } from '@temporalio/testing';
import { ApplicationFailure, CancelledFailure } from '@temporalio/common';
import { createSupplierActivities } from '../../apps/worker/src/activities';
import { readInfrastructureConfig } from '@hotel/contracts';
import { search, eventually, closeServer } from '../workflow/harness';

let server: Server;
let baseUrl: string;
let status: number;
let body: string;
let mode: 'response' | 'hang' | 'body' | 'reset';
let received: number;
let closed: number;
let headers: Record<string, string | string[] | undefined>;
const valid = {
  hotels: [{ hotelId: 'h', name: 'Hotel', price: 99.95 }],
  currency: 'AUD',
  priceBasis: 'total_stay',
};
beforeEach(async () => {
  status = 200;
  body = JSON.stringify(valid);
  mode = 'response';
  received = 0;
  closed = 0;
  headers = {};
  server = createServer((req, res) => {
    received++;
    headers = req.headers;
    res.once('close', () => {
      if (!res.writableFinished) closed++;
    });
    if (mode === 'reset') {
      req.socket.destroy();
      return;
    }
    if (mode === 'hang') return;
    if (mode === 'body') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"hotels":');
      return;
    }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  await closeServer(server);
});
function run(
  env = new MockActivityEnvironment({ heartbeatTimeoutMs: 1000 }),
  deadline = Date.now() + 5000,
) {
  return env.run(
    createSupplierActivities({
      A: { baseUrl, headers: { 'x-supplier-attempt': '999' } },
      B: { baseUrl },
    }).fetchSupplier,
    { supplier: 'A' as const, search, deadlineEpochMs: deadline },
  );
}

test('normalizes validated inventory to integer cents and forwards actual Temporal attempt', async () => {
  expect(
    await run(
      new MockActivityEnvironment({ attempt: 3, heartbeatTimeoutMs: 1000 }),
    ),
  ).toEqual({
    status: 'success',
    supplier: 'A' as const,
    hotels: [
      { supplier: 'A' as const, hotelId: 'h', name: 'Hotel', priceMinor: 9995 },
    ],
  });
  expect(headers['x-supplier-attempt']).toBe('3');
  expect(received).toBe(1);
});
test('empty is a successful result', async () => {
  body = JSON.stringify({ ...valid, hotels: [] });
  expect(await run()).toEqual({ status: 'empty', supplier: 'A' });
});
test.each([408, 429, 500, 502, 503])(
  'HTTP %i is retryable; one HTTP call per invocation',
  async (code) => {
    status = code;
    await expect(run()).rejects.toMatchObject({
      type: 'SupplierHttpError',
      nonRetryable: false,
      details: [code],
    });
    expect(received).toBe(1);
  },
);
test.each([400, 401, 403, 404])('HTTP %i is non-retryable', async (code) => {
  status = code;
  await expect(run()).rejects.toMatchObject({
    type: 'SupplierHttpError',
    nonRetryable: true,
  });
});
test.each([
  'not json',
  JSON.stringify({ ...valid, currency: 'USD' }),
  JSON.stringify({ ...valid, priceBasis: 'per_night' }),
  JSON.stringify({
    ...valid,
    hotels: [{ hotelId: 'h', name: 'Hotel', price: -1 }],
  }),
  JSON.stringify({ ...valid, hotels: 'bad' }),
])(
  'S14 bad JSON/schema/currency/price is non-retryable: %s',
  async (invalid) => {
    body = invalid;
    await expect(run()).rejects.toMatchObject({
      type: 'SupplierInvalidResponse',
      nonRetryable: true,
    });
  },
);
test('connection reset remains a retryable transport failure', async () => {
  mode = 'reset';
  await expect(run()).rejects.toMatchObject({
    type: 'SupplierNetworkError',
    nonRetryable: false,
  });
  expect(received).toBe(1);
});
test('expired attempt does not open an HTTP request', async () => {
  await expect(run(undefined, Date.now() - 1)).rejects.toMatchObject({
    type: 'SupplierDeadline',
    nonRetryable: true,
  });
  expect(received).toBe(0);
});
test.each(['hang', 'body'] as const)(
  'deadline abort covers pending %s and releases heartbeat interval',
  async (value) => {
    mode = value;
    const env = new MockActivityEnvironment({ heartbeatTimeoutMs: 1000 });
    let heartbeats = 0;
    env.on('heartbeat', () => heartbeats++);
    await expect(run(env, Date.now() + 800)).rejects.toMatchObject({
      type: 'SupplierDeadline',
      nonRetryable: true,
    });
    await eventually(() => closed === 1);
    expect(heartbeats).toBeGreaterThanOrEqual(2);
    const count = heartbeats;
    await delay(600);
    expect(heartbeats).toBe(count);
  },
);
test.each(['hang', 'body'] as const)(
  'Temporal cancellation aborts %s and stops heartbeats',
  async (value) => {
    mode = value;
    const env = new MockActivityEnvironment({ heartbeatTimeoutMs: 1000 });
    let heartbeats = 0;
    env.on('heartbeat', () => heartbeats++);
    const pending = run(env);
    const assertion = expect(pending).rejects.toBeInstanceOf(CancelledFailure);
    await eventually(() => received === 1);
    await delay(300);
    env.cancel();
    await assertion;
    await eventually(() => closed === 1);
    const count = heartbeats;
    await delay(600);
    expect(heartbeats).toBe(count);
    expect(received).toBe(1);
  },
);
test('already-cancelled context performs no HTTP call', async () => {
  const env = new MockActivityEnvironment({ heartbeatTimeoutMs: 1000 });
  env.cancel();
  await expect(run(env)).rejects.toBeInstanceOf(CancelledFailure);
  expect(received).toBe(0);
});
test('invalid search is non-retryable before HTTP', async () => {
  const env = new MockActivityEnvironment({ heartbeatTimeoutMs: 1000 });
  const activities = createSupplierActivities({
    A: { baseUrl },
    B: { baseUrl },
  });
  await expect(
    env.run(activities.fetchSupplier, {
      supplier: 'A' as const,
      search: { ...search, city: '' },
      deadlineEpochMs: Date.now() + 5000,
    }),
  ).rejects.toBeInstanceOf(ApplicationFailure);
  expect(received).toBe(0);
});
test('supplier origins follow environment conventions and reject unsupported configuration', () => {
  expect(
    readInfrastructureConfig({ HOST: '127.0.0.1', SUPPLIERS_PORT: '4567' })
      .supplierABaseUrl,
  ).toBe('http://127.0.0.1:4567');
  expect(
    readInfrastructureConfig({ SUPPLIER_A_BASE_URL: 'https://example.com' })
      .supplierABaseUrl,
  ).toBe('https://example.com');
  for (const value of [
    'file:///tmp',
    'http://user:password@example.com',
    'http://example.com/path',
  ]) {
    expect(() =>
      readInfrastructureConfig({ SUPPLIER_A_BASE_URL: value }),
    ).toThrow();
  }
  expect(() =>
    createSupplierActivities({ A: { baseUrl: 'file:///tmp' }, B: { baseUrl } }),
  ).toThrow();
});
