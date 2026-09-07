import http from 'node:http';
import type { ClientRequest } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import type { Express } from 'express';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import { Client, WorkflowFailedError } from '@temporalio/client';
import {
  ApplicationFailure,
  CancelledFailure,
  RetryState,
  TimeoutFailure,
  TimeoutType,
} from '@temporalio/common';
import { createApp } from '../../apps/api/src/app';
import type {
  SearchWorkflowGateway,
  WorkflowHandleLike,
} from '../../apps/api/src/services/search-service';
import type { HotelOffer, SearchOutcome, SupplierOutcome } from '@hotel/domain';
import type { SearchRequest } from '@hotel/contracts';

const FIXED_TODAY = '2030-10-01';
const validSearch = {
  city: 'Sydney',
  checkIn: '2030-10-12',
  checkOut: '2030-10-15',
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function eventually(check: () => boolean, timeout = 3000): Promise<void> {
  const until = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= until)
      throw new Error('Expected observable condition did not occur');
    await delay(25);
  }
}

class FakeHandle implements WorkflowHandleLike {
  readonly workflowId: string;
  readonly resultDeferred = deferred<SearchOutcome>();
  cancelCalls = 0;
  constructor(workflowId: string) {
    this.workflowId = workflowId;
  }
  result(): Promise<SearchOutcome> {
    return this.resultDeferred.promise;
  }
  cancel(): Promise<void> {
    this.cancelCalls += 1;
    return Promise.resolve();
  }
}

class FakeGateway implements SearchWorkflowGateway {
  readonly started: { workflowId: string; search: SearchRequest }[] = [];
  readonly handles: FakeHandle[] = [];
  readonly pendingStarts: Deferred<WorkflowHandleLike>[] = [];
  manual = false;
  failWith: unknown;
  start(input: {
    workflowId: string;
    search: SearchRequest;
  }): Promise<WorkflowHandleLike> {
    this.started.push({ workflowId: input.workflowId, search: input.search });
    const handle = new FakeHandle(input.workflowId);
    this.handles.push(handle);
    if (this.failWith !== undefined) return Promise.reject(this.failWith);
    if (this.manual) {
      const gate = deferred<WorkflowHandleLike>();
      this.pendingStarts.push(gate);
      return gate.promise;
    }
    return Promise.resolve(handle);
  }
}

function makeApp(gateway: FakeGateway): Express {
  return createApp({
    client: new Client({ namespace: 'default' }),
    taskQueue: 'api-focus-tests',
    gateway,
    today: () => FIXED_TODAY,
  });
}

// SuperTest is lazily executed when awaited; this starts the request
// immediately so controlled fakes can be sequenced against it.
function postEager(app: Express, body: unknown): Promise<SupertestResponse> {
  const result = deferred<SupertestResponse>();
  request(app)
    .post('/api/search-hotels')
    .set('content-type', 'application/json')
    .send(body as object)
    .end((error, response) => {
      if (error) result.reject(error);
      else result.resolve(response);
    });
  return result.promise;
}

function offer(
  supplier: 'A' | 'B',
  hotelId: string,
  name: string,
  priceMinor: number,
): HotelOffer {
  return { supplier, hotelId, name, priceMinor };
}

function successOutcome(
  best: HotelOffer,
  partial: boolean,
  a: SupplierOutcome,
  b: SupplierOutcome,
): SearchOutcome {
  return { kind: 'result', best, partial, a, b };
}

const aSuccess: SupplierOutcome = {
  status: 'success',
  supplier: 'A',
  hotels: [
    offer('A', 'SYD-A-101', 'Circular Quay Hotel', 12000),
    offer('A', 'SYD-A-102', 'Park Plaza Sydney', 18999),
  ],
};
const bSuccess: SupplierOutcome = {
  status: 'success',
  supplier: 'B',
  hotels: [offer('B', 'SYD-B-201', 'Bridge Suites', 15000)],
};
const sydneyABest = offer('A', 'SYD-A-101', 'Circular Quay Hotel', 12000);

async function expectValidationError(
  response: SupertestResponse,
  field: string,
): Promise<void> {
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    status: 'error',
    code: 'VALIDATION_ERROR',
  });
  expect(
    response.body.fields.some(
      (entry: { field: string }) => entry.field === field,
    ),
  ).toBe(true);
}

async function listen(
  app: Express,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  return {
    port: address.port,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

interface NativePost {
  req: ClientRequest;
  response: Promise<{ status: number; body: unknown }>;
}
function postNative(port: number, body: unknown): NativePost {
  const response = deferred<{ status: number; body: unknown }>();
  const req = http.request(
    {
      host: '127.0.0.1',
      port,
      path: '/api/search-hotels',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    },
    (message) => {
      const chunks: Buffer[] = [];
      message.on('data', (chunk: Buffer) => chunks.push(chunk));
      message.on('end', () => {
        try {
          response.resolve({
            status: message.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        } catch {
          response.resolve({
            status: message.statusCode ?? 0,
            body: undefined,
          });
        }
      });
    },
  );
  req.on('error', (error) => response.reject(error));
  req.end(JSON.stringify(body));
  return { req, response: response.promise };
}

describe('POST /api/search-hotels focused behaviour', () => {
  let unhandled: unknown[];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  beforeAll(() => {
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
  });
  afterAll(() => {
    process.removeListener('unhandledRejection', onUnhandled);
  });

  test('health endpoint remains available', async () => {
    const gateway = new FakeGateway();
    const response = await request(makeApp(gateway)).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'api' });
  });

  test('A01 success maps a complete Supplier A result', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const pending = postEager(app, validSearch);
    await eventually(() => gateway.handles.length === 1);
    const handle = gateway.handles[0];
    if (!handle) throw new Error('missing handle');
    handle.resultDeferred.resolve(
      successOutcome(sydneyABest, false, aSuccess, bSuccess),
    );
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'success',
      searchId: expect.stringMatching(/^hotel-search-[0-9a-f-]{36}$/),
      bestOffer: {
        hotelId: 'SYD-A-101',
        name: 'Circular Quay Hotel',
        supplier: 'A',
        price: 120,
        priceMinor: 12000,
        currency: 'AUD',
        priceBasis: 'total_stay',
      },
      partial: false,
      suppliers: {
        a: { status: 'success', supplier: 'A' },
        b: { status: 'success', supplier: 'B' },
      },
    });
    expect(gateway.started).toHaveLength(1);
    expect(gateway.started[0]?.search).toEqual(validSearch);
    expect(gateway.started[0]?.workflowId).toBe(response.body.searchId);
  });

  test.each([
    {
      name: 'A02 B cheaper',
      best: offer('B', 'MEL-B-201', 'Bridge Suites', 13000),
      expectedSupplier: 'B',
    },
    {
      name: 'A03 equal rate still selects A',
      best: offer('A', 'BNE-A-101', 'Riverside', 15000),
      expectedSupplier: 'A',
    },
    {
      name: 'A04 A fails, B partial',
      best: offer('B', 'SYD-B-201', 'Bridge Suites', 15000),
      expectedSupplier: 'B',
      partial: true,
      a: { status: 'failed', supplier: 'A', code: 'server_error' } as const,
    },
    {
      name: 'A07 A times out, B partial',
      best: offer('B', 'SYD-B-201', 'Bridge Suites', 15000),
      expectedSupplier: 'B',
      partial: true,
      a: { status: 'timed_out', supplier: 'A' } as const,
    },
  ])('$name', async (row) => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const pending = postEager(app, validSearch);
    await eventually(() => gateway.handles.length === 1);
    const handle = gateway.handles[0];
    if (!handle) throw new Error('missing handle');
    handle.resultDeferred.resolve(
      successOutcome(
        row.best,
        row.partial ?? false,
        row.a ?? aSuccess,
        bSuccess,
      ),
    );
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.bestOffer.supplier).toBe(row.expectedSupplier);
    expect(response.body.partial).toBe(row.partial ?? false);
    if (row.a) expect(response.body.suppliers.a).toEqual(row.a);
  });

  test('A05 suppliers unavailable maps to 502', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const pending = postEager(app, validSearch);
    await eventually(() => gateway.handles.length === 1);
    const handle = gateway.handles[0];
    if (!handle) throw new Error('missing handle');
    handle.resultDeferred.resolve({
      kind: 'suppliers_unavailable',
      a: { status: 'failed', supplier: 'A', code: 'server_error' },
      b: { status: 'failed', supplier: 'B', code: 'server_error' },
    });
    const response = await pending;
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      status: 'error',
      code: 'SUPPLIERS_UNAVAILABLE',
      searchId: expect.any(String),
    });
    expect(response.body.message).toContain('supplier');
  });

  test('A06 both empty maps to 200 empty', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const pending = postEager(app, validSearch);
    await eventually(() => gateway.handles.length === 1);
    const handle = gateway.handles[0];
    if (!handle) throw new Error('missing handle');
    handle.resultDeferred.resolve({
      kind: 'no_hotels',
      a: { status: 'empty', supplier: 'A' },
      b: { status: 'empty', supplier: 'B' },
    });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'empty',
      message: 'No hotels found',
      searchId: expect.stringMatching(/^hotel-search-[0-9a-f-]{36}$/),
    });
  });

  test.each([
    {
      name: 'V01 missing city',
      body: { checkIn: '2030-10-12', checkOut: '2030-10-15' },
      field: 'city',
    },
    {
      name: 'V02 blank city',
      body: { ...validSearch, city: '  ' },
      field: 'city',
    },
    {
      name: 'V03 missing check-in',
      body: { city: 'Sydney', checkOut: '2030-10-15' },
      field: 'checkIn',
    },
    {
      name: 'V04 missing check-out',
      body: { city: 'Sydney', checkIn: '2030-10-12' },
      field: 'checkOut',
    },
    {
      name: 'V05 malformed date',
      body: { ...validSearch, checkIn: 'not-a-date' },
      field: 'checkIn',
    },
    {
      name: 'V06 check-out not after check-in',
      body: { ...validSearch, checkOut: '2030-10-12' },
      field: 'checkOut',
    },
    {
      name: 'check-in before today is rejected',
      body: { ...validSearch, checkIn: '2029-12-31' },
      field: 'checkIn',
    },
    {
      name: 'V07 public scenario controls are rejected',
      body: { ...validSearch, scenario: 'hang' },
      field: 'body',
    },
  ])('$name starts no workflow', async (row) => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const response = await request(app)
      .post('/api/search-hotels')
      .send(row.body);
    await expectValidationError(response, row.field);
    expect(gateway.started).toHaveLength(0);
  });

  test('malformed JSON body maps to a safe validation error', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const response = await request(app)
      .post('/api/search-hotels')
      .set('content-type', 'application/json')
      .send('{not json');
    await expectValidationError(response, 'body');
    expect(gateway.started).toHaveLength(0);
  });

  test('every valid search receives a distinct workflow id', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    for (let index = 0; index < 3; index += 1) {
      const pending = postEager(app, validSearch);
      await eventually(() => gateway.handles.length === index + 1);
      const handle = gateway.handles[index];
      if (!handle) throw new Error('missing handle');
      handle.resultDeferred.resolve(
        successOutcome(sydneyABest, false, aSuccess, bSuccess),
      );
      const response = await pending;
      expect(response.status).toBe(200);
    }
    const ids = gateway.started.map((call) => call.workflowId);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^hotel-search-[0-9a-f-]{36}$/);
  });

  test('C03 a normal successful request never cancels the workflow', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const pending = postEager(app, validSearch);
    await eventually(() => gateway.handles.length === 1);
    const handle = gateway.handles[0];
    if (!handle) throw new Error('missing handle');
    handle.resultDeferred.resolve(
      successOutcome(sydneyABest, false, aSuccess, bSuccess),
    );
    const response = await pending;
    expect(response.status).toBe(200);
    await delay(100); // allow the normal socket lifecycle to fully settle
    expect(handle.cancelCalls).toBe(0);
  });

  test('workflow execution timeout maps to 504 SEARCH_TIMEOUT', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const pending = postEager(app, validSearch);
    await eventually(() => gateway.handles.length === 1);
    const handle = gateway.handles[0];
    if (!handle) throw new Error('missing handle');
    handle.resultDeferred.reject(
      new WorkflowFailedError(
        'workflow failed',
        new TimeoutFailure(
          'Workflow execution timed out',
          undefined,
          TimeoutType.START_TO_CLOSE,
        ),
        RetryState.RETRY_POLICY_NOT_SET,
      ),
    );
    const response = await pending;
    expect(response.status).toBe(504);
    expect(response.body).toMatchObject({
      status: 'error',
      code: 'SEARCH_TIMEOUT',
    });
    expect(handle.cancelCalls).toBe(0);
  });

  test('unexpected workflow failure maps to 500 without leaking internals', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const pending = postEager(app, validSearch);
    await eventually(() => gateway.handles.length === 1);
    const handle = gateway.handles[0];
    if (!handle) throw new Error('missing handle');
    handle.resultDeferred.reject(
      new WorkflowFailedError(
        'workflow failed',
        ApplicationFailure.create({ message: 'secret defect', type: 'Defect' }),
        RetryState.RETRY_POLICY_NOT_SET,
      ),
    );
    const response = await pending;
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      searchId: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain('secret defect');
  });

  test('live-connection cancellation is mapped to 500, not a supplier outcome', async () => {
    const gateway = new FakeGateway();
    const app = makeApp(gateway);
    const pending = postEager(app, validSearch);
    await eventually(() => gateway.handles.length === 1);
    const handle = gateway.handles[0];
    if (!handle) throw new Error('missing handle');
    handle.resultDeferred.reject(
      new WorkflowFailedError(
        'workflow failed',
        new CancelledFailure('Workflow canceled'),
        RetryState.RETRY_POLICY_NOT_SET,
      ),
    );
    const response = await pending;
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('INTERNAL_ERROR');
    expect(response.body.code).not.toBe('SUPPLIERS_UNAVAILABLE');
  });

  test('workflow submission failure maps to 503 SEARCH_SERVICE_UNAVAILABLE', async () => {
    const gateway = new FakeGateway();
    gateway.failWith = new Error('14 UNAVAILABLE: connection refused');
    const app = makeApp(gateway);
    const response = await request(app)
      .post('/api/search-hotels')
      .send(validSearch);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'error',
      code: 'SEARCH_SERVICE_UNAVAILABLE',
    });
  });

  test('C02 disconnect while start is pending cancels exactly once when the handle arrives', async () => {
    const gateway = new FakeGateway();
    gateway.manual = true;
    const app = makeApp(gateway);
    const listener = await listen(app);
    try {
      const client = postNative(listener.port, validSearch);
      client.response.catch(() => undefined); // the request is abandoned
      await eventually(() => gateway.started.length === 1);
      expect(gateway.handles[0]?.cancelCalls).toBe(0);
      client.req.destroy(); // real client disconnect before start resolves
      await delay(50);
      const handle = gateway.handles[0];
      if (!handle) throw new Error('missing handle');
      expect(handle.cancelCalls).toBe(0);
      gateway.pendingStarts[0]?.resolve(handle); // start finally resolves
      await delay(100);
      expect(handle.cancelCalls).toBe(1);
      // settle the observed result so nothing stays pending
      handle.resultDeferred.reject(
        new WorkflowFailedError(
          'workflow canceled',
          new CancelledFailure('Workflow canceled'),
          RetryState.RETRY_POLICY_NOT_SET,
        ),
      );
      await delay(50);
      expect(unhandled).toHaveLength(0);
    } finally {
      await listener.close();
    }
  });

  test('C04 disconnect before a failed start resolves performs no cancel and no unhandled rejection', async () => {
    const gateway = new FakeGateway();
    gateway.manual = true;
    const app = makeApp(gateway);
    const listener = await listen(app);
    try {
      const client = postNative(listener.port, validSearch);
      client.response.catch(() => undefined);
      await eventually(() => gateway.started.length === 1);
      client.req.destroy();
      await delay(50);
      gateway.pendingStarts[0]?.reject(
        new Error('12 UNIMPLEMENTED: server down'),
      );
      await delay(100);
      expect(gateway.handles[0]?.cancelCalls).toBe(0);
      expect(unhandled).toHaveLength(0);
    } finally {
      await listener.close();
    }
  });

  test('C05 overlapping disconnect and completion paths issue at most one cancellation', async () => {
    const gateway = new FakeGateway();
    gateway.manual = true;
    const app = makeApp(gateway);
    const listener = await listen(app);
    try {
      const client = postNative(listener.port, validSearch);
      client.response.catch(() => undefined);
      await eventually(() => gateway.started.length === 1);
      const handle = gateway.handles[0];
      if (!handle) throw new Error('missing handle');
      // resolve start, then disconnect while the route awaits the result
      gateway.pendingStarts[0]?.resolve(handle);
      await delay(50);
      client.req.destroy();
      await delay(100);
      expect(handle.cancelCalls).toBe(1);
      handle.resultDeferred.reject(
        new WorkflowFailedError(
          'workflow canceled',
          new CancelledFailure('Workflow canceled'),
          RetryState.RETRY_POLICY_NOT_SET,
        ),
      );
      await delay(100);
      expect(handle.cancelCalls).toBe(1);
      expect(unhandled).toHaveLength(0);
    } finally {
      await listener.close();
    }
  });

  test('concurrent requests keep separate handles; one disconnect does not cancel the other', async () => {
    const gateway = new FakeGateway();
    gateway.manual = true;
    const app = makeApp(gateway);
    const listener = await listen(app);
    try {
      const first = postNative(listener.port, validSearch);
      first.response.catch(() => undefined);
      const second = postNative(listener.port, {
        ...validSearch,
        city: 'Melbourne',
      });
      await eventually(() => gateway.started.length === 2);
      const handleOne = gateway.handles[0];
      const handleTwo = gateway.handles[1];
      if (!handleOne || !handleTwo) throw new Error('missing handles');
      gateway.pendingStarts[0]?.resolve(handleOne);
      await delay(20);
      first.req.destroy(); // disconnect the first search only
      await delay(100);
      // complete the second search normally
      gateway.pendingStarts[1]?.resolve(handleTwo);
      await delay(20);
      handleTwo.resultDeferred.resolve(
        successOutcome(
          offer('B', 'MEL-B-201', 'Bridge Suites', 13000),
          false,
          aSuccess,
          bSuccess,
        ),
      );
      const secondResponse = await second.response;
      expect(secondResponse.status).toBe(200);
      expect(handleOne.cancelCalls).toBe(1);
      expect(handleTwo.cancelCalls).toBe(0);
      expect(gateway.started[0]?.workflowId).not.toBe(
        gateway.started[1]?.workflowId,
      );
      handleOne.resultDeferred.reject(
        new WorkflowFailedError(
          'workflow canceled',
          new CancelledFailure('Workflow canceled'),
          RetryState.RETRY_POLICY_NOT_SET,
        ),
      );
      await delay(50);
      expect(unhandled).toHaveLength(0);
    } finally {
      await listener.close();
    }
  });
});
