import { randomUUID } from 'node:crypto';
import { Worker } from '@temporalio/worker';
import type { searchHotels } from '../../apps/worker/src/workflows/search-hotels.workflow';
import { setTimeout as delay } from 'node:timers/promises';
import { CancelledFailure } from '@temporalio/common';
import { WorkflowFailedError } from '@temporalio/client';
import { Harness, eventually, search } from '../workflow/harness';

let harness: Harness;
beforeAll(async () => {
  harness = await Harness.create();
}, 60000);
afterAll(async () => {
  await harness?.env.teardown();
});

test.each(['A', 'B'] as const)(
  'W10 S08 %s exceeds five seconds: partial and physical abort',
  async (supplier) => {
    const s = await harness.scenario(
      supplier === 'A' ? 'very-slow' : 'normal',
      supplier === 'B' ? 'very-slow' : 'normal',
    );
    try {
      await s.worker.runUntil(async () => {
        const handle = await s.start();
        await eventually(() => s.requests.length === 2);
        const slow = s.requests.find((r) => r.supplier === supplier);
        expect(slow?.finished).toBeUndefined();
        const result = await handle.result();
        expect(result).toMatchObject({
          kind: 'result',
          partial: true,
          best: { supplier: supplier === 'A' ? 'B' : 'A' },
        });
        expect(supplier === 'A' ? result.a.status : result.b.status).toBe(
          'timed_out',
        );
        await eventually(
          () =>
            s.requests.every((r) => r.closed !== undefined) &&
            s.attempts.every((r) => r.settled !== undefined),
        );
        if (!slow?.closed) throw new Error('Missing HTTP abort evidence');
        expect(slow.finished).toBeUndefined();
        expect(slow.closed - slow.started).toBeGreaterThan(3500);
        expect(slow.closed - slow.started).toBeLessThan(7000); // never wait for the 8 s fixture
        expect(s.attempts.filter((r) => r.supplier === supplier)).toHaveLength(
          1,
        );
        const history = await handle.fetchHistory();
        expect(
          history.events?.some(
            (e) =>
              e.timerStartedEventAttributes?.startToFireTimeout?.seconds?.toString() ===
              '5',
          ),
        ).toBe(true);
        // Local HTTP cutoff and durable cancellation may win in either order.
        expect(
          history.events?.some(
            (e) =>
              e.timerFiredEventAttributes ||
              e.activityTaskFailedEventAttributes?.failure
                ?.applicationFailureInfo?.type === 'SupplierDeadline',
          ),
        ).toBe(true);
        console.log(
          'DEADLINE EVIDENCE',
          JSON.stringify({ requests: s.requests, attempts: s.attempts }),
        );
        expect(s.worker.getState()).toBe('RUNNING');
      });
    } finally {
      await s.close();
    }
  },
);

test.each([
  { name: 'W13 S11 timeout plus empty', a: 'hang', b: 'empty' },
  { name: 'W14 S12 both timeout', a: 'hang', b: 'hang' },
] as const)('$name', async (row) => {
  const s = await harness.scenario(row.a, row.b);
  try {
    await s.worker.runUntil(async () => {
      const handle = await s.start();
      const result = await handle.result();
      expect(result.kind).toBe('suppliers_unavailable');
      expect(result.a.status).toBe('timed_out');
      expect(result.b.status).toBe(row.b === 'hang' ? 'timed_out' : 'empty');
      await eventually(
        () =>
          s.requests.every((r) => r.closed !== undefined) &&
          s.attempts.every((r) => r.settled !== undefined),
      );
    });
  } finally {
    await s.close();
  }
});

test('W12 W18 S10 whole Workflow CANCELED, both HTTP requests abort, no retry, same worker healthy', async () => {
  // Barrier lets a subsequent normal search use this same production worker.
  const s = await harness.scenario('normal', 'normal', true);
  try {
    await s.worker.runUntil(async () => {
      const handle = await s.start();
      await eventually(() => s.requests.length === 2);
      expect(
        s.requests.every(
          (r) => r.finished === undefined && r.closed === undefined,
        ),
      ).toBe(true);
      const cancelledAt = Date.now();
      await handle.cancel();
      await expect(handle.result()).rejects.toBeInstanceOf(WorkflowFailedError);
      await expect(handle.result()).rejects.toMatchObject({
        cause: expect.any(CancelledFailure),
      });
      expect((await handle.describe()).status.name).toBe('CANCELLED');
      await eventually(
        () =>
          s.attempts.every((r) => r.settled !== undefined) &&
          s.requests.every((r) => r.closed !== undefined),
      );
      expect(s.attempts.every((r) => r.cancelled === true)).toBe(true);
      expect(s.requests.every((r) => r.finished === undefined)).toBe(true);
      expect(Date.now() - cancelledAt).toBeLessThan(3000); // before the local 5 s deadline
      await delay(1000);
      expect(s.attempts.map((r) => r.attempt)).toEqual([1, 1]);
      const history = await handle.fetchHistory();
      expect(
        history.events?.some((e) => e.workflowExecutionCanceledEventAttributes),
      ).toBe(true);
      expect(
        history.events?.filter(
          (e) => e.activityTaskCancelRequestedEventAttributes,
        ),
      ).toHaveLength(2);
      s.release(); // discard the closed requests; release next pair below
      const next = await s.start('Melbourne');
      await eventually(() => s.requests.length === 4);
      s.release();
      expect(await next.result()).toMatchObject({
        kind: 'result',
        best: { supplier: 'B' },
        partial: false,
      });
      expect(s.worker.getState()).toBe('RUNNING');
      console.log(
        'CANCELLATION EVIDENCE',
        JSON.stringify({
          status: (await handle.describe()).status.name,
          requests: s.requests.slice(0, 2),
          attempts: s.attempts.slice(0, 2),
        }),
      );
    });
  } finally {
    await s.close();
  }
});

test('W16 both delayed branches start before either is released', async () => {
  const s = await harness.scenario('delay', 'delay', true);
  try {
    await s.worker.runUntil(async () => {
      const handle = await s.start();
      await eventually(() => s.requests.length === 2);
      expect(s.requests.every((r) => r.finished === undefined)).toBe(true);
      const released = Date.now();
      s.release();
      expect(await handle.result()).toMatchObject({
        kind: 'result',
        partial: false,
      });
      expect(Date.now() - released).toBeLessThan(4500);
      console.log('CONCURRENCY EVIDENCE', JSON.stringify(s.requests));
    });
  } finally {
    await s.close();
  }
});

test('S15 simultaneous and repeated searches isolate attempts and outcomes', async () => {
  const s = await harness.scenario('fail-twice');
  try {
    await s.worker.runUntil(async () => {
      const handles = await Promise.all([
        s.start('Sydney'),
        s.start('Melbourne'),
        s.start('Perth'),
      ]);
      const results = await Promise.all(handles.map((h) => h.result()));
      expect(results).toMatchObject([
        { kind: 'result', best: { supplier: 'A', hotelId: 'SYD-A-101' } },
        { kind: 'result', best: { supplier: 'B', hotelId: 'MEL-B-201' } },
        { kind: 'result', best: { supplier: 'B', hotelId: 'PER-B-203' } },
      ]);
      for (const handle of handles)
        expect(
          s.attempts
            .filter(
              (r) => r.workflowId === handle.workflowId && r.supplier === 'A',
            )
            .map((r) => r.attempt),
        ).toEqual([1, 2, 3]);
      expect(await (await s.start()).result()).toMatchObject({
        kind: 'result',
        best: { supplier: 'A' },
      });
    });
  } finally {
    await s.close();
  }
});

test('five-second durable timers cancel queued Activities without an Activity worker', async () => {
  const taskQueue = `queued-${randomUUID()}`;
  const worker = await Worker.create({
    connection: harness.env.nativeConnection,
    taskQueue,
    workflowBundle: harness.bundle,
    enableNonLocalActivities: false,
  });
  await worker.runUntil(async () => {
    const handle = await harness.env.client.workflow.start<typeof searchHotels>(
      'searchHotels',
      {
        workflowId: `queued-${randomUUID()}`,
        taskQueue,
        args: [search],
        workflowExecutionTimeout: '15 seconds',
        retry: { maximumAttempts: 1 },
      },
    );
    expect(await handle.result()).toMatchObject({
      kind: 'suppliers_unavailable',
      a: { status: 'timed_out' },
      b: { status: 'timed_out' },
    });
    const history = await handle.fetchHistory();
    expect(
      history.events?.filter((e) => e.timerFiredEventAttributes),
    ).toHaveLength(2);
    expect(
      history.events?.filter(
        (e) => e.activityTaskCancelRequestedEventAttributes,
      ),
    ).toHaveLength(2);
    expect(
      history.events?.filter((e) => e.activityTaskStartedEventAttributes),
    ).toHaveLength(0);
    await Worker.runReplayHistory({ workflowBundle: harness.bundle }, history);
  });
});

test('retry waits and prior HTTP attempts consume the original total branch budget', async () => {
  const s = await harness.scenario('server-error', 'normal', true);
  try {
    await s.worker.runUntil(async () => {
      const handle = await s.start();
      await eventually(() => s.requests.length === 2);
      await delay(2200); // first attempt consumes part of the branch budget
      s.release();
      await eventually(() =>
        s.attempts.some((r) => r.supplier === 'A' && r.attempt === 2),
      );
      const result = await handle.result(); // hold second request until original deadline
      expect(result).toMatchObject({
        kind: 'result',
        partial: true,
        best: { supplier: 'B' },
        a: { status: 'timed_out' },
      });
      await eventually(
        () =>
          s.requests.every((r) => r.closed !== undefined) &&
          s.attempts.every((r) => r.settled !== undefined),
      );
      const a = s.attempts.filter((r) => r.supplier === 'A');
      expect(a.map((r) => r.attempt)).toEqual([1, 2]);
      expect(new Set(a.map((r) => r.deadline)).size).toBe(1);
      const [first, second] = a;
      if (!first || !second?.settled)
        throw new Error('Missing retry deadline evidence');
      expect(second.settled - first.started).toBeLessThan(6000);
      expect(second.settled - second.started).toBeLessThan(3000);
      const lastRequest = s.requests.find(
        (r) => r.supplier === 'A' && r.attempt === 2,
      );
      expect(lastRequest?.closed).toBeDefined();
      expect(lastRequest?.finished).toBeUndefined();
      console.log('RETRY BUDGET EVIDENCE', JSON.stringify(a));
    });
  } finally {
    await s.close();
  }
});
